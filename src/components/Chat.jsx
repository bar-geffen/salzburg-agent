// The chat surface. Presentational only — messages, the send handler and the
// whole tool loop stay in App.jsx, so switching tabs mid-turn can't unmount the
// component holding an in-flight request.

import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import Icon from './Icon'

// Two openers on an empty thread. Phase-neutral on purpose: the app is used for
// weeks before the trip and then every morning during it, and a starter that
// says "tomorrow" is wrong for most of that window. Both are things the
// traveller profile says these three actually ask for.
const STARTERS = ['What should we do with a free morning?', 'Somewhere easy for lunch with Amir']

// Enter sends on a real keyboard, Shift+Enter starts a new line. On a phone
// it's the other way round: a touch keyboard has no Shift+Enter, so sending on
// Enter would leave no way to type a bulleted list at all — the send button is
// an inch away instead. Read per keystroke, not once: the same tab can move
// between a phone and a desk without a reload.
const sendsOnEnter = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches

// Pasting into the composer by long-pressing it is genuinely hard on a phone:
// the field is a one-line pill right above the keyboard, the press lands on the
// placeholder as often as on the text layer, and iOS answers with the caret
// loupe instead of the Paste callout. So on a touch device the composer offers
// the paste itself — see the button swap below.
//
// Same matcher as above, read the same way and for the same reason, but this one
// is asking "is this a finger?", not "is there a Shift key?" — they happen to be
// the same question today and won't stay that way.
const isTouch = () => window.matchMedia('(hover: none)').matches

// Undefined outside a secure context, so the button is absent over plain http —
// which includes `npm run dev --host` opened from a phone on the LAN. On the
// deployed https app it's there. Nothing breaks either way: without it the slot
// holds the disabled Send button it has always held.
const canReadClipboard = () => typeof navigator.clipboard?.readText === 'function'

