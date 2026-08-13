// Vercel serverless function — proxies chat to Claude API
// This keeps the ANTHROPIC_API_KEY on the server, never exposed to the browser

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { systemPrompt, messages } = req.body

  if (!systemPrompt || !messages) {
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
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Claude API error:', error)
      return res.status(response.status).json({ error: 'Claude API error' })
    }

    const data = await response.json()
    const assistantMessage = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')

    return res.status(200).json({ message: assistantMessage })
  } catch (error) {
    console.error('Server error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
