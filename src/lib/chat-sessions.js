// Reads and writes for chat_sessions and messages — the one module that knows
// those two tables, the way auth.js owns supabase.auth and trip-data.js owns the
// trip tables.
//
// A session bounds what gets sent to the API on a turn, and nothing else. The
// agent's memory is still buildSystemPrompt(), which rebuilds from eight tables
// on every message — so starting a new session loses nothing durable. Don't
// "fix" a forgotten fact by feeding another session's transcript into the
// prompt; the fix is a tool that writes it to a table.

import { supabase } from './supabase'

// One short call, and a title is not worth failing a turn over — so it gets a
// much tighter leash than the chat request in App.jsx.
const TITLE_TIMEOUT_MS = 15_000

// Long enough that the list is scannable, short enough that it can't push the
// header subtitle into a second line on a 375px phone.
const MAX_TITLE = 60
const FALLBACK_CHARS = 40

function unwrap({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

// 42P01 is Postgres undefined_table; PGRST205 is PostgREST failing to find it in
// the schema cache, which is what you actually get through the REST API.
const isMissingTable = error => error?.code === '42P01' || error?.code === 'PGRST205'

/**
 * Every session, newest activity first, each with its message count.
 *
 * Returns **null**, not [], when chat_sessions doesn't exist yet — the bundle
 * ships before someone pastes supabase-migration-004.sql into the SQL editor,
 * and null is what tells App.jsx to fall back to one undivided thread rather
 * than showing an empty chat. Same tolerance fetchPacking() has, same reason.
 */
export async function fetchSessions() {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .order('last_message_at', { ascending: false })

  if (error) {
    if (isMissingTable(error)) return null
    throw new Error(`Couldn't load your chats: ${error.message}`)
  }

  const counts = await fetchMessageCounts()
  return data.map(session => ({ ...session, message_count: counts.get(session.id) ?? 0 }))
}

/**
 * id -> count, in one request. A per-session `count` query would be one round
 * trip each; this pulls only the session_id column and tallies it here.
 */
async function fetchMessageCounts() {
  const { data, error } = await supabase.from('messages').select('session_id')
  const counts = new Map()
  // A count is decoration. If it fails, the list still lists.
  if (error || !data) return counts
  for (const row of data) {
    if (row.session_id) counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1)
  }
  return counts
}

/** One session's thread, oldest first. */
export async function fetchMessages(sessionId) {
  return unwrap(
    await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
    "Couldn't load this chat",
  )
}

/** Legacy mode only: every message as one thread, exactly as before PR 5. */
export async function fetchAllMessages() {
  return unwrap(
    await supabase.from('messages').select('*').order('created_at', { ascending: true }),
    "Couldn't load your chat",
  )
}

/**
 * Created lazily, on the first message — never on the New chat tap, or an
 * abandoned tap leaves an empty session in the list forever.
 *
 * `title` is the 40-character fallback, written now rather than after the
 * generated one arrives: a session that is never named is worse than one named
 * clumsily, and generateTitle() may not come back.
 */
export async function createSession({ title, startedBy }) {
  return unwrap(
    await supabase.from('chat_sessions').insert({ title, started_by: startedBy }).select().single(),
    "Couldn't start a new chat",
  )
}

/**
 * Bumps last_message_at, which is what the list sorts on. There's no trigger on
 * the table — same as updated_at elsewhere, see the note in trip-data.js.
 *
 * Deliberately swallows its error: this is sort order, and a turn that saved
 * both messages fine should not report a failure because a timestamp didn't move.
 */
export async function touchSession(sessionId) {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) console.error("Couldn't bump last_message_at:", error.message)
}

export async function setSessionTitle(sessionId, title) {
  return unwrap(
    await supabase
      .from('chat_sessions')
      .update({ title: title.slice(0, MAX_TITLE) })
      .eq('id', sessionId)
      .select()
      .single(),
    "Couldn't rename this chat",
  )
}

/**
 * The opening message, cut to 40 characters at a word boundary. Used the moment
 * a session is created, and left in place if generateTitle() fails.
 */
export function fallbackTitle(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return 'New chat'
  if (clean.length <= FALLBACK_CHARS) return clean
  const cut = clean.slice(0, FALLBACK_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * One short, tool-less call to /api/chat asking for a name for the thread.
 *
 * Returns null on anything at all going wrong — a bad response, a timeout, an
 * empty string. The caller keeps the fallback title. This runs after the reply
 * is already on screen, so it must never be able to take a turn down with it.
 */
export async function generateTitle({ firstUser, firstAssistant }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS)

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemPrompt:
          'You name chat threads in a travel-planning app. Reply with nothing but the ' +
          'name: at most 6 words, sentence case, no quotes, no final full stop. ' +
          'Name what the exchange is about, not what the assistant did.',
        messages: [
          {
            role: 'user',
            content: `Message:\n${firstUser}\n\nReply:\n${String(firstAssistant).slice(0, 500)}`,
          },
        ],
      }),
    })

    if (!response.ok) return null
    const data = await response.json()

    const text = (data.content ?? [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join(' ')

    return cleanTitle(text)
  } catch (error) {
    console.error("Couldn't name this chat:", error)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** A model can still preface, quote, or wax lyrical. Take the first line only. */
function cleanTitle(raw) {
  const title = String(raw ?? '')
    .split('\n')[0]
    .replace(/^["'`]|["'`.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return title ? title.slice(0, MAX_TITLE) : null
}
