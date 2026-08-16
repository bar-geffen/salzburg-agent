// Reads and mutations for the trip tables.
//
// NOTE: build-system-prompt.js deliberately does NOT use these helpers. Its
// filters are different on purpose — journal is 'kept'-only for the agent, but
// the UI needs to show drafts so they can be reviewed. Coupling the two would
// leak unreviewed journal text into the agent's context.
//
// The mutations here are the only writes that change existing rows. They are all
// user-initiated: the agent's tools never write 'kept'.

import { supabase } from './supabase'

// updated_at has no trigger in the schema — it defaults on insert and nothing
// bumps it on update. Every mutation has to set it or the column lies forever.
const touch = () => ({ updated_at: new Date().toISOString() })

function unwrap({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

// ── reads ──────────────────────────────────────────────────────────────────

export async function fetchTrip() {
  const { data, error } = await supabase.from('trip').select('*').limit(1).maybeSingle()
  if (error) throw new Error(`Couldn't load the trip: ${error.message}`)
  return data
}

export async function fetchFlights() {
  return unwrap(await supabase.from('flights').select('*').order('date'), "Couldn't load flights")
}

export async function fetchAccommodation() {
  return unwrap(
    await supabase.from('accommodation').select('*').order('check_in'),
    "Couldn't load accommodation",
  )
}

export async function fetchActivities() {
  return unwrap(
    await supabase.from('activities').select('*').order('date'),
    "Couldn't load activities",
  )
}

/** Everything except rejected — the UI needs pending (to review) and kept. */
export async function fetchRecommendations() {
  return unwrap(
    await supabase
      .from('recommendations')
      .select('*')
      .neq('status', 'rejected')
      .order('created_at', { ascending: false }),
    "Couldn't load recommendations",
  )
}

/** Drafts AND kept — unlike the system prompt, which only sees kept. */
export async function fetchJournal() {
  return unwrap(
    await supabase.from('journal').select('*').order('date', { ascending: false }),
    "Couldn't load the journal",
  )
}

export const FETCHERS = {
  trip: fetchTrip,
  flights: fetchFlights,
  accommodation: fetchAccommodation,
  activities: fetchActivities,
  recommendations: fetchRecommendations,
  journal: fetchJournal,
}

export async function fetchTripData() {
  const [trip, flights, accommodation, activities, recommendations, journal] = await Promise.all([
    fetchTrip(),
    fetchFlights(),
    fetchAccommodation(),
    fetchActivities(),
    fetchRecommendations(),
    fetchJournal(),
  ])
  return { trip, flights, accommodation, activities, recommendations, journal }
}

// ── mutations (user-initiated only) ────────────────────────────────────────

async function setStatus(table, id, status, what) {
  return unwrap(
    await supabase.from(table).update({ status, ...touch() }).eq('id', id).select().single(),
    what,
  )
}

export function keepRecommendation(id) {
  return setStatus('recommendations', id, 'kept', "Couldn't keep that")
}

/**
 * Backs both "Not this one" and "Remove". Not a delete: build-system-prompt.js
 * excludes rejected rows entirely, so rejecting means the agent will never
 * propose it again — which is what both verbs mean here. It's also recoverable.
 */
export function rejectRecommendation(id) {
  return setStatus('recommendations', id, 'rejected', "Couldn't remove that")
}

export function keepJournalEntry(id) {
  return setStatus('journal', id, 'kept', "Couldn't save that entry")
}

export async function saveJournalText(id, whatWeDid) {
  return unwrap(
    await supabase
      .from('journal')
      .update({ what_we_did: whatWeDid, ...touch() })
      .eq('id', id)
      .select()
      .single(),
    "Couldn't save your edit",
  )
}
