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
  tripPhase,
} from '../lib/dates'

export default function Agenda({
  trip,
  activities,
  accommodation,
  carRental,
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
  // Cancelled rows stay in the table so the agent doesn't re-propose what was
  // just called off, but a dropped plan on the agenda is worse than no plan.
  const days = groupByDate(activities?.filter(a => a.status !== 'cancelled') ?? [])
  const todayGroup = days.find(d => d.date === today)
  const upcoming = days.filter(d => d.date > today)
  const past = days.filter(d => d.date < today)

  // Before the trip everything is "planned"; during it, only what's still ahead.
  const futureDays = phase === 'before' ? days : phase === 'during' ? upcoming : past
  // accommodation is ordered by check_in, and this trip has three legs. Before
  // departure every booked leg matters — showing only [0] would make legs 2 and
  // 3 look like they never saved, which is exactly the confusion save_accommodation
  // exists to end. Once you're travelling, the only useful answer is tonight's bed.
  const stays =
    phase === 'before'
      ? (accommodation ?? [])
      : [
          accommodation?.find(a => a.check_in <= today && today < a.check_out) ??
            accommodation?.find(a => a.check_in > today) ??
            accommodation?.[accommodation.length - 1],
        ].filter(Boolean)
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

      {/* 'Next up' pre-trip as well as during, not 'Planned': rows now carry a
          'planned' tag of their own, and a booked row under a Planned heading
          read as though it wasn't. 'Next up' is also what design-spec.md says. */}
      <Section label={phase === 'after' ? 'The trip' : 'Next up'}>
        {futureDays.length > 0 ? (
          futureDays.map(day => <DayCard key={day.date} date={day.date} items={day.items} />)
        ) : (
          <span className="empty">
            Nothing here yet. Tell the agent what you're doing on a day — booked or just decided —
            and it'll pin it here.
          </span>
        )}
      </Section>

      <Section label={stays.length > 1 ? 'Stays' : 'Stay'}>
        {stays.length > 0 ? (
          stays.map(stay => <StayCard key={stay.id} stay={stay} phase={phase} />)
        ) : (
          <span className="empty">
            No accommodation yet. Tell the agent where you're staying once it's booked.
          </span>
        )}
      </Section>

      {carRental?.length > 0 && (
        <Section label="Car">
          {carRental.map(car => (
            <CarCard key={car.id} car={car} today={today} />
          ))}
        </Section>
      )}

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
        {/* One line per fact: note_trip_fact writes a line at a time, and a
            single span would run the car booking into the open items. */}
        {tripNotes(trip).map(line => (
          <span className="stay-detail" key={line}>
            {line}
          </span>
        ))}
      </div>
    </Section>
  )
}

const tripNotes = trip =>
  (trip.notes ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

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
            <span className="row-name">
              {item.name}
              {/* Only 'planned' is tagged. Tagging 'booked' too would put a
                  label on nearly every row and make neither one mean anything. */}
              {item.status === 'planned' && <span className="day-tag">planned</span>}
            </span>
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

/* Dates, the time you can get in, and somewhere to navigate to. `notes` is
   deliberately not here: it carries cancellation terms and host preamble that
   matter to the agent and never to someone standing outside a door with a
   toddler on one arm. Ask the agent in chat and it has all of it. */
function StayCard({ stay, phase }) {
  const when =
    phase === 'before'
      ? formatRange(stay.check_in, stay.check_out)
      : phase === 'during'
        ? `Checked in ${formatDay(stay.check_in)} · out ${formatDay(stay.check_out)}`
        : `Checked out ${formatDay(stay.check_out)}`

  const times = [
    stay.check_in_time && `in ${stay.check_in_time}`,
    stay.check_out_time && `out ${stay.check_out_time}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="card" style={{ gap: 6 }}>
      <span className="stay-name">{stay.name}</span>
      {stay.address && <span className="stay-detail">{stay.address}</span>}
      {/* Status only when it isn't 'booked' — a label that's on every card is
          a label nobody reads, but 'researching' changes what the card means. */}
      <span className="meta">
        {[when, times, stay.status === 'booked' ? null : stay.status].filter(Boolean).join(' · ')}
      </span>
      <MapsLink url={stay.maps_url} query={[stay.name, stay.address].filter(Boolean).join(', ')} />
    </div>
  )
}

/* The car is a booking with two times and two places, so it reads like a flight
   rather than like a stay. Its `notes` stay off the card for the same reason the
   stay's do — the excess terms and the fuel policy are the agent's problem. */
function CarCard({ car, today }) {
  const away = daysBetween(today, car.pickup_date)
  const leg = (label, date, time, place) =>
    `${label} ${formatDay(date)}${time ? `, ${time}` : ''}${place ? ` · ${place}` : ''}`

  return (
    <div className="card" style={{ gap: 6 }}>
      <div className="flight-row">
        <span className="flight-route">{car.company}</span>
        {car.confirmation_ref && <span className="flight-no">{car.confirmation_ref}</span>}
      </div>
      {car.vehicle && <span className="flight-when">{car.vehicle}</span>}
      <span className="stay-detail">
        {leg('Pick-up', car.pickup_date, car.pickup_time, car.pickup_location)}
      </span>
      <span className="stay-detail">
        {leg('Drop-off', car.dropoff_date, car.dropoff_time, car.dropoff_location || car.pickup_location)}
      </span>
      <span className="meta">
        {[car.driver, away >= 0 ? formatCountdown(away) : null].filter(Boolean).join(' · ')}
      </span>
      <MapsLink url={car.maps_url} query={car.pickup_location} label="Pick-up in Maps" />
    </div>
  )
}

/* Accent is for times, links, and one primary action per screen — this is the
   link. An exact pin wins when someone has pasted one; otherwise a maps search
   on the name and address, which resolves for a named apartment or an airport
   desk and is worth more than no link at all. */
function MapsLink({ url, query, label = 'Open in Maps' }) {
  const href =
    url || (query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null)
  if (!href) return null
  return (
    <a className="card-link" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  )
}

/* Both legs, in full. The old version made the return a footnote — route and
   times on the outbound, a bare flight number and date underneath — which reads
   as a missing return rather than a quieter one. Eleven nights is long enough
   that the way home is not a detail. */
function FlightsCard({ flights, today }) {
  const list = [...(flights ?? [])].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const next = list.find(f => f.date >= today)
  if (!list.length) return null

  return (
    <div className="card card--sand" style={{ padding: '16px 18px', gap: 14 }}>
      {list.map(flight => {
        const away = daysBetween(today, flight.date)
        const when = [
          formatDay(flight.date),
          `${flight.departure_time} – ${flight.arrival_time}`,
          flight.id === next?.id ? formatCountdown(away) : flight.date < today ? 'flown' : null,
        ]
          .filter(Boolean)
          .join(' · ')

        return (
          <div key={flight.id} style={{ display: 'grid', gap: 4 }}>
            <div className="flight-row">
              <span className="flight-route">
                {flight.from_airport} → {flight.to_airport}
              </span>
              <span className="flight-no">{flight.flight_number}</span>
            </div>
            <span className="flight-when">{when}</span>
          </div>
        )
      })}
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
