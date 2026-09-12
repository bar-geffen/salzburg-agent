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
// there is no meaningful "pending" state for either. A dated plan is a decision
// the travellers have already taken, and an unticked checkbox is already its own
// review. Both are visibly attributed in the UI and removable in one tap.
//
// Three of these tools exist to change what an earlier one wrote:
// update_activity, cancel_activity and remove_trip_fact. Without them the trip
// record only ever grows -- a plan that moved leaves two rows, and the note
// saying a leg is unbooked outlives the booking. Every turn rebuilds the prompt
// from these tables, so a stale row is not clutter, it is the agent being wrong
// out loud on every future message.

import { supabase } from './supabase'
import { formatDay, formatRange } from './dates'
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

Saved items go to a review list, so it's better to save something the user later discards than to lose it. Don't ask permission first, and don't save a place that was explicitly rejected.

One exception to saving liberally: read "Saved Recommendations" and "Awaiting Review" in your context first. If the place is already listed there, don't call this — say it's already on the list and move on. Duplicates are what makes the review list unusable.`,
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
    description: `Pin something to a specific date — either booked, or planned and not yet booked.

Call this as soon as a day acquires a shape, not only once tickets exist. Status "booked" is arranged: reserved, paid, confirmed. Status "planned" is decided but not yet arranged. Both show on the travellers' agenda straight away; planned rows are tagged as such, so recording one commits nobody to anything.

Examples:
- "I booked the funicular for Saturday 9am" → status "booked"
- "Let's do Hallstatt on Monday" → status "planned"
- "Maybe Hallstatt at some point?" → no date and no decision, so that's save_recommendation

The date is the one thing you must not guess — ask if you don't know it. Something with no date belongs in save_recommendation, and something you are proposing rather than reporting is not this tool at all, whatever its status.

Calling this again with the same name on the same date updates that row instead of adding a second, so firming a plan up is safe. To move it, change its status, or take it off, use update_activity and cancel_activity.`,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What it is, e.g. "Hohensalzburg funicular"' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        status: {
          type: 'string',
          enum: ['planned', 'booked'],
          description: 'booked = reserved, paid or confirmed; planned = decided on but not yet arranged',
        },
        time: { type: 'string', description: 'HH:MM, 24-hour, if there is a set time' },
        location: { type: 'string', description: 'Where to be' },
        notes: { type: 'string', description: 'Booking reference, what to bring, travel time' },
      },
      required: ['name', 'date', 'status'],
    },
  },

  {
    name: 'update_activity',
    description: `Change something that is already on the agenda.

