// Entry point for the design preview. Mounts the real App — the stubs are wired
// in by the aliases in vite.preview.config.js, not from here.

import { createRoot } from 'react-dom/client'
import App from '../src/App'
import '../src/index.css'

// `localStorage.setItem('legacy', '1')` to see the pre-migration-004 fallback,
// where fetchSessions() returns null and the Chat tab has no switcher.
globalThis.__legacy = localStorage.getItem('legacy') === '1'

createRoot(document.getElementById('root')).render(<App />)
