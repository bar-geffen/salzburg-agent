// The packing list. 160-odd items across eleven categories, so everything is
// collapsed on arrival — the landing state is an eleven-row index of what's
// left, not a wall of checkboxes.
//
// Collapse state is local and deliberately not persisted: reopening the tab
// should give you the overview again, not wherever you happened to be scrolled.

import { useState } from 'react'
import Section from './Section'
import { PACKING_CATEGORIES, PACKING_STRATEGY } from '../lib/packing'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'To pack' },
]

export default function Packing({
  packing,
  sender,
  loading,
  error,
  onRetry,
  onSetPacked,
  onAdd,
  onRemove,
}) {
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState({})

  if (error) {
    return (
      <div className="scroll" role="tabpanel">
        <div className="error-block">
          <span>Couldn't load the packing list. Check your connection.</span>
          <button type="button" className="btn-link" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  // Categories the schema knows about, in the order the list is meant to be
  // read. An empty one is dropped rather than shown as "0/0".
  const groups = PACKING_CATEGORIES.map(({ id, label }) => {
    const items = packing.filter(p => p.category === id)
    return { id, label, items, left: items.filter(p => !p.packed).length }
  })
    .filter(g => g.items.length > 0)
    // Under "To pack", a finished category is noise — you're asking what's left.
    .filter(g => filter === 'all' || g.left > 0)

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

        {!loading && packing.length === 0 && (
          <span className="empty">
            The packing list is empty. Run supabase-migration-002.sql to seed it, or ask the agent
            to start adding things.
          </span>
        )}

        {packing.length > 0 && (
          <div className="card card--sand card--tight">
            <span className="pack-strategy">{PACKING_STRATEGY}</span>
          </div>
        )}

        {groups.map(group => (
          <PackCategory
            key={group.id}
            group={group}
            filter={filter}
            open={!!open[group.id]}
            onToggleOpen={() => setOpen(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
            sender={sender}
            onSetPacked={onSetPacked}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        ))}

        {!loading && packing.length > 0 && groups.every(g => g.left === 0) && (
          <span className="empty">Everything's ticked off. Have a good trip.</span>
        )}
      </div>
    </>
  )
}

function PackCategory({ group, filter, open, onToggleOpen, sender, onSetPacked, onAdd, onRemove }) {
  const { id, label, items, left } = group
  const packed = items.length - left
  const visible = filter === 'open' ? items.filter(p => !p.packed) : items

  // The count doubles as the disclosure control, so the whole header row is the
  // tap target rather than a caret you have to aim at on a phone.
  const count = (
    <button type="button" className="pack-count" onClick={onToggleOpen} aria-expanded={open}>
      {packed}/{items.length}
      <span className="pack-caret" aria-hidden="true">
        {open ? '▾' : '▸'}
      </span>
    </button>
  )

  return (
    <Section label={label} action={count}>
      {open && (
        <div className="pack-list">
          {visible.map(item => (
            <PackRow
              key={item.id}
              item={item}
              sender={sender}
              onSetPacked={onSetPacked}
              onRemove={onRemove}
            />
          ))}

          <AddRow category={id} sender={sender} onAdd={onAdd} />
        </div>
      )}
    </Section>
  )
}

function PackRow({ item, sender, onSetPacked, onRemove }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')

  // Nothing moves optimistically. A tick that failed to save must not look
  // packed — that's the one bug a packing list can't afford.
  async function run(fn) {
    setBusy(true)
    setFailed('')
    try {
      await fn()
    } catch (err) {
      setFailed(err.message || "Didn't save — try again")
    } finally {
      setBusy(false)
    }
  }

  const note = item.packed
    ? item.packed_by && `Packed by ${item.packed_by}`
    : item.added_by === 'agent' && 'Added by the agent'

  return (
    <div className={`pack-row${item.packed ? ' pack-row--done' : ''}`}>
      <label className="pack-check">
        <input
          type="checkbox"
          checked={item.packed}
          disabled={busy}
          onChange={e => run(() => onSetPacked(item.id, e.target.checked, sender))}
        />
        {/* dir="auto" so the Hebrew items read right-to-left without a wrapper */}
        <span className="pack-name" dir="auto">
          {item.name}
        </span>
      </label>

      <button
        type="button"
        className="btn-link pack-remove"
        disabled={busy}
        onClick={() => run(() => onRemove(item.id))}
      >
        Remove
      </button>

      {note && <span className="meta pack-note">{note}</span>}
      {failed && <span className="error-inline pack-note">{failed}</span>}
    </div>
  )
}

function AddRow({ category, sender, onAdd }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')

  async function submit(e) {
    e.preventDefault()
    const name = value.trim()
    if (!name || busy) return
    setBusy(true)
    setFailed('')
    try {
      await onAdd(name, category, sender)
      setValue('')
    } catch (err) {
      // Keep what they typed — retyping an item is worse than a visible error.
      setFailed(err.message || "Couldn't add that")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="pack-add" onSubmit={submit}>
      <input
        type="text"
        className="pack-input"
        placeholder="Add item…"
        value={value}
        onChange={e => setValue(e.target.value)}
        disabled={busy}
      />
      <button type="submit" className="btn-link" disabled={busy || !value.trim()}>
        Add
      </button>
      {failed && <span className="error-inline pack-note">{failed}</span>}
    </form>
  )
}
