// Vercel serverless function — proxies chat to the Claude API.
// This keeps ANTHROPIC_API_KEY on the server, never exposed to the browser.
//
// The handler is a thin pass-through: it returns Claude's raw content blocks
// and stop_reason so the client can run the tool loop (tools write to Supabase,
// which the client already has a session for).

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 8192

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
      const detail = await response.text()
      console.error(`Claude API error ${response.status}:`, detail)
      return res.status(response.status).json({ error: `Claude API error (${response.status})` })
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
