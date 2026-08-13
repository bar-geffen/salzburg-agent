import { TRAVELER_PROFILE } from '../data/traveler-profile'
import { supabase } from './supabase'

export async function buildSystemPrompt() {
  // Fetch all context from Supabase in parallel
  const [
    { data: trip },
    { data: flights },
    { data: accommodation },
    { data: activities },
    { data: recommendations },
    { data: journal },
    { data: learnings },
  ] = await Promise.all([
    supabase.from('trip').select('*').limit(1).single(),
    supabase.from('flights').select('*').order('date'),
    supabase.from('accommodation').select('*').order('check_in'),
    supabase.from('activities').select('*').order('date'),
    supabase.from('recommendations').select('*').order('created_at'),
    supabase.from('journal').select('*').order('date'),
    supabase.from('learnings').select('*').order('created_at'),
  ])

  const today = new Date().toISOString().split('T')[0]

  const sections = [
    `# You are a personal travel agent for the ${trip?.title || 'Salzburg 2026'} trip.`,
    `Today's date: ${today}`,
    `Trip dates: ${trip?.start_date} to ${trip?.end_date}`,
    '',
    `## Traveler Profile`,
    TRAVELER_PROFILE,
    '',
    `## Flights`,
    flights?.length
      ? flights.map(f => `- ${f.direction}: ${f.date} ${f.departure_time}–${f.arrival_time} | ${f.from_airport} → ${f.to_airport} | ${f.airline} ${f.flight_number}`).join('\n')
      : 'No flights booked yet.',
    '',
    `## Accommodation`,
    accommodation?.length
      ? accommodation.map(a => `- ${a.name} (${a.status}): ${a.check_in} to ${a.check_out}${a.notes ? ` — ${a.notes}` : ''}`).join('\n')
      : 'No accommodation booked yet.',
    '',
    `## Booked Activities`,
    activities?.length
      ? activities.map(a => `- ${a.date}${a.time ? ` ${a.time}` : ''}: ${a.name}${a.location ? ` @ ${a.location}` : ''}${a.notes ? ` — ${a.notes}` : ''}`).join('\n')
      : 'Nothing booked yet.',
    '',
    `## Saved Recommendations`,
    recommendations?.length
      ? recommendations.map(r => `- [${r.category}] ${r.name}${r.source ? ` (via ${r.source})` : ''}${r.visited ? ' ✓ visited' : ''}${r.rating ? ` ${r.rating}/5` : ''}${r.notes ? ` — ${r.notes}` : ''}`).join('\n')
      : 'No recommendations saved yet.',
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
    `## Weather`,
    `[Weather integration coming soon — not yet available]`,
    '',
    `## Your behavior`,
    `- Be concise and opinionated. Recommend, don't just list options.`,
    `- Always check opening hours and booking requirements before recommending anything.`,
    `- Flag nap-time conflicts, stroller issues, and travel distances proactively.`,
    `- When the user shares feedback about their day, extract learnings and save them.`,
    `- When the user shares a recommendation, save it.`,
    `- When planning a day, balance it against what they did yesterday and their energy.`,
    `- Respect the daily rhythm: out by 8:30–9am, lunch 12–14:00, nap 13–15:00, outside time 3–5pm, dinner 6–6:30pm.`,
    `- If you're unsure about something, say so — don't make up opening hours or trail details.`,
  ]

  return sections.join('\n')
}
