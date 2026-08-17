# Salzburg Travel Agent

Mobile-first AI travel agent for an 11-night Salzburg trip (Sep 15–26, 2026), used
by two travellers (Bar + Ori) from their own phones. Shared trip data, shared chat
history, no auth. The value is the agent's context and reasoning — the UI is
deliberately thin.

## Commands

```bash
npm run dev      # vite, host:true so you can open it from a phone on the LAN
npm run build
npm run lint     # oxlint
```

There is no test suite.

## Read these first

| File | What it is |
|---|---|
| `salzburg-app-session1-spec.md` | What we're building and why. The product spec. |
| `session1-gaps.md` | What the spec promises that the code doesn't do yet, with the decisions needed to close each gap. Start here before implementing. |
| `design-spec.md` | Design tokens, screens, patterns. |
| `src/data/traveler-profile.js` | Long-term traveller preferences, injected into every system prompt. |

## Architecture

Every message rebuilds the agent's full context from Supabase, so both users always
see the same state:

```
App.jsx  ──▶ supabase.insert(messages)          save the user's turn
         ──▶ buildSystemPrompt()                 fetch ALL trip context from Supabase
         ──▶ POST /api/chat  { systemPrompt, messages, tools }
                    └─▶ api/chat.js  ──▶ Claude Messages API   (server holds the key)
                                     ◀── { content: [blocks], stop_reason }
         ──▶ supabase.insert(messages)          save the agent's turn
```

- `api/chat.js` is a **thin pass-through**. It returns Claude's raw content blocks
  and `stop_reason`; it does not extract text and does not run the tool loop. The
  client owns the loop, because the tools write to Supabase and the client already
  has a session there.
- `src/lib/build-system-prompt.js` assembles the system prompt from eight tables in
  parallel. Adding a table means adding a section here too.
- `src/lib/tools.js` holds the tool definitions *and* their executors. The tools
  write to Supabase, so they run client-side; `sendMessage` in `App.jsx` loops on
  `stop_reason === 'tool_use'` until the agent stops calling them. The loop is
  in-memory — only the user's message and the final reply are persisted. Don't use
  `strict: true` on a tool; structured outputs aren't supported on the model in
  `api/chat.js`.
- `src/lib/trip-data.js` owns every read of the trip tables **and** the seven
  user-initiated mutations. `src/lib/use-trip-data.js` wraps it in a hook that
  loads once and refetches on focus. Tabs are presentational; chat state and the
  tool loop stay in `App.jsx`, so switching tabs mid-turn can't unmount an
  in-flight request.
- `src/lib/dates.js` — all date formatting. Two rules it exists to enforce: parse
  `YYYY-MM-DD` at *local* midnight (`new Date('2026-09-15')` is UTC and renders as
  the 14th behind UTC), and format with an explicit `en-GB` locale, never the
  user's, or the design's typography breaks on a differently-configured phone.
- The Agenda's content is driven by **trip phase** (`before` / `during` / `after`),
  not by a single layout — "Today" means nothing when the trip is weeks out.
- `vite.config.js` mounts `api/chat.js` on the dev server behind a Vercel-compatible
  `req`/`res` shim, so `npm run dev` exercises the real serverless code path.
- **The app must never present as a blank page.** Two layers enforce that: an
  inline, dependency-free script in `index.html` paints the reason if the bundle
  never loads or throws while evaluating, and `ErrorBoundary` catches throws
  during render. `main.jsx` calls `window.__appMounted()` to stand the first one
  down. If you move the mount, move that call with it.

## Source-of-truth rules

- **Traveller preferences** live in `src/data/traveler-profile.js` and nowhere else.
  A `traveler-profile.md` used to exist alongside it and the two drifted; it's gone.
  Don't reintroduce a second copy.
- **Design** lives in Claude Design, transcribed into `design-spec.md`. Don't invent
  colours, spacing, or type. `design/ios-frame.jsx` and `design/support.js` are
  presentation scaffolding from the design tool — do not port them into the app.
- **Trip data** lives in Supabase and is mutable by both users. Only the traveller
  profile is a file.

## Things that are not automated

- **SQL is run by hand** in the Supabase SQL editor. `supabase-schema.sql` is the
  full current schema for a fresh database; `supabase-migration-NNN.sql` files are
  deltas for a database that already ran an earlier version. If you change the
  schema, update `supabase-schema.sql` *and* add a numbered migration *and* say so
  in your summary, because someone has to paste it in.
- **RLS is enabled with a fully permissive policy** (`using (true)`). That's the
  same practical exposure as no RLS — the anon key ships in the client bundle — but
  the switch is in place, so tightening access means editing the policy, not the
  app. A PIN gate is still open; see `session1-gaps.md`.
- **Status columns gate what the agent sees.** `recommendations.status` and
  `journal.status` exist because the design requires review before anything counts
  as saved. `build-system-prompt.js` feeds the agent only `kept` rows (plus pending
  recommendations under a separate "Awaiting Review" heading). If you add a write
  path, respect this — don't insert straight to `kept`.
- **`activities` and `packing_items` are the two exceptions**, and deliberately so:
  neither has a `status`, because neither has a meaningful pending state (a booked
  time is booked; an unticked checkbox is already its own review). `add_activity`
  and `add_packing_item` write live rows. `packing_items.added_by` is what keeps
  that honest — the UI marks agent-written items so nothing appears silently.
- **The packing list's prose lives in `src/lib/packing.js`, its items in Supabase.**
  `PACKING_STRATEGY` and the category labels are read by both `Packing.jsx` and
  `build-system-prompt.js`; the 160 items are seeded once by
  `supabase-migration-002.sql` and are mutable from then on. Don't add a JS copy of
  the items — that's the `traveler-profile.md` drift again.
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (client) and
  `ANTHROPIC_API_KEY` (server only — deliberately unprefixed so Vite never exposes
  it to the browser).

## Conventions

- React 19 + Vite, plain JS with JSX. No TypeScript, no CSS framework, no router,
  no state library, no icon library — the design has no icons.
- No semicolons, single quotes, 2-space indent. Match the surrounding file.
- Model ID lives in one place: `MODEL` at the top of `api/chat.js`.
- **Design tokens are CSS variables in `src/index.css`; component styles are in
  `src/App.css`.** Don't hard-code a colour or a font stack — if a value isn't in
  `:root`, check `design-spec.md` before inventing one.
