// Stands in for src/lib/chat-sessions.js. Six sessions spanning both date groups
// and every topic icon, plus one with no title and no starter — the row migration
// 004 backfilled, which is the case the real list has to not guess at.

const day = n => new Date(Date.now() - n * 86400000).toISOString()

const SESSIONS = [
  { id: 's1', title: 'Rainy Thursday', last_message_at: day(0), message_count: 14, starter: 'Ori', topic: 'sparkle' },
  { id: 's2', title: 'Hallstatt logistics', last_message_at: day(2), message_count: 22, starter: 'Ori', topic: 'car' },
  { id: 's3', title: 'Where to eat with a toddler', last_message_at: day(3), message_count: 9, starter: 'Bar', topic: 'fork' },
  { id: 's4', title: 'Untersberg & cable car', last_message_at: day(24), message_count: 11, starter: 'Bar', topic: 'peak' },
  { id: 's5', title: 'Arrival day', last_message_at: day(26), message_count: 31, starter: 'Bar', topic: 'pin' },
  { id: 's6', title: null, last_message_at: day(40), message_count: 4, starter: null, topic: 'bubble' },
]

const THREADS = {
  s1: [
    { id: 'm1', role: 'user', sender: 'Ori', content: 'It’s raining till noon. Rework today so Amir naps indoors?' },
    {
      id: 'm2',
      role: 'assistant',
      sender: 'Agent',
      // Opens with a heading, so the sparkle sits on that line.
      content:
        '## Rainy-morning Thursday\n\nI moved the fountains to Saturday — they’re outdoors and half the fun is getting soaked on purpose.\n\n- **09:30** Haus der Natur — Museumsplatz, 6 min walk\n- **12:15** Café Tomaselli — Getreidegasse, saved Tuesday\n- **13:30** Nap at the apartment — Steingasse 14',
      content_json: { blocks: [], saves: ['Agenda updated · Haus der Natur', 'Saved Café Tomaselli for review'] },
    },
    { id: 'm3', role: 'user', sender: 'Bar', content: 'Perfect. Stroller ok at Tomaselli?' },
    {
      id: 'm4',
      role: 'assistant',
      sender: 'Agent',
      // Opens with prose, so the sparkle stands alone above it.
      content:
        'Ground floor is tight, but there’s a stroller room by the stairs and the first-floor salon has space. Go before 11:30 and you’ll get a window table.',
      content_json: { blocks: [], saves: [] },
    },
    {
      id: 'm5',
      role: 'assistant',
      sender: 'Agent',
      content: 'One more thing — the lake road is closed until Friday.',
      // A tool that threw: the strip must not be green.
      content_json: { blocks: [], saves: ["Couldn't save that — the activity wasn't found"] },
    },
  ],
  s2: [{ id: 'h1', role: 'user', sender: 'Ori', content: 'Is Hallstatt worth it with a toddler? Train or car?' }],
}

export async function fetchSessions() {
  return globalThis.__legacy ? null : SESSIONS
}
export async function fetchMessages(id) {
  return THREADS[id] ?? []
}
export async function fetchAllMessages() {
  return THREADS.s1
}
export async function createSession({ title }) {
  return { id: 'new', title }
}
export async function touchSession() {}
export async function setSessionTitle() {}
export function fallbackTitle(text) {
  return text.slice(0, 40)
}
export async function generateTitle() {
  return null
}
export function topicFor() {
  return 'sparkle'
}