Every line in your Agenda context starts with an id like [#a1b2c3] — pass that. The activity's name works if you don't have the id to hand, but the id is what you should reach for.

Call this the moment a plan firms up or moves. The most common case by far is a planned outing that has now been booked.

Examples:
- "we got the Zwölferhorn gondola for Thursday, 9am" and it's on the agenda as planned → status "booked", time "09:00"
- "let's move Hallstatt to Wednesday" → the new date
- "the Krimml trip is now the afternoon" → the new time

This is a patch, not a replacement: pass only what changed and everything else is left alone. That's the opposite of save_flight, which needs every field. To take something off the agenda entirely, use cancel_activity.`,
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The id from your Agenda context, e.g. "#a1b2c3". The exact name also works.',
        },
        name: { type: 'string', description: 'Only if the activity is being renamed' },
        date: { type: 'string', description: 'YYYY-MM-DD, only if it moved day' },
        time: { type: 'string', description: 'HH:MM, 24-hour, only if it moved time' },
        status: {
          type: 'string',
          enum: ['planned', 'booked'],
          description: 'Pass "booked" when a planned outing has actually been arranged',
        },
        location: { type: 'string' },
        notes: { type: 'string', description: 'Replaces the existing notes, so include what still applies' },
      },
      required: ['id'],
    },
  },

  {
    name: 'cancel_activity',
    description: `Take something off the agenda because it isn't happening.

Pass the id from your Agenda context (the name also works). The row is marked cancelled rather than deleted: it leaves the travellers' agenda, and you keep seeing it listed as cancelled so you don't re-propose the thing they just called off.

Examples:
- "we're skipping Krimml" → cancel it
- "the Grossglockner day is off, the forecast is bad" → cancel it, reason "bad forecast"

Not for moving something — that's update_activity with a new date.`,
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The id from your Agenda context, e.g. "#a1b2c3"' },
        reason: { type: 'string', description: 'Why, in a few words, if they said' },
      },
      required: ['id'],
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

  {
    name: 'save_accommodation',
    description: `Record where the family is staying for one leg of the trip.

Call this when the user tells you they have booked somewhere, or gives you the details of a place they are holding — a name, the dates, an address, a confirmation number, a price. This is the only way anything reaches the Stay card and the Accommodation section of your context; without it, you will still believe that leg is unbooked on the next message.

Examples:
- "we booked Haus Bergblick in Kaprun, 19th to the 24th, separate bedroom" → save it, status "booked"
- "we're holding an apartment in St. Gilgen for the first four nights" → save it, status "researching"
- "you should look at apartments in Kaprun" → that's not this tool; suggest places with save_recommendation

Anything the family is merely considering belongs in save_recommendation with category "accommodation". This tool is for a specific place with specific dates that they have chosen.

One stay per check-in date: calling this again with the same check_in replaces that leg, which is how a changed booking or an extended stay gets recorded.`,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What the place is called, e.g. "Haus Bergblick"' },
        check_in: { type: 'string', description: 'YYYY-MM-DD' },
        check_out: { type: 'string', description: 'YYYY-MM-DD' },
        status: {
          type: 'string',
          enum: ['booked', 'researching'],
          description: 'booked = confirmed and paid or reserved; researching = held or decided but not yet confirmed',
        },
        address: { type: 'string', description: 'Street address or village, if known' },
        check_in_time: {
          type: 'string',
          description: 'The check-in time or window as given, e.g. "15:00-20:00". This shows on their Stay card — record it whenever they mention it.',
        },
        check_out_time: { type: 'string', description: 'Check-out time, e.g. "09:30"' },
        maps_url: { type: 'string', description: 'Only if they paste an exact maps link; the card searches the name and address otherwise' },
        confirmation_ref: { type: 'string', description: 'Booking reference, if they gave you one' },
        notes: {
          type: 'string',
          description: 'Price per night, whether the bedroom is genuinely separate, parking, anything toddler-relevant',
        },
      },
      required: ['name', 'check_in', 'check_out'],
    },
  },

  {
    name: 'save_flight',
    description: `Record or correct a flight.

Call this when a flight is booked, or when the user tells you one has changed — a new time, a new flight number, a confirmation reference they want kept. Like accommodation, this is the only route into your own Flights context; a time you are only told in chat is gone by the next message.

Examples:
- "the outbound moved to 14:00, lands 17:40" → save it, direction "outbound", with the new times
- "our return is Israir 6H124, confirmation ABC123" → save it, direction "return"

There is one outbound and one return: calling this again for the same direction replaces it rather than adding a second. Pass every field you know, including the ones that haven't changed — a replacement is not a patch.`,
    input_schema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['outbound', 'return'], description: 'Which leg' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        departure_time: { type: 'string', description: 'HH:MM, 24-hour, local to the departure airport' },
        arrival_time: { type: 'string', description: 'HH:MM, 24-hour, local to the arrival airport' },
        from_airport: { type: 'string', description: 'IATA code, e.g. "TLV"' },
        to_airport: { type: 'string', description: 'IATA code, e.g. "SZG"' },
        airline: { type: 'string' },
        flight_number: { type: 'string' },
        confirmation_ref: { type: 'string' },
      },
      required: ['direction', 'date', 'departure_time', 'arrival_time', 'from_airport', 'to_airport'],
    },
  },

  {
    name: 'save_car_rental',
    description: `Record the hire car — where it's picked up and dropped off, when, and under what reference.

Call this when they book a car or tell you a rental has changed. Like flights and accommodation, this is the only route into your own Car context and onto their Agenda; a pick-up time you were only told in chat is gone by your next message.

Examples:
- "we've got a Budget car from the airport, 4pm on the 15th, back on the 26th" → save it
- "the drop-off moved to 10am" → save it again with every field, the new time included

What goes in notes rather than its own field: the excess terms, the fuel policy, what's not included, whether a child seat is booked, and any driving constraint — a no-cross-border clause belongs there, because it changes what you're allowed to suggest.

One rental per pick-up date: calling this again with the same pickup_date replaces it rather than adding a second car. Pass every field you know each time — like save_flight, this is a replacement, not a patch.`,
    input_schema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Who it is rented from, e.g. "Budget Austria"' },
        pickup_location: { type: 'string', description: 'Where it is collected, e.g. "Salzburg Airport"' },
        pickup_date: { type: 'string', description: 'YYYY-MM-DD' },
        pickup_time: { type: 'string', description: 'HH:MM, 24-hour' },
        dropoff_location: { type: 'string', description: 'Where it goes back, if different from pick-up' },
        dropoff_date: { type: 'string', description: 'YYYY-MM-DD' },
        dropoff_time: { type: 'string', description: 'HH:MM, 24-hour' },
        vehicle: { type: 'string', description: 'Group and model, and whether it is automatic' },
        driver: { type: 'string', description: 'Who is named on the rental' },
        confirmation_ref: { type: 'string' },
        maps_url: { type: 'string', description: 'Only if they paste an exact maps link for the desk' },
        notes: {
          type: 'string',
          description: 'Excess, fuel policy, exclusions, child seat, and any cross-border or driver restriction',
        },
      },
      required: ['company', 'pickup_location', 'pickup_date', 'dropoff_date'],
    },
  },

  {
    name: 'note_trip_fact',
    description: `Record a standing fact about this trip that doesn't belong anywhere else.

Call this for something true across the whole trip that isn't a preference, a place, or a scheduled event — the four other tools cover those. It shows on the trip card and comes back to you in your context on every future message.

Examples:
- "we've got a rental car for the whole trip" → note it
- "Ori's parents are joining us for two nights in Salzburg" → note it
- "our phone plan has no EU roaming, we're on wifi only" → note it

Not for: how the family likes to travel (save_learning), somewhere to go (save_recommendation), something at a time on a date (add_activity), or where they're sleeping (save_accommodation).

One short fact per call — each is appended as its own line, so keep it to something that reads on a phone. Facts already recorded are not added twice.`,
    input_schema: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'The fact, in one short line' },
      },
      required: ['fact'],
    },
  },

  {
    name: 'remove_trip_fact',
    description: `Remove a standing fact from the trip that is no longer true, or no longer open.

The counterpart to note_trip_fact, and the reason the trip notes don't slowly fill with things that were true in July. Call it as soon as something you recorded is settled or superseded.

Examples:
- the notes say the Salzburg city stay is still to book, and they've just booked it → remove that line, and save_accommodation for the booking itself
- "we sorted the car seat, we're taking our own" → remove the line about it being undecided, and note_trip_fact the decision

Quote the line as it appears in your context. Matching ignores case and punctuation, but the words have to be that line's words — if you're unsure which line they mean, ask rather than guessing at one.`,
    input_schema: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'The line to remove, as it appears in your context' },
      },
      required: ['fact'],
    },
  },
]

