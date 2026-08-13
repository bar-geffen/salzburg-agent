import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { supabase } from './lib/supabase'
import { buildSystemPrompt } from './lib/build-system-prompt'
import { TOOLS, executeTool } from './lib/tools'
import './App.css'

// Each round trip is one API call, so this bounds cost and latency as much as it
// prevents a runaway loop. Five is generous: a turn that saves a recommendation,
// logs the day, and replies uses two.
const MAX_TOOL_ITERATIONS = 5

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sender, setSender] = useState(() => localStorage.getItem('sender') || '')
  const messagesEndRef = useRef(null)

  useEffect(() => { loadMessages() }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

    const userMessage = { role: 'user', sender, content: input.trim() }

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
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemPrompt, messages: apiMessages, tools: TOOLS }),
        })

        const data = await response.json()
        if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`)

        finalBlocks = data.content ?? []

        // Text can arrive alongside tool calls, so collect it every pass rather
        // than only reading the last response.
        const text = finalBlocks
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n\n')
          .trim()
        if (text) spokenText.push(text)

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

      const text = spokenText.join('\n\n').trim()
      if (!text) throw new Error('The agent returned an empty response.')

      // content is the plain-text rendering; content_json keeps the final block
      // array for debugging and future replay.
      const { data: savedAssistant, error: assistantError } = await supabase
        .from('messages')
        .insert({ role: 'assistant', sender: 'Agent', content: text, content_json: finalBlocks })
        .select()
        .single()

      if (assistantError || !savedAssistant) throw new Error("Couldn't save the reply.")

      setMessages(prev => [...prev, savedAssistant])
    } catch (err) {
      console.error('Failed to send message:', err)
      setError(err.message || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!sender) {
    return (
      <div className="sender-select">
        <h1>Salzburg 2026</h1>
        <p>Who's chatting?</p>
        <div className="sender-buttons">
          {['Bar', 'Ori'].map(name => (
            <button key={name} onClick={() => { setSender(name); localStorage.setItem('sender', name) }}>
              {name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Salzburg 2026</h1>
        <span className="sender-badge">{sender}</span>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>Hi {sender}! I'm your Salzburg travel agent. Ask me anything — what to do tomorrow, save a recommendation, or tell me how your day went.</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.role}`}>
            {msg.role === 'user' && <span className="message-sender">{msg.sender}</span>}
            <div className="message-content">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="message-content loading">Thinking...</div>
          </div>
        )}
        {error && <div className="message-error">{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      <form className="input-bar" onSubmit={sendMessage}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask your travel agent..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>Send</button>
      </form>
    </div>
  )
}

export default App
