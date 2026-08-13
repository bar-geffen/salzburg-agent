import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { supabase } from './lib/supabase'
import { buildSystemPrompt } from './lib/build-system-prompt'
import './App.css'

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
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

    const { data: savedMsg } = await supabase
      .from('messages')
      .insert(userMessage)
      .select()
      .single()

    const updatedMessages = [...messages, savedMsg]
    setMessages(updatedMessages)
    setInput('')
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
      const assistantMessage = { role: 'assistant', sender: 'Agent', content: data.message }
      const { data: savedAssistant } = await supabase
        .from('messages')
        .insert(assistantMessage)
        .select()
        .single()

      setMessages(prev => [...prev, savedAssistant])
    } catch (error) {
      console.error('Failed to send message:', error)
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
