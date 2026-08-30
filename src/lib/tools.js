// Tool definitions and their executors.
//
// The tools write to Supabase, so they run on the client — api/chat.js is a
// pass-through and never touches the database. App.jsx owns the loop.
//
// Descriptions are deliberately prescriptive about *when* to call each tool, not
// just what it does. Models are conservative about reaching for tools, and the
// trigger condition is what drives whether they actually get called.
//
// Note: most of this writes a reviewable row rather than a live one.
// Recommendations land as 'pending' and journal entries as 'draft'; the user
// confirms them in the UI. That's why the descriptions tell the agent to save
// liberally — a wrong save is one tap to undo, whereas a missed one is lost.
//
// add_activity and add_packing_item are the two exceptions, for the same reason:
// there is no meaningful "pending" state for either. A booked time is booked,
// and an unticked checkbox is already its own review. Both are visibly
// attributed in the UI and removable in one tap.

import { supabase } from './supabase'
import { PACKING_CATEGORIES, categoryLabel } from './packing'
import { addPackingItem } from './trip-data'

export const TOOLS = [
  {
    name: 'save_recommendation',
    description: `Save a place, restaurant, activity, or day trip so it isn't lost.

Call this whenever somewhere specific comes up as a possibility — the user relays a recommendation from a friend, asks you about a place, or you suggest one yourself. Call it as part of answering, not instead of answering.

Examples:
- "Someone recommended Stiftskeller St. Peter for dinner" → save it, source "a friend"
- "What about the Hellbrunn trick fountains?" → save it, they're clearly interested
- You suggest Café Tomaselli in a day plan → save it too

Saved items go to a review list, so it's better to save something the user later discards than to lose it. Don't ask permission first, and don't save a place that was explicitly rejected.`,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the place, e.g. "Café Tomaselli"' },
        category: {
          type: 'string',
          enum: ['food', 'activity', 'day-trip', 'accommodation', 'other'],
          description: 'day-trip means it needs most of a day and travel out of Salzburg',
        },
        source: {
          type: 'string',
          description: 'Where it came from — a person\'s name, "a friend", or "agent suggestion" if you proposed it',
        },
        location: { type: 'string', description: 'Address or area, if known' },
        notes: {
          type: 'string',
          description: 'One line on why it is worth saving, and anything toddler-relevant (high chairs, stroller access, shade)',
        },
      },
      required: ['name', 'category'],
    },
  },

  {
    name: 'save_learning',
    description: `Record something durable about how this family travels, so future suggestions account for it.

Call this when the user reveals a preference, constraint, or reaction that should still matter next week — not for one-off facts about a single day.

Examples:
- "Amir loved the splash pad" → type "liked", tag "water-play"
- "That restaurant had no high chair, annoying" → type "requirement", tag "high-chair"
- "We were exhausted after two activities before lunch" → type "constraint", tag "pacing"

Save the general lesson, not the specific incident: "verify high chairs before recommending restaurants" is useful later, "Bärenwirt had no high chair" is not. If a learning contradicts one you already have, save the new one — the newer signal wins.`,
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['liked', 'disliked', 'requirement', 'constraint', 'preference'],
          description: 'requirement = must always be checked; constraint = a hard limit on planning',
        },
        tag: { type: 'string', description: 'Short kebab-case topic, e.g. "high-chair", "pacing", "water-play"' },
        note: { type: 'string', description: 'The lesson, phrased so it is actionable next time' },
        source_message: { type: 'string', description: 'The user message that prompted this' },
      },
      required: ['type', 'tag', 'note'],
    },
  },

  {
    name: 'log_journal_entry',
    description: `Draft the journal entry for a day the family has already had.

Call this when the user describes how a day went — what they did, how it landed, how tired everyone was. One entry per date; calling it again for the same date replaces that day's draft.

Example: "Today was great, the Sound of Music tour was a 4/5 but Amir was wiped by 2pm" → date today, what_we_did the tour, rating 4, energy_level low.

The entry is saved as a draft for the user to edit or keep — it does not become part of the trip record until they confirm. Only call this for days that have happened; use add_activity for future plans.`,
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD. The day being described, which is usually today.' },
        what_we_did: { type: 'string', description: 'What actually happened, in a sentence or two' },
        notes: { type: 'string', description: 'Anything worth remembering that is not covered above' },
        rating: { type: 'integer', description: 'How good the day was overall, 1 to 5' },
        energy_level: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'How the family finished the day',
        },
        want_more_of: { type: 'string', description: 'What they said they want more of' },
        want_less_of: { type: 'string', description: 'What they said they want less of' },
      },
      required: ['date'],
    },
  },

  {
    name: 'add_activity',
    description: `Pin something to a specific date because it is booked, reserved, or firmly decided.

Call this only when it is actually fixed — tickets bought, a table reserved, or the user says a plan is settled. Anything still under consideration belongs in save_recommendation instead.

Examples:
- "I booked the funicular for Saturday 9am" → add it
- "Let's definitely do Hallstatt on Monday" → add it
- "Maybe Hallstatt at some point?" → that's a recommendation, not an activity

Unlike recommendations, this goes straight into the itinerary and the user sees it on their agenda, so don't guess at a date. Ask if you don't know it.`,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What it is, e.g. "Hohensalzburg funicular"' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM, 24-hour, if there is a set time' },
        location: { type: 'string', description: 'Where to be' },
        notes: { type: 'string', description: 'Booking reference, what to bring, travel time' },
      },
      required: ['name', 'date'],
    },
  },

  {
    name: 'add_packing_item',
    description: `Add something to the packing list.

Call this whenever the conversation turns up a thing they'll need to bring — you suggested it, they realised it, or a plan you just made implies it. Read the packing strategy in your context first: the list is already built around six days of clothes and a mid-trip laundry, so don't re-add what's there.

Examples:
- "we should bring hand warmers for the Kitzsteinhorn day" → add it under hiking-gear
- you recommend a spa afternoon and notice nobody has flip-flops → add them
- "remind me to pack the good camera" → add it, don't just say you'll remember

Pick the category the item actually belongs to, not the person who mentioned it: shared hiking kit is hiking-gear even if Ori asked. Amir's things have their own three categories. Anything going in hand luggage is carry-on.

This goes straight onto the list rather than waiting for review, so add one item per call and keep the name short and concrete — it has to read as a checkbox on a phone. It's marked as added by you and it's one tap to remove, so err towards adding.`,
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The item as it should read on the checklist, e.g. "Hand warmers x 4"',
        },
        category: {
          type: 'string',
          enum: PACKING_CATEGORIES.map(c => c.id),
          description: 'Which section of the list it belongs in',
        },
      },
      required: ['name', 'category'],
    },
  },
]

