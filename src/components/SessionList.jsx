// The Chats list, opened from the header's switcher pill. It replaces the thread
// in place rather than opening over it — design-spec.md: no modals, no routes.
//
// Presentational, like every other tab component: App.jsx owns the sessions, the
// messages, and the tool loop. The only thing computed here is the grouping,
// which is a function of the rows being rendered and nothing else.

import Icon from './Icon'
import { daysBetween, shortRelativeDay, todayISO, toISODate } from '../lib/dates'

// The design draws two groups and no more. A month-by-month breakdown would be
// right for an archive; this list holds one trip's chats, so "recent" and
// "everything else" is the whole distinction that matters.
const RECENT_DAYS = 7

export default function SessionList({
  sessions,
  currentSessionId,
  onSelect,
  onNew,
  onRefresh,
  refreshing,
  onSignOut,
}) {
  const groups = groupSessions(sessions)

  return (
    <div className="chats-scroll" role="tabpanel">
      {/* Primary and first, not a trailing "+": starting a fresh chat is the
          most likely reason to be on this screen at all. */}
      <button type="button" className="chats-new" onClick={onNew}>
        <span className="chats-new-tile">
          <Icon name="plus" size={21} />
        </span>
        <span className="chats-new-label">New chat</span>
        <span className="chats-new-caret">
          <Icon name="chevron-right" size={18} />
        </span>
      </button>

      {sessions.length === 0 ? (
        <span className="empty">
          No chats yet. Ask the agent something and this is where the thread will live.
        </span>
      ) : (
        groups.map(group => (
          <div className="chats-group" key={group.label}>
            <span className="section-label">{group.label}</span>
            {group.items.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                current={session.id === currentSessionId}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))
      )}

      {/* Refresh and Sign out live here. The design gave the Chat header's whole
          first row to the switcher and the + button, and there is no room beside
          them at 375px — so the two bits of app chrome move to the one screen
          that is about the app rather than about the trip. */}
      <div className="chats-chrome">
        <button type="button" className="refresh" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        {/* Rare, but it has to exist: a wrong-account sign-in is otherwise
            unrecoverable on a phone. */}
        <button type="button" className="signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}

function SessionCard({ session, current, onSelect }) {
  const count = session.message_count ?? 0
  const starter = session.starter

  return (
    <button
      type="button"
      className={`session-card${current ? ' session-card--on' : ''}`}
      onClick={() => onSelect(session.id)}
    >
      <span className="session-tile">
        <Icon name={session.topic ?? 'bubble'} size={19} />
      </span>

      <span className="session-text">
        <span className="session-title-row">
          <span className="session-title">{session.title || 'Untitled chat'}</span>
          {/* The dot, not the word "Current": the card is already tinted, and at
              this size a second label crowds out the title it's qualifying. */}
          {current && <span className="session-dot" aria-hidden="true" />}
          {current && <span className="sr-only">— current chat</span>}
        </span>

        <span className="session-meta">
          <span className="session-meta-pair">
            <Icon name="clock" size={13} />
            {shortRelativeDay(session.last_message_at)}
          </span>
          <span className="session-meta-pair">
            <Icon name="bubble" size={13} />
            {count}
          </span>
          {/* Omitted rather than guessed when nobody is recorded — the thread
              migration 004 backfilled has no opening sender to read. */}
          {starter && (
            <span className={`session-meta-pair session-starter${starter === 'Ori' ? ' session-starter--ori' : ''}`}>
              <span className="session-starter-dot" aria-hidden="true" />
              {starter}
            </span>
          )}
        </span>
      </span>

      <span className="session-caret">
        <Icon name="chevron-right" size={18} />
      </span>
    </button>
  )
}

/**
 * [{ label, items }] in the order the design draws them, empty groups dropped.
 *
 * The incoming order is preserved inside each group — App.jsx hands these over
 * exactly as `last_message_at desc` returned them, and that same order is what
 * the header's "Chat 3 of 7" counts against. Re-sorting here would make the two
 * disagree.
 */
function groupSessions(sessions) {
  const today = todayISO()
  const recent = []
  const earlier = []

  for (const session of sessions) {
    const stamp = session.last_message_at && new Date(session.last_message_at)
    const age =
      stamp && !Number.isNaN(stamp.getTime()) ? daysBetween(toISODate(stamp), today) : Infinity
    // A future timestamp (a phone with a fast clock) is recent, not ancient.
    ;(age < RECENT_DAYS ? recent : earlier).push(session)
  }

  return [
    { label: 'This week', items: recent },
    { label: 'Earlier', items: earlier },
  ].filter(group => group.items.length > 0)
}
