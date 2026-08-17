import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// This throw is what the fallback in index.html reports, so the message has to
// name both places the vars can be missing — locally it's a .env, in production
// it's the Vercel project settings, and the symptom is identical either way.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set. ' +
      'Locally, copy .env.example to .env and restart the dev server. In production, set ' +
      'them for the Production environment in the Vercel project settings and redeploy — ' +
      'they are inlined at build time, so an existing build will not pick them up.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
