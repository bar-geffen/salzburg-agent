// The chat surface. Presentational only — messages, the send handler and the
// whole tool loop stay in App.jsx, so switching tabs mid-turn can't unmount the
// component holding an in-flight request.

import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'

export default function Chat({
  messages,
  input,
  onInputChange,
  loading,
  error,
  onSubmit,
}) {
  const endRef = useRef(null)
  const isFirstRender = useRef(true)

  useEffect(() => {
    // Jump instantly when arriving back from another tab, animate for new
    // messages — otherwise returning to Chat scrolls the whole history past you.
    endRef.current?.scrollIntoView({ behavior: isFirstRender.current ? 'auto' : 'smooth' })
    isFirstRender.current = false
  }, [messages, loading])

  return (
    <>
      <div className="chat-scroll" role="tabpanel">
        {messages.length === 0 && !loading && (
          <div className="chat-empty">
            <span className="chat-empty-title">Salzburg, 15–26 September</span>
            <span className="chat-empty-body">
              Ask me anything — what to do on a given day, save a place someone recommended, or
              tell me how a day went. I'll keep the agenda and the saved list up to date.
            </span>
          </div>
        )}

        {messages.map(msg => {
          const isUser = msg.role === 'user'
          const tint = msg.sender === 'Ori' ? 'msg--ori' : 'msg--bar'
          return (
            <div
              key={msg.id}
              className={`msg ${isUser ? `msg--user ${tint}` : 'msg--assistant'}`}
            >
              {isUser && <span className="sender-tag">{msg.sender}</span>}
              <div className="msg-body">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          )
        })}

        {loading && (
          <div className="msg msg--assistant">
            <div className="msg-body is-loading">Thinking…</div>
          </div>
        )}

        {error && <div className="error-inline">{error}</div>}

        <div ref={endRef} />
      </div>

      {/* The design put a Bar/Ori toggle here, from when the app was one phone
          passed between two people. The session decides now, so it's gone —
          msg.sender still drives the bubble tint and the name tag above. */}
      <form className="composer" onSubmit={onSubmit}>
        <div className="composer-row">
          <input
            type="text"
            value={input}
            onChange={e => onInputChange(e.target.value)}
            placeholder="Ask your travel agent…"
          />
          <button type="submit" className="send" disabled={loading || !input.trim()} aria-label="Send">
            ↑
          </button>
        </div>
      </form>
    </>
  )
}
