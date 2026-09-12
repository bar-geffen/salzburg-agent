// The design preview — see preview/README.md. Not the app's build config; that's
// vite.config.js, and `npm run build` never reads this file.
//
// Three aliases are all it takes: auth decides whether TripApp mounts at all,
// and the other two are every read the app makes.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const at = path => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [react()],
  server: { port: 5199, host: true, open: '/preview.html' },
  resolve: {
    // Matched against the specifier as App.jsx writes it, so these are the exact
    // strings in its import list. Adding a table means adding its module here.
    alias: [
      { find: /^\.\/lib\/auth$/, replacement: at('./preview/fake-auth.js') },
      { find: /^\.\/lib\/chat-sessions$/, replacement: at('./preview/fake-chat-sessions.js') },
      { find: /^\.\/lib\/use-trip-data$/, replacement: at('./preview/fake-trip-data.js') },
    ],
  },
})