// Each executor returns two strings:
//
//   modelText — the tool_result the model reads, so it knows what happened and
//               what to tell the user.
//   userLine  — one short line the chat renders under the reply, so a save is
//               visible without the user having to go and look for it. The
//               executor writes it because only the executor knows what the
//               write actually did: "already saved" and "saved" are different
//               lines, and guessing from the tool input would sometimes lie.
//
// Throwing here is fine — App.jsx catches it and returns an error tool_result so
// the model can adapt rather than the whole turn failing.

// Names are compared with accents and punctuation stripped, so "Cafe Bazar"
// matches "Café Bazar" and "Zwölferhorn Cable Car" matches "Zwölferhorn cable
// car". Without this the review list fills with the same place spelled three
// ways — the agent re-proposes its own standing suggestions on every day plan,
// and those places are already rows.
const normalizeName = name =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const touch = () => ({ updated_at: new Date().toISOString() })

// Every activity line in the system prompt is prefixed with the first six
// characters of its id, and that prefix is what update_activity and
// cancel_activity take. Six hex characters is unambiguous across an itinerary of
// a few dozen rows, and short enough that the model copies it without slipping.
const shortId = id => id.slice(0, 6)

// Resolves a short id, a full uuid, or the activity's name. The id is what the
// model is looking at, but the name is what it has just been talking about, and
// failing a cancel because it typed "Krimml Waterfalls" instead of #a1b2c3 is a
// worse outcome than a slightly generous lookup. Ambiguity is reported rather
// than guessed at — picking one of two Hallstatt days would be a silent wrong
// answer, and the model can see both and choose.
async function findActivity(ref) {
  const needle = String(ref ?? '').trim().replace(/^#/, '')
  if (!needle) throw new Error('No activity id was given. Read the ids off the Agenda section of your context.')

  const { data, error } = await supabase.from('activities').select('*')
  if (error) throw new Error(`Could not read the agenda: ${error.message}`)

  const byId = data?.filter(a => a.id.toLowerCase().startsWith(needle.toLowerCase())) ?? []
  const candidates = byId.length
    ? byId
    : (data?.filter(a => normalizeName(a.name) === normalizeName(needle)) ?? [])

  if (!candidates.length) {
    throw new Error(
      `Nothing on the agenda matches "${ref}". Read the current ids off the Agenda section of your context rather than guessing one.`,
    )
  }
  if (candidates.length > 1) {
    const list = candidates.map(a => `#${shortId(a.id)} ${a.name} (${a.date})`).join(', ')
    throw new Error(`"${ref}" matches more than one: ${list}. Call again with a single id.`)
  }
  return candidates[0]
}

async function readTrip() {
  const { data, error } = await supabase.from('trip').select('id, notes').limit(1).maybeSingle()
  if (error) throw new Error(`Could not read the trip: ${error.message}`)
  if (!data) throw new Error('There is no trip row to change.')
  return data
}

const tripNoteLines = trip =>
  (trip.notes ?? '').split('\n').map(l => l.trim()).filter(Boolean)

const EXECUTORS = {
  async save_recommendation(input) {
    // The description tells the agent not to duplicate; this is what makes it
    // true. The model can only see 'kept' and 'pending' rows in its context, so
    // it has no way to know about a rejected one — and re-adding something the
    // travellers already turned down is the worst duplicate of the three.
    const { data: existing, error: readError } = await supabase
      .from('recommendations')
      .select('name, status')
    if (readError) throw new Error(`Could not check the saved list: ${readError.message}`)

    const match = existing?.find(r => normalizeName(r.name) === normalizeName(input.name))
    if (match?.status === 'rejected') {
      return {
        modelText: `"${match.name}" was turned down earlier, so it has not been re-added. Say so rather than saving it again.`,
        userLine: `${match.name} — previously turned down, not re-added`,
      }
    }
    if (match) {
      return {
        modelText: `"${match.name}" is already on the list (${match.status}). Nothing was added. Say it's already there.`,
        userLine: `${match.name} — already saved`,
      }
    }

    const { error } = await supabase.from('recommendations').insert({
      name: input.name,
      category: input.category,
      source: input.source ?? null,
      location: input.location ?? null,
      notes: input.notes ?? null,
      // status defaults to 'pending' — never write 'kept' from a tool.
    })
    if (error) throw new Error(`Could not save recommendation: ${error.message}`)
    return {
      modelText: `Saved "${input.name}" to the review list. Tell the user it's saved; they'll confirm it later.`,
      userLine: `Saved ${input.name} for review`,
    }
  },

  async save_learning(input) {
    const { error } = await supabase.from('learnings').insert({
      type: input.type,
      tag: input.tag,
      note: input.note,
      source_message: input.source_message ?? null,
    })
    if (error) throw new Error(`Could not save learning: ${error.message}`)
    return {
      modelText: `Noted: [${input.type}] ${input.tag}. This will inform future suggestions.`,
      userLine: `Noted for next time — ${input.tag}`,
    }
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
    return {
      modelText: `Drafted the journal entry for ${input.date}. It's waiting for the user to edit or keep.`,
      userLine: `Drafted the journal for ${formatDay(input.date)}`,
    }
  },

  // Same name on the same date updates rather than inserting. A plan firms up
  // over several messages -- "Hallstatt on Monday" becomes "Hallstatt on Monday,
  // 09:20 boat, booked" -- and the model reaches for add_activity each time,
  // because from where it is sitting it is still adding the day. An insert would
  // leave the travellers reading the same outing twice on one card.
  async add_activity(input) {
    const status = input.status ?? 'booked'
    const row = {
      name: input.name,
      date: input.date,
      time: input.time ?? null,
      location: input.location ?? null,
      notes: input.notes ?? null,
      status,
    }

    const { data: sameDay, error: readError } = await supabase
      .from('activities')
      .select('id, name, status')
      .eq('date', input.date)
    if (readError) throw new Error(`Could not check that day: ${readError.message}`)

    // A cancelled row is not a duplicate to update into -- if they cancelled
    // Krimml on the 22nd and then rebooked it, that is a new decision, and
    // reviving the old row would also revive its "Cancelled: bad forecast" note.
    const existing = sameDay?.find(
      a => a.status !== 'cancelled' && normalizeName(a.name) === normalizeName(input.name),
    )

    const { data: saved, error } = existing
      ? await supabase
          .from('activities')
          .update({ ...row, ...touch() })
          .eq('id', existing.id)
          .select('id')
          .single()
      : await supabase.from('activities').insert(row).select('id').single()
    if (error) throw new Error(`Could not add activity: ${error.message}`)

    const when = `${formatDay(input.date)}${input.time ? `, ${input.time}` : ''}`
    const verb = existing ? 'Updated' : status === 'planned' ? 'Planned' : 'Pinned'
    return {
      modelText: `${existing ? 'Updated' : 'Added'} "${input.name}" on ${input.date}${input.time ? ` at ${input.time}` : ''} as ${status}. Its id is #${shortId(saved.id)} — use that with update_activity or cancel_activity if it changes.`,
      userLine: `${verb} ${input.name} — ${when}`,
    }
  },

  // A patch, unlike save_flight's replace: here there is a row identity to hang
  // the change on, so the model doesn't have to restate the fields it isn't
  // touching, and can't blank one by forgetting it.
  async update_activity(input) {
    const current = await findActivity(input.id)

    const patch = {}
    for (const field of ['name', 'date', 'time', 'location', 'notes', 'status']) {
      if (input[field] !== undefined && input[field] !== null) patch[field] = input[field]
    }
    if (!Object.keys(patch).length) {
      return {
        modelText: `No fields were passed, so "${current.name}" is unchanged. Call again with what should change.`,
        userLine: `${current.name} — nothing changed`,
      }
    }

    const { error } = await supabase
      .from('activities')
      .update({ ...patch, ...touch() })
      .eq('id', current.id)
    if (error) throw new Error(`Could not update that: ${error.message}`)

    const name = patch.name ?? current.name
    const date = patch.date ?? current.date
    const time = patch.time ?? current.time
    const status = patch.status ?? current.status
    // "Booked X" rather than "Updated X" when that's what the change was: it's
    // the most common edit by a distance, and the one worth reading as a result.
    const verb = status === 'booked' && current.status === 'planned' ? 'Booked' : 'Updated'
    return {
      modelText: `Updated "${name}": ${date}${time ? ` at ${time}` : ''}, ${status}.`,
      userLine: `${verb} ${name} — ${formatDay(date)}${time ? `, ${time}` : ''}`,
    }
  },

  // Marked, not deleted. The travellers lose it off the agenda, and the agent
  // keeps seeing it as cancelled -- which is the point, because the next day
  // plan would otherwise re-propose the outing they called off this morning.
  async cancel_activity(input) {
    const current = await findActivity(input.id)
    if (current.status === 'cancelled') {
      return {
        modelText: `"${current.name}" on ${current.date} was already cancelled. Nothing changed.`,
        userLine: `${current.name} — already cancelled`,
      }
    }

    const notes = input.reason
      ? [current.notes, `Cancelled: ${input.reason}`].filter(Boolean).join(' · ')
      : current.notes

    const { error } = await supabase
      .from('activities')
      .update({ status: 'cancelled', notes, ...touch() })
      .eq('id', current.id)
    if (error) throw new Error(`Could not cancel that: ${error.message}`)

    return {
      modelText: `Cancelled "${current.name}" on ${current.date}. It's off their agenda; you'll still see it listed as cancelled so you don't re-propose it.`,
      userLine: `Cancelled ${current.name} — ${formatDay(current.date)}`,
    }
  },

  // added_by: 'agent' is what puts the "Added by the agent" line on the row, so
  // nothing you write here appears as though it was always on the list.
  async add_packing_item(input) {
    const row = await addPackingItem({
      name: input.name,
      category: input.category,
      addedBy: 'agent',
    })
    return {
      modelText: `Added "${row.name}" to the ${categoryLabel(row.category)} section of the packing list. Tell the user it's on there.`,
      userLine: `Added ${row.name} to packing`,
    }
  },

  // One stay per check-in date. Matching on check_in rather than name is what
  // makes a changed booking replace the old one instead of leaving the family
  // with two places to sleep on the same night.
  async save_accommodation(input) {
    const row = {
      name: input.name,
      check_in: input.check_in,
      check_out: input.check_out,
      status: input.status ?? 'booked',
      address: input.address ?? null,
      check_in_time: input.check_in_time ?? null,
      check_out_time: input.check_out_time ?? null,
      maps_url: input.maps_url ?? null,
      confirmation_ref: input.confirmation_ref ?? null,
      notes: input.notes ?? null,
    }

    const { data: existing, error: readError } = await supabase
      .from('accommodation')
      .select('id, name')
      .eq('check_in', input.check_in)
      .limit(1)
      .maybeSingle()
    if (readError) throw new Error(`Could not check your stays: ${readError.message}`)

    const { error } = existing
      ? await supabase.from('accommodation').update({ ...row, ...touch() }).eq('id', existing.id)
      : await supabase.from('accommodation').insert(row)
    if (error) throw new Error(`Could not save the accommodation: ${error.message}`)

    const dates = `${input.check_in} to ${input.check_out}`
    const replaced = existing && existing.name !== input.name ? ` It replaces ${existing.name}.` : ''
    return {
      modelText: `Saved "${input.name}" as ${row.status} for ${dates}.${replaced} This is now in your Accommodation context on every future message.`,
      userLine: `${existing ? 'Updated' : 'Saved'} your stay — ${input.name}, ${formatRange(input.check_in, input.check_out)}`,
    }
  },

  // One outbound and one return, so this replaces by direction. A partial
  // update would be worse than useless here: a flight row with the new time and
  // the old flight number is a wrong answer that looks like a right one.
  async save_flight(input) {
    const row = {
      direction: input.direction,
      date: input.date,
      departure_time: input.departure_time,
      arrival_time: input.arrival_time,
      from_airport: input.from_airport,
      to_airport: input.to_airport,
      airline: input.airline ?? null,
      flight_number: input.flight_number ?? null,
      confirmation_ref: input.confirmation_ref ?? null,
    }

    const { data: existing, error: readError } = await supabase
      .from('flights')
      .select('id')
      .eq('direction', input.direction)
      .limit(1)
      .maybeSingle()
    if (readError) throw new Error(`Could not check your flights: ${readError.message}`)

    const { error } = existing
      ? await supabase.from('flights').update(row).eq('id', existing.id)
      : await supabase.from('flights').insert(row)
    if (error) throw new Error(`Could not save the flight: ${error.message}`)

    const when = `${input.date} ${input.departure_time}–${input.arrival_time}`
    return {
      modelText: `Saved the ${input.direction} flight: ${when}, ${input.from_airport} → ${input.to_airport}.`,
      userLine: `${existing ? 'Updated' : 'Saved'} the ${input.direction} flight — ${formatDay(input.date)}, ${input.departure_time}`,
    }
  },

  // One rental per pick-up date, replaced rather than patched — the same
  // reasoning as save_flight. A row carrying the new drop-off time and the old
  // confirmation number is a wrong answer that looks like a right one.
  async save_car_rental(input) {
    const row = {
      company: input.company,
      vehicle: input.vehicle ?? null,
      pickup_location: input.pickup_location,
      pickup_date: input.pickup_date,
      pickup_time: input.pickup_time ?? null,
      dropoff_location: input.dropoff_location ?? null,
      dropoff_date: input.dropoff_date,
      dropoff_time: input.dropoff_time ?? null,
      driver: input.driver ?? null,
      confirmation_ref: input.confirmation_ref ?? null,
      maps_url: input.maps_url ?? null,
      notes: input.notes ?? null,
    }

    const { data: existing, error: readError } = await supabase
      .from('car_rental')
      .select('id, company')
      .eq('pickup_date', input.pickup_date)
      .limit(1)
      .maybeSingle()
    if (readError) throw new Error(`Could not check the car: ${readError.message}`)

    const { error } = existing
      ? await supabase.from('car_rental').update({ ...row, ...touch() }).eq('id', existing.id)
      : await supabase.from('car_rental').insert(row)
    if (error) throw new Error(`Could not save the car: ${error.message}`)

    return {
      modelText: `Saved the ${input.company} rental: ${input.pickup_location} ${input.pickup_date}${input.pickup_time ? ` at ${input.pickup_time}` : ''}, back ${input.dropoff_date}${input.dropoff_time ? ` at ${input.dropoff_time}` : ''}. It's in your Car context from the next message.`,
      userLine: `${existing ? 'Updated' : 'Saved'} the car — ${input.company}, from ${formatDay(input.pickup_date)}`,
    }
  },

  // Appended as its own line rather than replacing, because the agent is told
  // one fact per call and has no way to know what the other lines say.
  //
  // The existing text is appended to verbatim, not re-joined from its trimmed
  // lines: the seeded notes are paragraphs with blank lines between them, and
  // rebuilding them would silently reflow the trip card the first time the agent
  // noted anything.
  async note_trip_fact(input) {
    const fact = input.fact.trim()
    const trip = await readTrip()

    if (tripNoteLines(trip).some(l => normalizeName(l) === normalizeName(fact))) {
      return {
        modelText: `"${fact}" is already recorded on the trip. Nothing was added.`,
        userLine: `Already noted — ${fact}`,
      }
    }

    const existing = (trip.notes ?? '').trimEnd()
    const { error } = await supabase
      .from('trip')
      .update({ notes: existing ? `${existing}\n${fact}` : fact, ...touch() })
      .eq('id', trip.id)
    if (error) throw new Error(`Could not note that: ${error.message}`)
    return {
      modelText: `Noted on the trip: "${fact}". It will be in your context on every future message.`,
      userLine: `Noted — ${fact}`,
    }
  },

  // The counterpart to note_trip_fact, and the reason the notes don't only ever
  // grow. Without it the line saying a leg is still to book outlives the
  // booking, and the agent reads it back as true on every future message.
  async remove_trip_fact(input) {
    const target = input.fact.trim()
    const needle = normalizeName(target)
    if (!needle) throw new Error('No fact was given to remove.')

    const trip = await readTrip()
    const lines = (trip.notes ?? '').split('\n')

    // Exact first, then containment — the model is quoting a line it can see, so
    // an exact match is the normal path, and the fallback is for the time it
    // quotes half of one. Never a match the other way round (the line containing
    // the needle, not the needle containing the line): "car" would take out the
    // whole rental paragraph.
    let hits = lines.filter(l => normalizeName(l) === needle)
    if (!hits.length) hits = lines.filter(l => normalizeName(l).includes(needle))

    if (!hits.length) {
      return {
        modelText: `No line in the trip notes matches "${target}", so nothing was removed. Quote the line as it appears in your context.`,
        userLine: `Nothing to remove — no match for "${target}"`,
      }
    }
    if (hits.length > 1) {
      throw new Error(
        `"${target}" matches ${hits.length} lines of the trip notes: ${hits.join(' | ')}. Call again quoting one of them exactly.`,
      )
    }

    const removed = hits[0]
    const notes = lines
      .filter(l => l !== removed)
      .join('\n')
      // Taking a line out of the middle of a paragraph block can leave a gap
      // three newlines wide, which renders as an empty row on the trip card.
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    const { error } = await supabase.from('trip').update({ notes: notes || null, ...touch() }).eq('id', trip.id)
    if (error) throw new Error(`Could not remove that: ${error.message}`)
    return {
      modelText: `Removed "${removed.trim()}" from the trip notes. It's gone from your context as of the next message.`,
      userLine: `Removed — ${removed.trim()}`,
    }
  },
}

export async function executeTool(name, input) {
  const executor = EXECUTORS[name]
  if (!executor) throw new Error(`Unknown tool: ${name}`)
  return executor(input)
}
