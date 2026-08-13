import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel runs everything under /api as a serverless function in production.
// `vite dev` doesn't, so /api/chat would 404 locally. This plugin mounts the
// same handler on the dev server behind a minimal Vercel-compatible req/res
// shim, so `npm run dev` exercises the real code path.
function devApi() {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (path !== '/api/chat') return next()

        const send = (code, payload) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
        }

        if (req.method !== 'POST') return send(405, { error: 'Method not allowed' })

        let raw = ''
        for await (const chunk of req) raw += chunk
        try {
          req.body = raw ? JSON.parse(raw) : {}
        } catch {
          return send(400, { error: 'Invalid JSON body' })
        }

        // api/chat.js calls res.status(n).json(payload) — Vercel's API, not Node's.
        const shim = {
          status(code) {
            res.statusCode = code
            return shim
          },
          json(payload) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
            return shim
          },
        }

        try {
          const { default: handler } = await server.ssrLoadModule('/api/chat.js')
          await handler(req, shim)
        } catch (error) {
          server.config.logger.error(`[dev-api] ${error?.stack || error}`)
          if (!res.writableEnded) send(500, { error: 'Dev API handler failed' })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_*-prefixed vars to the client. ANTHROPIC_API_KEY is
  // deliberately unprefixed so it never reaches the browser — bridge it into
  // process.env here so the dev-mounted handler can read it, same as Vercel.
  const env = loadEnv(mode, process.cwd(), '')
  if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY

  return {
    plugins: [react(), devApi()],
    server: {
      // Lets you open the app from your phone on the same network.
      host: true,
    },
  }
})
