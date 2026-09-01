import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { displayNameFor, signInWithGoogle, signOut, useSession } from './lib/auth'
import { buildSystemPrompt } from './lib/build-system-prompt'
import { TOOLS, executeTool } from './lib/tools'
import { useTripData } from './lib/use-trip-data'
import { todayISO, tripSubtitle } from './lib/dates'
import TabBar from './components/TabBar'
import Chat from './components/Chat'
import Agenda from './components/Agenda'
import Saved from './components/Saved'
import Packing from './components/Packing'
import './App.css'

// Each round trip is one API call, so this bounds cost and latency as much as it
// prevents a runaway loop. Five is generous: a turn that saves a recommendation,
// logs the day, and replies uses two.
const MAX_TOOL_ITERATIONS = 5

// A hung request would otherwise spin forever — the fetch has no default
// timeout, and hotel wifi drops connections without closing them.
const REQUEST_TIMEOUT_MS = 60_000

const TITLES = { chat: 'Salzburg', agenda: 'Agenda', saved: 'Saved', packing: 'Packing' }

// The app proper. Mounted only for an allowlisted session, which is what keeps
// useTripData and loadMessages from firing for a signed-out visitor and coming
// back with empty arrays that look like "no trip yet".
function TripApp({ sender }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('chat')
  const [online, setOnline] = useState(() => navigator.onLine)

  // One load and one refresh path for all seven trip tables, held here so tabs
  // don't refetch on every switch and the header can show Saved's counts while
  // you're looking at Chat.
  const trip = useTripData()
  const today = todayISO()

  useEffect(() => {
    loadMessages()
  }, [])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  async function loadMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
    if (data) setMessages(data)
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const text = input.trim()
    const userMessage = { role: 'user', sender, content: text }

    const { data: savedMsg, error: saveError } = await supabase
      .from('messages')
      .insert(userMessage)
      .select()
      .single()

    if (saveError || !savedMsg) {
      setError("Couldn't save your message. Check your connection and try again.")
      return
    }

    const updatedMessages = [...messages, savedMsg]
    setMessages(updatedMessages)
    setInput('')
    setError('')
    setLoading(true)

    try {
      const systemPrompt = await buildSystemPrompt()

      // The tool loop runs in memory. Only the user's message and the agent's
      // final reply are persisted — the intermediate tool_use / tool_result
      // turns are not, deliberately:
      //
      //   - What the tools wrote is already in Supabase, and buildSystemPrompt()
      //     re-reads every table on the next message, so nothing is forgotten.
      //   - Persisting tool_use blocks without their results would produce a
      //     history the API rejects if the page reloads mid-loop.
      //   - The messages table stays free of plumbing the UI would have to hide.
      const apiMessages = updatedMessages.map(m => ({ role: m.role, content: m.content }))

      let finalBlocks = []
      const spokenText = []
      let hitIterationCap = true

      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const response = await postChat({ systemPrompt, messages: apiMessages })

        const data = await response.json()
        if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`)

        finalBlocks = data.content ?? []

        // Text can arrive alongside tool calls, so collect it every pass rather
        // than only reading the last response.
        const spoken = finalBlocks
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n\n')
          .trim()
        if (spoken) spokenText.push(spoken)

        if (data.stop_reason !== 'tool_use') {
          hitIterationCap = false
          break
        }

        const toolUses = finalBlocks.filter(block => block.type === 'tool_use')

        // Run them concurrently, but return every result in a single user
        // message — splitting them across messages teaches the model to stop
        // making parallel calls. A failed tool comes back as an error result
        // rather than throwing, so the agent can adapt instead of the turn dying.
        const toolResults = await Promise.all(
          toolUses.map(async block => {
            try {
              return {
                type: 'tool_result',
                tool_use_id: block.id,
                content: await executeTool(block.name, block.input),
              }
            } catch (toolError) {
              console.error(`Tool ${block.name} failed:`, toolError)
              return {
                type: 'tool_result',
                tool_use_id: block.id,
                content: toolError.message,
                is_error: true,
              }
            }
          }),
        )

        apiMessages.push({ role: 'assistant', content: finalBlocks })
        apiMessages.push({ role: 'user', content: toolResults })
      }

      if (hitIterationCap) {
        spokenText.push(
          `_(I stopped after ${MAX_TOOL_ITERATIONS} rounds of saving things. Anything already saved is safe — ask me to carry on if something's missing.)_`,
        )
      }

      const reply = spokenText.join('\n\n').trim()
      if (!reply) throw new Error('The agent returned an empty response.')

      // content is the plain-text rendering; content_json keeps the final block
      // array for debugging and future replay.
      const { data: savedAssistant, error: assistantError } = await supabase
        .from('messages')
        .insert({ role: 'assistant', sender: 'Agent', content: reply, content_json: finalBlocks })
        .select()
        .single()

      if (assistantError || !savedAssistant) throw new Error("Couldn't save the reply.")

      setMessages(prev => [...prev, savedAssistant])

      // The agent may have just written a recommendation, journal draft, or
      // packing item.
      trip.refreshTable('recommendations')
      trip.refreshTable('journal')
      trip.refreshTable('activities')
      trip.refreshTable('packing')
    } catch (err) {
      console.error('Failed to send message:', err)
      setError(
        err.name === 'AbortError'
          ? 'That took too long. Try again.'
          : err.message || 'Something went wrong. Try again.',
      )
      // Give the text back rather than losing what they typed.
      setInput(prev => prev || text)
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    try {
      await signOut()
    } catch (err) {
      setError(err.message)
    }
  }

  const pendingCount = trip.recommendations.filter(r => r.status === 'pending').length
  const keptCount = trip.recommendations.filter(r => r.status === 'kept').length
  const toPack = trip.packing.filter(p => !p.packed).length
  const subtitle =
    tab === 'saved'
      ? [pendingCount > 0 && `${pendingCount} new`, `${keptCount} kept`].filter(Boolean).join(' · ')
      : tab === 'packing'
        ? trip.packing.length === 0
          ? 'Nothing on the list'
          : toPack === 0
            ? 'All packed'
            : `${toPack} to pack`
        : tripSubtitle(trip.trip, today)

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-titlebar">
          {/* Title and actions share a row; the subtitle gets the full width
              below them. Two actions plus the longest subtitle ("STARTS TUE 15
              SEPT · IN 2 WEEKS") don't fit on one line at 375px. */}
          <div className="app-title-row">
            <span className="title">{TITLES[tab]}</span>
            <div className="header-actions">
              <button
                type="button"
                className="refresh"
                onClick={() => trip.refreshAll()}
                disabled={trip.refreshing}
              >
                {trip.refreshing ? '…' : 'Refresh'}
              </button>
              {/* Rare, but it has to exist: a wrong-account sign-in is otherwise
                  unrecoverable on a phone. Muted rather than accent — the design
                  allows one accent action per screen and Refresh has it. */}
              <button type="button" className="signout" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>
          <span className="subtitle">{subtitle}</span>
        </div>
        <TabBar value={tab} onChange={setTab} />
      </header>

      {!online && <div className="banner">Offline — changes will fail until you reconnect.</div>}

      {tab === 'chat' && (
        <Chat
          messages={messages}
          input={input}
          onInputChange={setInput}
          loading={loading}
          error={error}
          onSubmit={sendMessage}
        />
      )}

      {tab === 'agenda' && (
        <Agenda
          trip={trip.trip}
          activities={trip.activities}
          accommodation={trip.accommodation}
          flights={trip.flights}
          journal={trip.journal}
          today={today}
          loading={trip.loading}
          error={trip.error}
          onRetry={trip.refreshAll}
          onKeepJournal={trip.keepJournal}
          onSaveJournal={trip.saveJournal}
        />
      )}

      {tab === 'saved' && (
        <Saved
          recommendations={trip.recommendations}
          loading={trip.loading}
          error={trip.error}
          onRetry={trip.refreshAll}
          onKeep={trip.keepRec}
          onReject={trip.rejectRec}
        />
      )}

      {tab === 'packing' && (
        <Packing
          packing={trip.packing}
          sender={sender}
          loading={trip.loading}
          error={trip.error}
          onRetry={trip.refreshAll}
          onSetPacked={trip.setPacked}
          onAdd={trip.addPacking}
          onRemove={trip.removePacking}
        />
      )}
    </div>
  )
}

