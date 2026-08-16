// The time-anchored view: what's happening, where you're staying, flights, and
// the journal draft awaiting review.
//
// What's shown depends on the trip phase. Before the trip (which is where this
// will be used for the next few weeks) there is no "today" to lead with, so the
// first card is the trip itself with a countdown.

import { useState } from 'react'
import Section from './Section'
import {
  daysBetween,
  formatCountdown,
  formatDay,
  formatRange,
  formatTime,
  groupByDate,
  pickFlights,
  tripPhase,
} from '../lib/dates'

export default function Agenda({
  trip,
  activities,
  accommodation,
  flights,
  journal,
  today,
  loading,
  error,
  onRetry,
  onKeepJournal,
  onSaveJournal,
}) {
  const phase = tripPhase(trip, today)
  const days = groupByDate(activities)
  const todayGroup = days.find(d => d.date === today)
  const upcoming = days.filter(d => d.date > today)
  const past = days.filter(d => d.date < today)

  // Before the trip everything is "planned"; during it, only what's still ahead.
  const futureDays = phase === 'before' ? days : phase === 'during' ? upcoming : past
  const stay = accommodation?.[0]
  const entry = journal?.find(j => j.status === 'draft') ?? journal?.[0]

  if (error) {
    return (
      <div className="scroll" role="tabpanel">
        <div className="error-block">
          <span>Couldn't load your trip. Check your connection.</span>
          <button type="button" className="btn-link" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="scroll" role="tabpanel">
        <span className="empty">Loading…</span>
      </div>
    )
  }

  return (
    <div className="scroll" role="tabpanel">
      {phase === 'before' && trip && <TripCard trip={trip} today={today} />}

      {phase === 'during' && (
        <Section label="Today">
          {todayGroup ? (
            <DayCard date={todayGroup.date} items={todayGroup.items} isToday />
          ) : (
            <span className="empty">Nothing pinned to today. Ask the agent to plan it.</span>
          )}
        </Section>
      )}

      <Section label={phase === 'before' ? 'Planned' : phase === 'during' ? 'Next up' : 'The trip'}>
        {futureDays.length > 0 ? (
          futureDays.map(day => <DayCard key={day.date} date={day.date} items={day.items} />)
        ) : (
          <span className="empty">
            Nothing booked yet. When something's actually confirmed, tell the agent in chat and
            it'll pin it here.
          </span>
        )}
      </Section>

      <Section label="Stay">
        {stay ? (
          <StayCard stay={stay} phase={phase} />
        ) : (
          <span className="empty">
            No accommodation yet. Tell the agent where you're staying once it's booked.
          </span>
        )}
      </Section>

      {flights?.length > 0 && (
        <Section label="Flights">
          <FlightsCard flights={flights} today={today} />
        </Section>
      )}

      {entry && (
        <Section label="Journal">
          <JournalCard entry={entry} onKeep={onKeepJournal} onSave={onSaveJournal} />
        </Section>
      )}
    </div>
  )
}

/* Pre-trip stand-in for the Today card: the trip itself, with a countdown. */
function TripCard({ trip, today }) {
  const away = daysBetween(today, trip.start_date)
  const nights = daysBetween(trip.start_date, trip.end_date)
  return (
    <Section label="Trip">
      {/* No time column here — there are no times to align, and an empty one
          would indent the text against nothing. */}
      <div className="card card--sand" style={{ gap: 6 }}>
        <span className="day-date">
          {formatRange(trip.start_date, trip.end_date)}
          <span className="day-tag">{formatCountdown(away)}</span>
        </span>
        <span className="row-name">
          {nights} nights in {trip.title?.replace(/\s*\d{4}$/, '') || 'Salzburg'}
        </span>
        {trip.notes && <span className="stay-detail">{trip.notes}</span>}
      </div>
    </Section>
  )
}

function DayCard({ date, items, isToday = false }) {
  return (
    <div className={`card${isToday ? ' card--sand' : ''}`}>
      <span className="day-date">
        {formatDay(date)}
        {isToday && <span className="day-tag">today</span>}
      </span>
      {items.map(item => (
        <div className="row" key={item.id}>
          {/* Kept in the layout even when empty so names stay aligned. */}
          <span className="row-time">{formatTime(item.time)}</span>
          <div className="row-text">
            <span className="row-name">{item.name}</span>
            {(item.location || item.notes) && (
              <span className="row-detail">
                {[item.location, item.notes].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function StayCard({ stay, phase }) {
  const meta =
    phase === 'before'
      ? `${formatDay(stay.check_in)} – ${formatDay(stay.check_out)} · ${stay.status}`
      : phase === 'during'
        ? `Checked in ${formatDay(stay.check_in)} · out ${formatDay(stay.check_out)}`
        : `Checked out ${formatDay(stay.check_out)}`

  return (
    <div className="card" style={{ gap: 6 }}>
      <span className="stay-name">{stay.name}</span>
      {(stay.address || stay.notes) && (
        <span className="stay-detail">{[stay.address, stay.notes].filter(Boolean).join(' · ')}</span>
      )}
      <span className="meta">{meta}</span>
    </div>
  )
}

function FlightsCard({ flights, today }) {
  const { headline, footer } = pickFlights(flights, today)
  if (!headline) return null

  const away = daysBetween(today, headline.date)
  const when = [
    formatDay(headline.date),
    `${headline.departure_time} – ${headline.arrival_time}`,
    away >= 0 ? formatCountdown(away) : `flown ${formatDay(headline.date)}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="card card--sand" style={{ padding: '16px 18px', gap: 6 }}>
      <div className="flight-row">
        <span className="flight-route">
          {headline.from_airport} → {headline.to_airport}
        </span>
        <span className="flight-no">{headline.flight_number}</span>
      </div>
      <span className="flight-when">{when}</span>
      {footer && (
        <span className="meta">
          {footer.direction === 'outbound' ? 'Outbound' : 'Return'} {footer.flight_number} ·{' '}
          {footer.date < today ? `flown ${formatDay(footer.date)}` : formatDay(footer.date)}
        </span>
      )}
    </div>
  )
}

/* Edit happens in place — the design is explicit that there are no modals. */
function JournalCard({ entry, onKeep, onSave }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(entry.what_we_did ?? '')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')

  async function run(fn) {
    setBusy(true)
    setFailed('')
    try {
      await fn()
      setEditing(false)
    } catch (err) {
      setFailed(err.message || "Didn't save — try again")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ gap: 10 }}>
      <span className="meta">
        {formatDay(entry.date)} ·{' '}
        {entry.status === 'draft' ? 'drafted from your chat' : 'kept'}
      </span>

      {editing ? (
        <textarea
          className="journal-edit"
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={busy}
        />
      ) : (
        <span className="journal-prose">{entry.what_we_did || 'No notes yet.'}</span>
      )}

      {failed && <span className="error-inline">{failed}</span>}

      <div className="actions">
        {editing ? (
          <>
            <button
              type="button"
              className="btn-link"
              disabled={busy}
              onClick={() => run(() => onSave(entry.id, text))}
            >
              Save
            </button>
            <button
              type="button"
              className="btn-link"
              disabled={busy}
              onClick={() => {
                setText(entry.what_we_did ?? '')
                setEditing(false)
                setFailed('')
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-link" onClick={() => setEditing(true)}>
              Edit
            </button>
            {entry.status === 'draft' && (
              <button
                type="button"
                className="btn-link"
                disabled={busy}
                onClick={() => run(() => onKeep(entry.id))}
              >
                Keep
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
