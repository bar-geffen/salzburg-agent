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

// Long enough that the list is scannable. The header's switcher pill ellipsises
// rather than wrapping, so this is about the Chats list, where a title this long
// already fills the card's width on a 375px phone.
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
 * Every session, newest activity first, each carrying the three things the list
 * renders beyond its title: how many messages it holds, who started it, and a
 * topic key for its icon.
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

  const stats = await fetchSessionStats()
  return data.map(session => {
    const stat = stats.get(session.id)
    return {
      ...session,
      message_count: stat?.count ?? 0,
      // The first user message's sender, per the design. started_by is the
      // fallback rather than the source: it's right for every session the app
      // created, but null on the one migration 004 backfilled, and that thread
      // does have a first message to read it off.
      starter: stat?.starter ?? session.started_by ?? null,
      topic: topicFor(session.title),
    }
  })
}

/**
 * id -> { count, starter }, in one request. A per-session query would be one
 * round trip each; this pulls three narrow columns for every message and
 * tallies them here. Deliberately not `content` — the list needs none of it,
 * and the whole transcript of every chat is the one thing that would make this
 * slow.
 */
async function fetchSessionStats() {
  const { data, error } = await supabase
    .from('messages')
    .select('session_id, role, sender')
    .order('created_at', { ascending: true })

  const stats = new Map()
  // Counts and attribution are decoration. If this fails, the list still lists.
  if (error || !data) return stats
  for (const row of data) {
    if (!row.session_id) continue
    const stat = stats.get(row.session_id) ?? { count: 0, starter: null }
    stat.count += 1
    // Ascending order, so the first user row we see is the opening message.
    if (!stat.starter && row.role === 'user' && row.sender) stat.starter = row.sender
    stats.set(row.session_id, stat)
  }
  return stats
}

// Which icon a chat gets, matched on its title. The title is generated from the
// opening exchange and is the only summary of a thread available without
// loading it, so it's the honest thing to read — matching on the transcript
// would mean fetching every message's content to draw a 19px glyph.
//
// Deliberately coarse, and it fails soft: an unmatched title gets `sparkle`,
// which reads as "general chat" rather than as a wrong guess. An *untitled*
// session gets `bubble`, because there's nothing to have guessed from.
//
// The terminator is `(?!\w)` rather than `\b`: a word ending in a non-ASCII
// letter has no word boundary after it, so `/caf[eé]\b/` matches "cafe" and
// silently misses "café" — the same accent trap save_recommendation has.
const TOPICS = [
  // Aerial lifts are matched before anything else, because the bare `car` in the
  // day-trip pattern below otherwise claims "cable car" and files a mountain
  // morning as a drive.
  [/\b(cable.?car|gondola|funicular|chair.?lift)(?!\w)/i, 'peak'],
  [/\b(driv\w*|car|day.?trip|hallstatt|road|parking|route|rental)(?!\w)/i, 'car'],
  [/\b(eat\w*|ate|food|dinner|lunch|breakfast|caf[eé]\w*|restaurant\w*|cake|coffee|meal\w*|bakery|pizza)(?!\w)/i, 'fork'],
  [/\b(hik\w*|walk\w*|peak|berg|mountain|summit|cable.?car|gondola|lake|swim\w*|trail)(?!\w)/i, 'peak'],
  [/\b(arriv\w*|check.?(in|out)|apartment|stay\w*|flight|land\w*|airport)(?!\w)/i, 'pin'],
]

export function topicFor(title) {
  const text = String(title ?? '').trim()
  if (!text) return 'bubble'
  for (const [pattern, icon] of TOPICS) if (pattern.test(text)) return icon
  return 'sparkle'
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