// Each executor returns the string sent back to the model as the tool result.
// Throwing here is fine — App.jsx catches it and returns an error tool_result so
// the model can adapt rather than the whole turn failing.
const EXECUTORS = {
  async save_recommendation(input) {
    const { error } = await supabase.from('recommendations').insert({
      name: input.name,
      category: input.category,
      source: input.source ?? null,
      location: input.location ?? null,
      notes: input.notes ?? null,
      // status defaults to 'pending' — never write 'kept' from a tool.
    })
    if (error) throw new Error(`Could not save recommendation: ${error.message}`)
    return `Saved "${input.name}" to the review list. Tell the user it's saved; they'll confirm it later.`
  },

  async save_learning(input) {
    const { error } = await supabase.from('learnings').insert({
      type: input.type,
      tag: input.tag,
      note: input.note,
      source_message: input.source_message ?? null,
    })
    if (error) throw new Error(`Could not save learning: ${error.message}`)
    return `Noted: [${input.type}] ${input.tag}. This will inform future suggestions.`
  },

  async log_journal_entry(input) {
    // journal.date is unique — one entry per day, so re-logging replaces it.
    const { error } = await supabase
      .from('journal')
      .upsert(
        {
          date: input.date,
          what_we_did: input.what_we_did ?? null,
          notes: input.notes ?? null,
          rating: input.rating ?? null,
          energy_level: input.energy_level ?? null,
          want_more_of: input.want_more_of ?? null,
          want_less_of: input.want_less_of ?? null,
          // status defaults to 'draft' — the user edits or keeps it.
        },
        { onConflict: 'date' },
      )
    if (error) throw new Error(`Could not save journal entry: ${error.message}`)
    return `Drafted the journal entry for ${input.date}. It's waiting for the user to edit or keep.`
  },

  async add_activity(input) {
    const { error } = await supabase.from('activities').insert({
      name: input.name,
      date: input.date,
      time: input.time ?? null,
      location: input.location ?? null,
      notes: input.notes ?? null,
    })
    if (error) throw new Error(`Could not add activity: ${error.message}`)
    return `Added "${input.name}" to ${input.date}${input.time ? ` at ${input.time}` : ''}.`
  },

  // added_by: 'agent' is what puts the "Added by the agent" line on the row, so
  // nothing you write here appears as though it was always on the list.
  async add_packing_item(input) {
    const row = await addPackingItem({
      name: input.name,
      category: input.category,
      addedBy: 'agent',
    })
    return `Added "${row.name}" to the ${categoryLabel(row.category)} section of the packing list. Tell the user it's on there.`
  },
}

export async function executeTool(name, input) {
  const executor = EXECUTORS[name]
  if (!executor) throw new Error(`Unknown tool: ${name}`)
  return executor(input)
}
