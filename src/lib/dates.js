// Date helpers. No date library — everything here is a whole date (Postgres
// `date`), one trip, one timezone, so Intl plus a few helpers covers it.
//
// Two traps this file exists to avoid:
//
//   1. `new Date('2026-09-15')` parses as UTC midnight. Anywhere behind UTC that
//      formats as Sep 14. Always go through parseISODate.
//   2. Formatting with the user's locale gives 'Thu, Aug 20' on a US phone and
//      something else again on a Hebrew one. The design's typography assumes
//      'Thu 20 Aug', so the locale is pinned to en-GB everywhere.

const LOCALE = 'en-GB'

const dayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })
const shortFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })

/** 'YYYY-MM-DD' → Date at LOCAL midnight. */
export function parseISODate(iso) {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Date → 'YYYY-MM-DD', local. Deliberately not toISOString(), which is UTC. */
export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO() {
  return toISODate(new Date())
}

/** Whole days from a to b. Both 'YYYY-MM-DD'. */
export function daysBetween(aISO, bISO) {
  const a = parseISODate(aISO)
  const b = parseISODate(bISO)
  if (!a || !b) return 0
  return Math.round((b - a) / 86400000)
}

/** 'Thu 20 Aug' */
export function formatDay(iso) {
  const d = parseISODate(iso)
  return d ? dayFmt.format(d) : ''
}

/**
 * 'Tue 15 Sept 2026' — used before the trip, when the year isn't obvious.
 * Built from formatDay rather than a four-part Intl format, because that adds a
 * comma ('Tue, 15 Sept 2026') and wouldn't match the comma-less dates elsewhere.
 */
export function formatDayYear(iso) {
  const d = parseISODate(iso)
  return d ? `${formatDay(iso)} ${d.getFullYear()}` : ''
}

/** '15 Sept' */
export function formatShort(iso) {
  const d = parseISODate(iso)
  return d ? shortFmt.format(d) : ''
}

/**
 * '15 – 26 Sept 2026', or '30 Aug – 5 Sept 2026' across a month boundary.
 * Weekdays are dropped: a range with two of them is too long for a phone and
 * wraps the countdown tag onto its own line.
 */
export function formatRange(startISO, endISO) {
  const start = parseISODate(startISO)
  const end = parseISODate(endISO)
  if (!start || !end) return ''
  const left =
    start.getMonth() === end.getMonth() ? String(start.getDate()) : formatShort(startISO)
  return `${left} – ${formatShort(endISO)} ${end.getFullYear()}`
}

/** Days from now → 'today' | 'tomorrow' | 'in 6 days' | 'in 3 weeks' | 'in 5 months' */
export function formatCountdown(days) {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  const n = Math.abs(days)
  const ago = days < 0
  let value
  if (n < 14) value = `${n} days`
  else if (n < 60) value = `${Math.round(n / 7)} weeks`
  else value = `${Math.round(n / 30)} months`
  return ago ? `${value} ago` : `in ${value}`
}

/**
 * A full timestamp (timestamptz) -> 'today' | 'yesterday' | '3 days ago'.
 *
 * Deliberately not parseISODate on the first 10 characters, the way whole-date
 * columns are handled: that's the UTC date, which is the wrong day either side
 * of midnight at +03:00. A timestamp carries its own offset, so Date parses it
 * correctly and toISODate brings it back to the local calendar day.
 */
export function relativeDay(timestamp) {
  if (!timestamp) return ''
  const at = new Date(timestamp)
  if (Number.isNaN(at.getTime())) return ''
  return formatCountdown(daysBetween(todayISO(), toISODate(at)))
}

/**
 * activities.time is untyped text — the tool asks for HH:MM but the model may
 * write '9am' or a range. Pass through anything already well-formed, otherwise
 * render what's there rather than mangling it.
 */
export function formatTime(raw) {
  if (!raw) return ''
  const t = String(raw).trim()
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : t
}

/** 'before' | 'during' | 'after' — drives what the Agenda shows. */
export function tripPhase(trip, today = todayISO()) {
  if (!trip?.start_date || !trip?.end_date) return 'before'
  if (today < trip.start_date) return 'before'
  if (today > trip.end_date) return 'after'
  return 'during'
}

/**
 * The header subtitle. Note "Day N of M" counts days inclusively: Sep 15–26 is
 * 11 nights but 12 days, so the design's literal "Day 4 of 11" would read
 * "Day 12 of 11" on the last morning.
 */
export function tripSubtitle(trip, today = todayISO()) {
  if (!trip?.start_date || !trip?.end_date) return 'No trip dates set'

  const phase = tripPhase(trip, today)
  const nights = daysBetween(trip.start_date, trip.end_date)
  const totalDays = nights + 1

  if (phase === 'before') {
    const away = daysBetween(today, trip.start_date)
    return `Starts ${formatDay(trip.start_date)} · ${formatCountdown(away)}`
  }
  if (phase === 'after') {
    return `${nights} nights · home ${formatDay(trip.end_date)}`
  }
  const dayNumber = daysBetween(trip.start_date, today) + 1
  return `Day ${dayNumber} of ${totalDays} · ${formatDay(today)}`
}

/**
 * Group dated rows into [{ date, items }], ascending, items sorted by time with
 * untimed ones last. Dates with no items never appear — the Agenda must not
 * render a card for every day of the trip.
 */
export function groupByDate(rows) {
  const byDate = new Map()
  for (const row of rows ?? []) {
    if (!row.date) continue
    if (!byDate.has(row.date)) byDate.set(row.date, [])
    byDate.get(row.date).push(row)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => {
        if (!a.time && !b.time) return 0
        if (!a.time) return 1
        if (!b.time) return -1
        return formatTime(a.time).localeCompare(formatTime(b.time))
      }),
    }))
}

/**
 * Which flight leads the card and which is the footnote. Generalises the
 * design's "next flight is the headline, the other is the mono footer" to all
 * three trip phases.
 */
export function pickFlights(flights, today = todayISO()) {
  const list = [...(flights ?? [])].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  if (list.length === 0) return { headline: null, footer: null }
  const upcoming = list.find(f => f.date >= today)
  const headline = upcoming ?? list[list.length - 1]
  const footer = list.find(f => f.id !== headline.id) ?? null
  return { headline, footer }
}
