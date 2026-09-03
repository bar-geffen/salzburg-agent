// Vercel serverless function — proxies chat to the Claude API.
// This keeps ANTHROPIC_API_KEY on the server, never exposed to the browser.
//
// The handler is a thin pass-through: it returns Claude's raw content blocks
// and stop_reason so the client can run the tool loop (tools write to Supabase,
// which the client already has a session for).

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 8192

// What the app says when Claude refuses. A bare "Claude API error (401)" is
// the failure that explains nothing — the same thing the blank-page work and
// the flight-status spec exist to avoid — and 401 in particular is not a
// network blip you retry, it's a key someone has to go and fix.
//
// Claude's own error bodies aren't for a phone screen, so they stay in the
// server log (console.error below) and these go to the user. Anything not
// listed falls back to the status code, which is honest about not knowing.
const MESSAGES = {
  400: 'Claude rejected the request. This is a bug, not something you did.',
  401: "The server's Anthropic API key was rejected. Check ANTHROPIC_API_KEY: it has probably been rotated, or picked up a stray quote or newline when it was pasted.",
  403: "The server's Anthropic API key isn't allowed to do that. Check ANTHROPIC_API_KEY.",
  404: `The model ${MODEL} isn't available to this API key.`,
  413: "That was too long for one request. Start a new chat and ask again.",
  429: 'Too many requests to Claude just now. Wait a moment and try again.',
  500: 'Claude had an internal error. Try again.',
  503: 'Claude is unavailable right now. Try again in a moment.',
  529: 'Claude is overloaded right now. Try again in a moment.',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set')
    return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' })
  }

  const { systemPrompt, messages, tools } = req.body || {}

  if (!systemPrompt || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing systemPrompt or messages' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
      }),
    })

    if (!response.ok) {
      // The detail is the only place the real reason lives, so it goes to the
      // log every time: `npm run dev`'s terminal locally, the function log on
      // Vercel.
      const detail = await response.text()
      console.error(`Claude API error ${response.status}:`, detail)
      return res.status(response.status).json({
        error: MESSAGES[response.status] ?? `Claude API error (${response.status})`,
      })
    }

    const data = await response.json()

    return res.status(200).json({
      content: data.content ?? [],
      stop_reason: data.stop_reason,
    })
  } catch (error) {
    console.error('Server error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
