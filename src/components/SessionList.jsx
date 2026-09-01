// The session switcher, opened from the Chat tab's header subtitle. It replaces
// the thread in place rather than opening over it — design-spec.md: no modals.
//
// Presentational, like every other tab component: App.jsx owns the sessions, the
// messages, and the tool loop.

import Section from './Section'
import { relativeDay } from '../lib/dates'

export default function SessionList({ sessions, currentSessionId, onSelect, onNew }) {
  return (
    <div className="scroll" role="tabpanel">
      <div>
        <button type="button" className="btn btn--primary" onClick={onNew}>
          New chat
        </button>
      </div>

      {sessions.length === 0 ? (
        <span className="empty">
          No chats yet. Ask the agent something and this is where the thread will live.
        </span>
      ) : (
        <Section label={`${sessions.length} chat${sessions.length === 1 ? '' : 's'}`}>
          <div className="rec-list">
            {sessions.map(session => {
              const current = session.id === currentSessionId
              const count = session.message_count ?? 0
              const meta = [
                relativeDay(session.last_message_at),
                `${count} message${count === 1 ? '' : 's'}`,
                current && 'Current',
              ]
                .filter(Boolean)
                .join(' · ')

              return (
                <button
                  key={session.id}
                  type="button"
                  // Sand is the design's "today / pending" tint; it marks the
                  // session you're in without spending the accent, which
                  // design-spec.md reserves for one action per screen.
                  className={`card card--tight session-card${current ? ' card--sand' : ''}`}
                  onClick={() => onSelect(session.id)}
                >
                  <span className="rec-name">{session.title || 'Untitled chat'}</span>
                  <span className="meta">{meta}</span>
                </button>
              )
            })}
          </div>
        </Section>
      )}
    </div>
  )
}
