// The review surface. Everything the agent catches in chat lands here as
// 'pending' and needs Keep / Not this one before it counts as saved — the design
// is explicit that nothing is ever posted without appearing here first.

import { useState } from 'react'
import Section from './Section'
import { formatDay } from '../lib/dates'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'food', label: 'Food' },
  { id: 'activity', label: 'Activity' },
  { id: 'day-trip', label: 'Day trip' },
]

// The design draws pills for three categories; the schema allows five.
const PILL = { food: 'food', activity: 'activity', 'day-trip': 'day-trip' }
const pillClass = category => `pill pill--${PILL[category] ?? 'other'}`

export default function Saved({ recommendations, loading, error, onRetry, onKeep, onReject }) {
  const [filter, setFilter] = useState('all')

  const visible =
    filter === 'all' ? recommendations : recommendations.filter(r => r.category === filter)
  const pending = visible.filter(r => r.status === 'pending')
  const kept = visible.filter(r => r.status === 'kept')
  const filterLabel = FILTERS.find(f => f.id === filter)?.label.toLowerCase()

  if (error) {
    return (
      <div className="scroll" role="tabpanel">
        <div className="error-block">
          <span>Couldn't load your saved places. Check your connection.</span>
          <button type="button" className="btn-link" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="filters">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            className={`filter${filter === f.id ? ' filter--on' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="scroll" role="tabpanel">
        {loading && <span className="empty">Loading…</span>}

        {!loading && recommendations.length === 0 && (
          <span className="empty">
            Nothing saved yet. Mention a place in chat — a restaurant, a hike, somewhere a friend
            raved about — and the agent will catch it here for you to keep or bin.
          </span>
        )}

        {/* Transient inbox: it unmounts when empty rather than saying "no new items". */}
        {pending.length > 0 && (
          <Section label={`Caught in chat · ${pending.length} new`}>
            {pending.map(rec => (
              <RecCard key={rec.id} rec={rec} pending onKeep={onKeep} onReject={onReject} />
            ))}
          </Section>
        )}

        {kept.length > 0 && (
          <Section label="Kept">
            <div className="rec-list">
              {kept.map(rec => (
                <RecCard key={rec.id} rec={rec} onReject={onReject} />
              ))}
            </div>
          </Section>
        )}

        {!loading && recommendations.length > 0 && visible.length === 0 && (
          <span className="empty">No {filterLabel} saved yet.</span>
        )}

        {!loading && kept.length === 0 && pending.length > 0 && (
          <span className="empty">Nothing kept yet. Keep one above and it'll settle here.</span>
        )}
      </div>
    </>
  )
}

function RecCard({ rec, pending = false, onKeep, onReject }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')

  async function run(fn) {
    setBusy(true)
    setFailed('')
    try {
      await fn()
    } catch (err) {
      // The row stays exactly as it was — nothing is removed optimistically, so
      // a failure can't make something look saved when it isn't.
      setFailed(err.message || "Didn't save — tap to retry")
      setBusy(false)
    }
  }

  const provenance = [rec.source ? `From ${rec.source}` : 'Caught in chat', formatDay(rec.created_at)]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={`card card--tight${pending ? ' card--sand' : ''}`}>
      <div className="rec-head">
        <span className="rec-name">{rec.name}</span>
        <span className={pillClass(rec.category)}>{rec.category.replace('-', ' ')}</span>
      </div>

      {(rec.notes || rec.location) && (
        <span className="rec-why">{[rec.notes, rec.location].filter(Boolean).join(' · ')}</span>
      )}

      {failed && <span className="error-inline">{failed}</span>}

      {pending ? (
        <>
          <span className="meta">{provenance}</span>
          <div className="rec-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => run(() => onKeep(rec.id))}
            >
              Keep
            </button>
            <button
              type="button"
              className="btn btn--outline"
              disabled={busy}
              onClick={() => run(() => onReject(rec.id))}
            >
              Not this one
            </button>
          </div>
        </>
      ) : (
        <div className="actions actions--spread">
          <span className="meta">{provenance}</span>
          <button
            type="button"
            className="btn-link"
            disabled={busy}
            onClick={() => run(() => onReject(rec.id))}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  )
}
