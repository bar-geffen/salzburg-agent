import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { supabase } from './lib/supabase'
import { buildSystemPrompt } from './lib/build-system-prompt'
import './App.css'

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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || `Request failed (${response.status})`)
      }

      // api/chat.js is a pass-through: it returns Claude's raw content blocks, not
      // a flat string. Render the text blocks; tool_use blocks are handled by the
      // tool loop (not built yet — see session1-gaps.md).
      const text = (data.content ?? [])
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n\n')
        .trim()

      if (!text) throw new Error('The agent returned an empty response.')

      // content is the plain-text rendering; content_json keeps the full block
      // array so the conversation can be replayed to the API after a reload.
      const assistantMessage = {
        role: 'assistant',
        sender: 'Agent',
        content: text,
        content_json: data.content,
      }
      const { data: savedAssistant, error: assistantError } = await supabase
        .from('messages')
        .insert(assistantMessage)
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