export default function Chat({
  messages,
  input,
  onInputChange,
  loading,
  error,
  onSubmit,
  focusSignal,
}) {
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const isFirstRender = useRef(true)

  useEffect(() => {
    // Jump instantly when arriving back from another tab or the Chats list,
    // animate for new messages — otherwise returning to Chat scrolls the whole
    // history past you.
    endRef.current?.scrollIntoView({ behavior: isFirstRender.current ? 'auto' : 'smooth' })
    isFirstRender.current = false
  }, [messages, loading])

  // A counter, not a boolean: tapping New chat twice has to focus twice, and an
  // already-true flag wouldn't fire the effect again.
  useEffect(() => {
    if (focusSignal) inputRef.current?.focus()
  }, [focusSignal])

  // Grow with the text up to the max-height in App.css, then scroll inside.
  // Keyed on `input` so it also shrinks back on the reset to '' after a send.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    // Clear first, so scrollHeight reports the text's height and not the last
    // one we set. An empty field is left to the min-height in App.css — writing
    // a measured height there pins whatever the stylesheet happened to be at
    // the first paint.
    el.style.height = ''
    // +2 for the border: everything here is border-box, so scrollHeight covers
    // the padding but not the 1px top and bottom, and the field would sit two
    // pixels short of its own text and grow a scrollbar.
    if (input) el.style.height = `${el.scrollHeight + 2}px`
  }, [input])

  // Only when the field is empty: there is nothing to lose to a full replace,
  // and it's the state where the send button is dead anyway. With text in the
  // field there is also something to long-press, which is what makes the native
  // menu appear reliably.
  const showPaste = !input && isTouch() && canReadClipboard()

  async function handlePaste() {
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      // Safari confirms a clipboard read with its own Paste button and rejects
      // if you don't tap it. Declining isn't an error to report back — fall
      // through to focusing the field, which is what the tap asked for anyway.
    }
    if (text) onInputChange(text)
    const el = inputRef.current
    if (!el) return
    el.focus()
    // Caret after the pasted text rather than wherever it was, and on the next
    // frame because the value arrives with React's re-render, not with the tap.
    requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length))
  }

  function handleKeyDown(e) {
    // isComposing: mid-IME Enter commits the candidate, it doesn't send.
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    if (!sendsOnEnter()) return
    // sendMessage calls preventDefault itself, so the newline is suppressed
    // even when it bails on an empty input or a turn already in flight.
    onSubmit(e)
  }

  return (
    <>
      <div className="chat-scroll" role="tabpanel">
        {messages.length === 0 && !loading && (
          <div className="chat-empty">
            <span className="chat-empty-head">
              <Icon name="sparkle" size={18} />
              <span className="chat-empty-title">New chat</span>
            </span>
            <span className="chat-empty-body">
              Ask about a day, save a place someone recommended, or tell me how today went. I'll
              keep the agenda and the saved list up to date.
            </span>
            <div className="chat-starters">
              {STARTERS.map(text => (
                <button
                  key={text}
                  type="button"
                  className="chat-starter"
                  disabled={loading}
                  // Sent straight away rather than dropped into the input: a
                  // starter you still have to press Send on is a slower way of
                  // typing, not a shortcut.
                  onClick={e => onSubmit(e, text)}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg =>
          msg.role === 'user' ? (
            <UserMessage key={msg.id} msg={msg} />
          ) : (
            <AgentMessage key={msg.id} msg={msg} />
          ),
        )}

        {loading && <Typing />}

        {error && <div className="error-inline">{error}</div>}

        <div ref={endRef} />
      </div>

      {/* The design put a Bar/Ori toggle here, from when the app was one phone
          passed between two people. The session decides now, so it's gone —
          msg.sender still drives the bubble tint and the name tag above. */}
      <form className="composer" onSubmit={onSubmit}>
        <div className="composer-row">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            // The phone keyboard's return key should say return, not Go: with
            // no Shift to pair it with, it's the only way to start a new line.
            enterKeyHint={sendsOnEnter() ? 'send' : 'enter'}
            placeholder="Ask your travel agent…"
          />
          {/* One slot, two buttons. Swapping rather than adding keeps the row the
              same width — a second circle would take 60px off a 375px field —
              and puts paste under the thumb already resting on send. */}
          {showPaste ? (
            <button type="button" className="paste" onClick={handlePaste}>
              Paste
            </button>
          ) : (
            <button
              type="submit"
              className="send"
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              <Icon name="send" size={22} />
            </button>
          )}
        </div>
      </form>
    </>
  )
}

// Agent replies now carry links out to the web — the Sources list under a
// researched answer, and whatever it cites inline. Tapping one must not replace
// the chat: this is a phone app with no back button of its own, and the thread
// you were reading is the thing you'd lose. rel is the pair that always goes
// with target="_blank".
const MD_COMPONENTS = {
  a: props => <a {...props} target="_blank" rel="noreferrer noopener" />,
}

// Markdown folds a lone newline into a space, so the two-line message someone
// typed as two lines came back as one. Two trailing spaces is markdown's own
// hard break. List items and headings already break on their own — this is for
// the plain lines between them.
function preserveLineBreaks(text) {
  return text.replace(/([^\n])\n(?!\n)/g, '$1  \n')
}

function UserMessage({ msg }) {
  const ori = msg.sender === 'Ori'
  return (
    <div className={`msg msg--user ${ori ? 'msg--ori' : 'msg--bar'}`}>
      <span className="sender-tag">
        <span className="sender-dot" aria-hidden="true" />
        {msg.sender}
      </span>
      <div className="msg-body">
        <ReactMarkdown components={MD_COMPONENTS}>
          {preserveLineBreaks(msg.content)}
        </ReactMarkdown>
      </div>
    </div>
  )
}

function AgentMessage({ msg }) {
  const { lead, rest } = splitLead(msg.content)

  return (
    <div className="msg msg--assistant">
      <div className="msg-body">
        {/* The sparkle marks the reply as the agent's. Where the reply opens with
            a heading — most day plans do — it sits on that line, which is what
            the design draws; otherwise it stands alone above the prose rather
            than being dropped, because then nothing would identify the speaker. */}
        <div className={`agent-head${lead ? '' : ' agent-head--bare'}`}>
          <Icon name="sparkle" size={16} />
          {lead && <ReactMarkdown components={MD_COMPONENTS}>{lead}</ReactMarkdown>}
        </div>
        <ReactMarkdown components={MD_COMPONENTS}>{rest}</ReactMarkdown>
      </div>
      <Saves lines={savesOf(msg)} />
    </div>
  )
}

/**
 * A reply's opening markdown heading, split off so the sparkle can share its
 * line. Anchored at the very start of the message — a heading three paragraphs
 * down is a section of the answer, not its title, and pulling the glyph down
 * there would leave the reply beginning anonymously.
 */
function splitLead(content) {
  const text = String(content ?? '')
  const match = text.match(/^#{1,6}[ \t]+[^\n]+/)
  if (!match) return { lead: '', rest: text }
  return { lead: match[0], rest: text.slice(match[0].length) }
}

/** Three dots, replacing "Thinking…". A turn can take most of a minute. */
function Typing() {
  return (
    <div className="typing" role="status" aria-label="The agent is replying">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  )
}

/**
 * What the agent wrote to the trip while it was answering. Without this the
 * only evidence a save happened is the agent claiming so in prose, which it
 * often doesn't — it saves two places and then answers the question it was
 * asked, and the user goes to the Saved tab expecting nothing.
 *
 * Rows written before content_json carried `saves` hold a bare block array;
 * those show nothing rather than breaking.
 */
function savesOf(msg) {
  const json = msg.content_json
  return Array.isArray(json) ? [] : (json?.saves ?? [])
}

// The design draws one strip. The executors write one line per tool call, and
// which line a call produced is the whole point of them — "Saved Café Bazar for
// review" and "Café Bazar — already saved" are different facts — so N lines get
// N strips rather than being joined into a sentence that claims less than it
// knows. One save, which is the common case, looks exactly like the design.
function Saves({ lines }) {
  if (!lines.length) return null
  return (
    <div className="msg-saves">
      {lines.map((line, i) => {
        // A failure must not wear the green "written" strip. App.jsx's tool-error
        // branch is the one thing in here that isn't a save, and it says so. The
        // tick is dropped rather than swapped: the icon set has no warning glyph,
        // and inventing one would be inventing design.
        const failed = /^Couldn't/.test(line)
        return (
          <span key={i} className={`write-strip${failed ? ' write-strip--failed' : ''}`}>
            {!failed && <Icon name="check" size={15} />}
            {line}
          </span>
        )
      })}
    </div>
  )
}
