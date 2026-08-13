# Salzburg Travel Agent

AI-powered travel agent for our Salzburg trip (Sep 15–26, 2026). Chat-first interface that knows our traveler profile, itinerary, and learns from every interaction.

## Setup (one-time)

### 1. Supabase
1. Go to supabase.com → create a free account → New Project
2. Name it `salzburg-agent`, pick a region close to you, set a DB password
3. Once created, go to **SQL Editor** → paste the contents of `supabase-schema.sql` → Run
4. Go to **Settings → API** → copy your `Project URL` and `anon public` key

### 2. Claude API Key
1. Go to console.anthropic.com → API Keys → Create Key
2. Copy the key (starts with `sk-ant-`)

### 3. Environment variables
Copy `.env.example` to `.env` and fill in your Supabase URL, anon key, and Claude API key.

### 4. Run locally
```bash
npm install
npm run dev
```

### 5. Deploy to Vercel
1. Push this repo to GitHub
2. Go to vercel.com → Import → select the repo
3. Add the 3 environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, ANTHROPIC_API_KEY)
4. Deploy

## Project structure
```
api/chat.js                    → Vercel serverless function (proxies Claude API)
src/data/traveler-profile.js   → Long-term preferences (edit this!)
src/lib/supabase.js            → Supabase client
src/lib/build-system-prompt.js → Assembles full context for Claude
src/App.jsx                    → Main chat interface
src/App.css                    → Styles (placeholder for Claude Design)
supabase-schema.sql            → Database schema (run once in Supabase SQL Editor)
```

## How it works
1. Your message is saved to Supabase (shared with the other user)
2. App fetches ALL trip context from Supabase (itinerary, recommendations, journal, learnings)
3. Builds a system prompt with traveler profile + all trip context
4. Sends to Claude Sonnet, which responds as your travel agent
5. Response is saved to Supabase so both users see it
# salzburg-agent
