// The review surface. Everything the agent catches in chat lands here as
// 'pending' and needs Keep / Not this one before it counts as saved — the design
// is explicit that nothing is ever posted without appearing here first.
//
// It also carries what the agent has *learned*, which is the one thing it
// remembers between sessions. Those rows are written live rather than reviewed —
// a preference stated in passing shouldn't need confirming — so this list is
// where they become visible and, more to the point, deletable. An over-read
// preference nobody can see quietly bends every suggestion after it.

import { useState } from 'react'
import Icon from './Icon'
import Section from './Section'
import { formatDay } from '../lib/dates'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'food', label: 'Food' },
  { id: 'activity', label: 'Activity' },
  { id: 'day-trip', label: 'Day trip' },
]

// The design draws pills for three categories; the schema allows five. Each of
// the three has a glyph beside the word — the accommodation and other rows fall
// back to the neutral pill and no icon, rather than borrowing one that would
// quietly mislabel them.
const PILL = { food: 'food', activity: 'activity', 'day-trip': 'day-trip' }
const PILL_ICON = { food: 'fork', activity: 'peak', 'day-trip': 'car' }
const pillClass = category => `pill pill--${PILL[category] ?? 'other'}`

export default function Saved({
  recommendations,
  learnings = [],
  loading,
  error,
  onRetry,
  onKeep,
  onReject,
  onForget,
}) {
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

        {!loading && recommendations.length === 0 && learnings.length === 0 && (
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

        {/* Only under "All". The filter pills sit directly above everything in
            this scroller and read as filtering all of it; a section that
            visibly ignored them would make the pills look broken. They name
            recommendation categories, and a learning has none. */}
        {!loading && filter === 'all' && learnings.length > 0 && (
          <Section label={`What the agent's learned · ${learnings.length}`}>
            <span className="empty">
              Picked up from things you've said in chat. This is what it carries into every new
              conversation — bin anything it read too much into.
            </span>
            <div className="rec-list">
              {learnings.map(l => (
                <LearningCard key={l.id} learning={l} onForget={onForget} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </>
  )
}

// One neutral pill for all five types rather than a colour each: the design
// draws three pill colours and they belong to the recommendation categories.
// Borrowing one here would say these rows are the same kind of thing.
function LearningCard({ learning, onForget }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')

  async function forget() {
    setBusy(true)
    setFailed('')
    try {
      await onForget(learning.id)
    } catch (err) {
      setFailed(err.message || "Didn't forget — tap to retry")
      setBusy(false)
    }
  }

  const learnedAt = learning.updated_at ?? learning.created_at

  return (
    <div className="card card--tight">
      <div className="rec-head">
        <span className="rec-name">{learning.note}</span>
        <span className="pill pill--other">{learning.type}</span>
      </div>

      {/* The quote is the check on the line above it. The note is the agent's
          paraphrase, and a paraphrase is exactly what drifts — seeing your own
          words is how you tell a preference you stated from one it inferred. */}
      {learning.source_message && (
        <span className="learned-quote">“{learning.source_message}”</span>
      )}

      <div className="rec-head">
        <span className="meta">
          {learning.tag}
          {learnedAt ? ` · ${formatDay(learnedAt)}` : ''}
        </span>
        <button
          type="button"
          className="rec-remove"
          onClick={forget}
          disabled={busy}
          aria-label={`Forget: ${learning.note}`}
        >
          <Icon name="trash" size={17} />
        </button>
      </div>

      {failed && <span className="error-inline">{failed}</span>}
    </div>
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
        <span className={pillClass(rec.category)}>
          {PILL_ICON[rec.category] && <Icon name={PILL_ICON[rec.category]} size={13} />}
          {rec.category.replace('-', ' ')}
        </span>
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
          {/* A glyph, not the word: a column of accent-orange "Remove"s outshouts
              the place names they belong to. The label moves to aria-label. */}
          <button
            type="button"
            className="rec-remove"
            disabled={busy}
            aria-label={`Remove ${rec.name}`}
            onClick={() => run(() => onReject(rec.id))}
          >
            <Icon name="trash" size={19} />
          </button>
        </div>
      )}
    </div>
  )
}
