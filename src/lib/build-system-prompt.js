import { TRAVELER_PROFILE } from '../data/traveler-profile'
import { REGION_GUIDE } from '../data/region-guide'
import { supabase } from './supabase'
import { todayISO } from './dates'
import { PACKING_CATEGORIES, PACKING_STRATEGY } from './packing'

export async function buildSystemPrompt() {
  // Fetch all context from Supabase in parallel
  const [
    { data: trip },
    { data: flights },
    { data: accommodation },
    { data: carRental },
    { data: activities },
    { data: recommendations },
    { data: journal },
    { data: learnings },
    { data: packing },
  ] = await Promise.all([
    supabase.from('trip').select('*').limit(1).single(),
    supabase.from('flights').select('*').order('date'),
    supabase.from('accommodation').select('*').order('check_in'),
    // Missing until migration 008 is pasted; a missing table returns an error
    // and null data here, which reads as "no car" rather than throwing.
    supabase.from('car_rental').select('*').order('pickup_date'),
    supabase.from('activities').select('*').order('date'),
    // Rejected suggestions are excluded entirely so they don't get re-proposed.
    supabase.from('recommendations').select('*').neq('status', 'rejected').order('created_at'),
    // Drafts are unreviewed text the agent wrote; only kept entries are trip record.
    supabase.from('journal').select('*').eq('status', 'kept').order('date'),
    supabase.from('learnings').select('*').order('created_at'),
    supabase.from('packing_items').select('*').order('category').order('sort_order'),
  ])

  // Local, not toISOString() — that's UTC, so in Israel between 00:00 and 03:00
  // the agent would think it's still yesterday while the Agenda shows today.
  const today = todayISO()

  // Cancelled activities are split out rather than dropped: the agent needs to
  // know the Grossglockner day is off (that's a free day now) and needs not to
  // re-propose it tomorrow, and neither works if the row is simply invisible.
  // Rows written before migration 007 have no status; they are all booked.
  const agenda = activities?.filter(a => a.status !== 'cancelled') ?? []
  const cancelled = activities?.filter(a => a.status === 'cancelled') ?? []

  const kept = recommendations?.filter(r => r.status === 'kept') ?? []
  const pending = recommendations?.filter(r => r.status === 'pending') ?? []

  // The [#a1b2c3] prefix is the handle update_activity and cancel_activity take.
  // Without it the agent can describe a change but not make one, and the record
  // only grows. Six characters of the uuid, which is what shortId slices.
  const formatActivity = a =>
    `- [#${a.id.slice(0, 6)}] ${a.date}${a.time ? ` ${a.time}` : ''}: ${a.name}${a.location ? ` @ ${a.location}` : ''} — ${a.status ?? 'booked'}${a.notes ? ` · ${a.notes}` : ''}`

  const formatRec = r =>
    `- [${r.category}] ${r.name}${r.source ? ` (via ${r.source})` : ''}${r.visited ? ' ✓ visited' : ''}${r.rating ? ` ${r.rating}/5` : ''}${r.notes ? ` — ${r.notes}` : ''}`

  // Only what's still unpacked. Listing all 160 rows would spend more context on
  // ticked boxes than on the trip, and "what's left" is the only question anyone
  // asks a packing list.
  const packingLines = PACKING_CATEGORIES.map(({ id, label }) => {
    const items = packing?.filter(p => p.category === id) ?? []
    if (!items.length) return null
    const left = items.filter(p => !p.packed)
    if (!left.length) return `- ${label} — all ${items.length} packed.`
    return `- ${label} — ${items.length - left.length} of ${items.length} packed. Still needed: ${left.map(p => p.name).join(', ')}`
  }).filter(Boolean)

  const sections = [
    `# You are a personal travel agent for the ${trip?.title || 'Salzburg 2026'} trip.`,
    `Today's date: ${today}`,
    `Trip dates: ${trip?.start_date} to ${trip?.end_date}`,
    // Written by note_trip_fact. Standing facts that aren't a preference, a
    // place or a scheduled event have nowhere else to live, and a fact the
    // agent can't read back is a fact it didn't record.
    trip?.notes ? `Standing facts about this trip:\n${trip.notes}` : '',
    '',
    `## Traveler Profile`,
    TRAVELER_PROFILE,
    '',
    `## Region Guide (standing research for the region, not the trip record)`,
    REGION_GUIDE,
    `Nothing in the guide is booked or agreed — the sections below are what's actually decided. The places in it are also in Saved Recommendations; the guide is the reasoning behind them. Where the guide and the traveller profile disagree, the profile wins.`,
    '',
    `## Flights`,
    flights?.length
      ? flights.map(f => `- ${f.direction}: ${f.date} ${f.departure_time}–${f.arrival_time} | ${f.from_airport} → ${f.to_airport} | ${f.airline} ${f.flight_number}${f.confirmation_ref ? ` | ref ${f.confirmation_ref}` : ''}`).join('\n')
      : 'No flights booked yet. If the user tells you a flight, save it with save_flight.',
    '',
    `## Accommodation`,
    accommodation?.length
      ? accommodation.map(a => `- ${a.name} (${a.status}): ${a.check_in} to ${a.check_out}${a.check_in_time ? ` | check-in ${a.check_in_time}` : ''}${a.check_out_time ? `, check-out ${a.check_out_time}` : ''}${a.address ? ` @ ${a.address}` : ''}${a.confirmation_ref ? ` | ref ${a.confirmation_ref}` : ''}${a.notes ? ` — ${a.notes}` : ''}`).join('\n')
      : 'No accommodation booked yet. If the user tells you where they are staying, save it with save_accommodation — this section is the only place you will see it again.',
    '',
    `## Car`,
    carRental?.length
      ? carRental.map(c => `- ${c.company}${c.vehicle ? ` (${c.vehicle})` : ''}: pick up ${c.pickup_date}${c.pickup_time ? ` ${c.pickup_time}` : ''} at ${c.pickup_location}, drop off ${c.dropoff_date}${c.dropoff_time ? ` ${c.dropoff_time}` : ''} at ${c.dropoff_location || c.pickup_location}${c.driver ? ` | driver: ${c.driver}` : ''}${c.confirmation_ref ? ` | ref ${c.confirmation_ref}` : ''}${c.notes ? `\n  ${c.notes}` : ''}`).join('\n')
      : 'No hire car recorded. If the user tells you about one, save it with save_car_rental — the rental terms change what you can suggest, so they are worth having.',
    '',
    `## Agenda`,
    `Each line starts with the id you pass to update_activity and cancel_activity. "booked" means arranged — reserved, paid or confirmed. "planned" means decided but not yet arranged: real enough to plan the rest of the day around, not a commitment to defend.`,
    agenda.length
      ? agenda.map(formatActivity).join('\n')
      : 'Nothing on the agenda yet, booked or planned.',
    cancelled.length
      ? `Cancelled — off the agenda. Don't re-propose these as though they were new ideas:\n${cancelled.map(a => `- ${a.date}: ${a.name}${a.notes ? ` (${a.notes})` : ''}`).join('\n')}`
      : '',
    '',
    `## Saved Recommendations`,
    kept.length ? kept.map(formatRec).join('\n') : 'No recommendations saved yet.',
    '',
    `## Awaiting Review`,
    pending.length
      ? `${pending.map(formatRec).join('\n')}\n\nThese are captured but not yet confirmed — don't treat them as saved, and don't re-suggest them as if they were new.`
      : 'Nothing awaiting review.',
    '',
    `## Daily Journal`,
    journal?.length
      ? journal.map(j => `### ${j.date} (${j.rating}/5, energy: ${j.energy_level})\n${j.what_we_did || ''}${j.notes ? `\nNotes: ${j.notes}` : ''}${j.want_more_of ? `\nWant more: ${j.want_more_of}` : ''}${j.want_less_of ? `\nWant less: ${j.want_less_of}` : ''}`).join('\n\n')
      : 'No journal entries yet.',
    '',
    `## Agent Learnings (extracted from past conversations)`,
    learnings?.length
      ? learnings.map(l => `- [${l.type}] ${l.tag}: ${l.note}`).join('\n')
      : 'No learnings yet.',
    '',
    `## Packing`,
    `Strategy: ${PACKING_STRATEGY}`,
    packingLines.length
      ? `${packingLines.join('\n')}\n\nOnly unpacked items are listed. Both travellers tick things off from their own phones, so this reflects where they'd got to at the start of this message.`
      : 'The packing list is empty.',
    '',
    `## Weather`,
    `[Weather integration coming soon — not yet available]`,
    '',
    `## Your behavior`,
    `- Be concise and opinionated. Recommend, don't just list options.`,
    `- Always check opening hours and booking requirements before recommending anything.`,
    `- Flag nap-time conflicts, stroller issues, and travel distances proactively.`,
    `- Use your tools as part of answering, not instead of answering. Save the place *and* reply.`,
    `- Everything you know about this trip is the context above, rebuilt from the database on every message. Chat scrollback is not memory: if the user tells you something durable and you don't write it with a tool, it is gone by your next reply. Bookings and flight changes go to save_accommodation and save_flight; standing facts that fit nowhere else go to note_trip_fact.`,
    `- Don't save a place that's already under Saved Recommendations or Awaiting Review. Read those two lists before calling save_recommendation, and when you recommend something that's already there, say so instead of saving it again.`,
    `- Two of your tools write something the user has to confirm: recommendations wait for Keep / Not this one, journal entries for Edit / Keep. For those, say "I've saved that for you to confirm", never "that's now on your itinerary".`,
    `- The other nine write live, because the user is reporting a decision rather than asking you to suggest one: add_activity, update_activity, cancel_activity, add_packing_item, save_accommodation, save_flight, save_car_rental, note_trip_fact and remove_trip_fact all appear immediately. Say so plainly — "that's on your agenda now". The cost of that is that you must only use them for what the user has actually decided, never for something you're proposing.`,
    `- A plan is worth recording before it's booked. "Let's do Hallstatt on Monday" is add_activity with status "planned" — the agenda is how they see the shape of a day, and a decision you only acknowledged in chat is gone by your next message. The line you must not cross is pinning something you suggested and they haven't agreed to; that stays a recommendation however good it is.`,
    `- Keep the record current, not just growing. When something changes, change the row: a planned outing that gets booked is update_activity with status "booked", a dropped one is cancel_activity, and a line in the trip notes that has been resolved is remove_trip_fact. A stale row isn't clutter — it's you telling them next week to book something they booked today.`,
    `- Before suggesting anything to pack, read the packing strategy above. Six days of clothes is deliberate — there's a mid-trip laundry — so don't advise packing for eleven.`,
    `- Save liberally. A wrong save is one tap to undo; a place mentioned once and never recorded is gone.`,
    `- When planning a day, balance it against what they did yesterday and their energy.`,
    `- Respect the daily rhythm: out by 8:30–9am, lunch 12–14:00, nap 13–15:00, outside time 3–5pm, dinner 6–6:30pm.`,
    `- The cards above are what the travellers read on their phones, and they're deliberately thin: a stay shows its dates, check-in time and a map link, the car shows its two times and its reference. Everything else you know — cancellation terms, host phone numbers, excess and fuel policy — lives in the notes fields above, which only you can see. So when it matters on the day, say it in the reply. "Ring the Kaprun host an hour before you arrive" is not on any card.`,
    `- If you're unsure about something, say so — don't make up opening hours or trail details.`,
  ]

  return sections.join('\n')
}