// Three states, per session2-spec.md. The middle one is the whole point: a
// Google account that isn't on the allowlist authenticates *successfully* —
// Supabase creates the user and the JWT is valid — and then reads nothing from
// every table. Branching only on "session or no session" would show that person,
// or either of us on the wrong Google account, a fully-loaded app with an empty
// trip and no explanation.
function App() {
  const { session, loading } = useSession()

  // getSession() reads persisted storage asynchronously; without this the
  // sign-in screen flashes at someone who is already signed in.
  if (loading) return <Splash />
  if (!session) return <SignIn />

  const sender = displayNameFor(session)
  if (!sender) return <NotOnThisTrip email={session.user.email} />

  return <TripApp sender={sender} />
}

function Splash() {
  return (
    <div className="gate">
      <h1 className="gate-title">Salzburg 2026</h1>
    </div>
  )
}

function SignIn() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function start() {
    setBusy(true)
    setError('')
    try {
      // On success the browser navigates to Google and never comes back here.
      await signInWithGoogle()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="gate">
      <h1 className="gate-title">Salzburg 2026</h1>
      <p className="gate-sub">Sign in to open the trip.</p>
      <div className="gate-buttons">
        <button type="button" onClick={start} disabled={busy}>
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>
      </div>
      {error && <p className="gate-error">{error}</p>}
    </div>
  )
}

function NotOnThisTrip({ email }) {
  const [error, setError] = useState('')

  async function leave() {
    setError('')
    try {
      await signOut()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="gate">
      <h1 className="gate-title">Not on this trip</h1>
      <p className="gate-sub">
        Signed in as <span className="gate-email">{email}</span>, who isn't on this trip. Sign out
        and try another account.
      </p>
      <div className="gate-buttons">
        <button type="button" onClick={leave}>
          Sign out
        </button>
      </div>
      {error && <p className="gate-error">{error}</p>}
    </div>
  )
}

/** POST to /api/chat with a hard timeout. */
async function postChat(body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, tools: TOOLS }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export default App
