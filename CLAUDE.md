# Salzburg Travel Agent

Mobile-first AI travel agent for an 11-night Salzburg trip (Sep 15–26, 2026), used
by two travellers (Bar + Ori) from their own phones. Shared trip data, shared chat
history, behind Google sign-in restricted to the two of them. The value is the agent's context and reasoning — the UI is
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
| `session2-spec.md` | The next three PRs — auth, chat sessions, live flight status — in build order. Supersedes gap 8, and the realtime and day-plan items in `session1-gaps.md`. |
| `design-spec.md` | Design tokens, screens, patterns. |
| `src/data/traveler-profile.js` | Long-term traveller preferences, injected into every system prompt. Its short-term counterpart is the `learnings` table, written by `save_learning`. |
| `src/data/region-guide.js` | Standing research for the Salzburg region — what to do, what to skip, where every hike shortens. Also injected into every system prompt. |

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
  `stop_reason === 'tool_use'` until the agent stops calling them. Don't use
  `strict: true` on a tool; structured outputs aren't supported on the model in
  `api/chat.js`.
- **An executor returns `{ modelText, userLine }`, not a string.** `modelText` is
  the `tool_result` the model reads; `userLine` is one short line the chat renders
  under the reply. The executor writes both because only it knows what the write
  actually did — "Saved Café Bazar for review" and "Café Bazar — already saved"
  are different lines, and deriving one from the tool *input* would sometimes lie.
  A save nobody can see is the same bug as a save that never happened.
- **The tool loop is in-memory for replay, but persisted for display.**
  `apiMessages` is built from `messages.content` only, so a page reload can never
  replay a `tool_use` without its result. `messages.content_json` separately stores
  `{ blocks, saves }` — every block from every pass, plus those `userLine`s. Rows
  written before this shipped hold a bare array; `Chat.jsx` reads that as "no saves
  to show" rather than breaking.
- **`save_recommendation` refuses duplicates in the executor, not just the prompt.**
  It matches on the name with accents and punctuation stripped, so "Cafe Bazar"
  won't join "Café Bazar" on the list. It has to be enforced here: the agent
  re-proposes its own standing suggestions on every day plan, and those places are
  already rows. A rejected match is reported back and not re-added — but
  note there is currently no way to *un*-reject a row from the UI, so a place
  turned down once can only come back via SQL.
- `src/lib/trip-data.js` owns every read of the trip tables **and** the seven
  user-initiated mutations. `src/lib/use-trip-data.js` wraps it in a hook that
  loads once and refetches on focus. Tabs are presentational; chat state and the
  tool loop stay in `App.jsx`, so switching tabs mid-turn can't unmount an
  in-flight request.
- `src/lib/chat-sessions.js` owns `chat_sessions` and `messages`. A session is
  the unit the chat is divided into, and the only thing it bounds is the
  transcript posted to `/api/chat` — the agent's memory is still
  `buildSystemPrompt()`, rebuilt from the tables on every turn, so a new session
  loses nothing durable. **Don't feed one session's transcript into another's
  prompt.** If something has to survive a session boundary, the fix is a tool
  that writes it to a table. Sessions are created lazily on the first message,
  named from the first exchange by one short tool-less call to `/api/chat`, and
  fall back to the first 40 characters of the opening message. `fetchSessions()`
  returns `null` — not `[]` — when the table is missing, and `App.jsx` reads that
  as "migration 004 hasn't been pasted yet" and shows one undivided thread.
  It also returns each session's `message_count`, `starter` and `topic` (the icon
  key, matched on the title) so the Chats list never has to load a thread to
  draw a row — `fetchSessionStats()` selects three narrow columns for every
  message and tallies them here, deliberately **not** `content`.
- **The Chat tab has two surfaces and one `view` state.** `'chat'` is the thread,
  `'chats'` is the list, both under the same header and tab bar — no modal, no
  route. Every tab change resets it to `'chat'`, so a tab tap always lands on the
  thread. The header's switcher pill prints `Chat N of M` against the order
  `fetchSessions()` returned, which is the order `SessionList` renders; if you
  re-sort in one place, the label in the other starts lying.
- **The composer is a textarea, and Enter means opposite things on the two
  devices it's used from.** `sendsOnEnter()` in `Chat.jsx` asks
  `(hover: hover) and (pointer: fine)`: on a keyboard Enter sends and
  Shift+Enter breaks the line; on a phone Enter breaks the line and the send
  button sends, because a touch keyboard has no Shift+Enter and a message you
  can't put bullets in was the bug that prompted this. The field grows its own
  height from `scrollHeight` up to the `max-height` in `App.css` rather than
  showing a scrollbar inside a 26px pill. And because a message is markdown,
  `preserveLineBreaks()` turns a lone newline into markdown's own hard break —
  without it a two-line message renders as one paragraph, which reads as the
  newline having been eaten.
- **Refresh and Sign out live at the foot of the Chats list**, not in the header.
  The design gave the Chat header's first row entirely to the switcher and the
  `+`, and two mono-caps buttons don't fit beside them at 375px. Legacy mode is
  the exception — it has no Chats list, so they get their own header row there.
- `src/lib/auth.js` is the only module that knows about `supabase.auth`:
  `signInWithGoogle`, `signOut`, a `useSession()` hook over `onAuthStateChange`, and
  `displayNameFor(session)`. `App.jsx` branches on it into three states — signed
  out, signed in but not allowlisted, signed in and allowed — and only the third
  mounts `TripApp`, so a signed-out visitor never fires a table read that would come
  back empty and look like "no trip yet". `sender` is derived from the session;
  `messages.sender` stays a display name (`Bar` / `Ori`).
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
- **The region guide** lives in `src/data/region-guide.js` — the opinionated
  research behind the shortlist: the three-leg trip shape, the accommodation hard
  filter, a turn-back point for every hike, and the list of famous things that are
  deliberately cut. Its *places* are also `recommendations` rows (seeded by
  `supabase-migration-005.sql`), because the Saved tab is where the travellers
  look. That is not drift: the rows are the shortlist, the file is the reasoning,
  and a row's `notes` field can't hold a cut list or a style rule. If you add a
  place to one, add it to the other. Where the guide and the traveller profile
  disagree, **the profile wins** — it's the long-term record; the guide is one
  trip's research under one set of assumptions.
- **Trip data** lives in Supabase and is mutable by both users. The traveller
  profile and the region guide are the only two files.
- **`learnings` is the third preference store, and it outranks the other two on
  recency.** The profile is the long-term record, edited by hand; the region
  guide is one trip's research; `learnings` rows are what the travellers have
  actually said in chat, each carrying the quote that produced it. The system
  prompt tells the agent to act on the newer learning *and say so out loud* when
  it contradicts the profile, rather than quietly picking one — because the fix
  for a durable contradiction is a human editing `traveler-profile.js`, and that
  only happens if someone is told. Don't resolve the conflict by copying a
  learning into the profile from code; that's the `traveler-profile.md` drift
  again, with the added problem that the file would then outlive the correction.
- **The allowlist exists twice, deliberately.** `public.is_trip_member()`
  (`supabase-migration-003.sql`, mirrored in `supabase-schema.sql`) is the
  enforcement; `TRIP_MEMBERS` in `src/lib/auth.js` is how the UI knows to show "not
  on this trip" instead of an empty app, and it also holds the display names, which
  the database has no reason to know. This is the one sanctioned copy — edit both
  together. Changing only the client shows someone the app and then fails every
  query; changing only the SQL locks them out with no explanation.

## Things that are not automated

- **SQL is run by hand** in the Supabase SQL editor. `supabase-schema.sql` is the
  full current schema for a fresh database; `supabase-migration-NNN.sql` files are
  deltas for a database that already ran an earlier version. If you change the
  schema, update `supabase-schema.sql` *and* add a numbered migration *and* say so
  in your summary, because someone has to paste it in.
- **RLS is the access gate, and it is the only one.** All eleven tables carry one
  policy that calls `public.is_trip_member()`, which checks the email claim in the
  Supabase Auth JWT against two addresses. The anon key still ships in the client
  bundle and is now worth nothing on its own — an unauthenticated request reads zero
  rows from every table. The app's sign-in screen is convenience; this is
  enforcement. Changing who has access is a SQL edit, not a deploy.
- **`supabase-migration-005.sql` seeds its 27 places as `kept`, not `pending`.**
  The review gate is for what the agent catches in chat; these rows are the
  travellers' own research, pasted in by hand, and routing them through review
  would mean 27 taps to confirm a list they wrote. The migration's six cut items
  are seeded as `rejected` — the status that already means "never re-propose
  this". Neither is a precedent for a *write path*; see the next rule.
- **`supabase-migration-006.sql` is the booked itinerary, pasted in by hand** —
  and it should be the last one of its kind. Everything in it has a tool now, so
  a change to the trip is a sentence in chat, not a migration: bookings go to
  `save_accommodation` / `save_flight`, plans and their changes to
  `add_activity` / `update_activity` / `cancel_activity`, standing facts to
  `note_trip_fact` / `remove_trip_fact`. Reach for SQL again only for a schema
  change or a bulk paste, never to correct a fact.
  The two booked apartments as `accommodation` rows, and the car rental — which
  has no table and doesn't want one — as the standing fact in `trip.notes`, the
  same field `note_trip_fact` writes. The Salzburg city stay is deliberately
  *not* a row: an empty `researching` placeholder reads to the agent as progress.
  Booking it later is a `save_accommodation` call, not migration 007. The car's
  Austria-only clause is also research input, so it's reflected in
  `src/data/region-guide.js` — the clause there, the paperwork here.
- **Status columns gate what the agent sees.** `recommendations.status` and
  `journal.status` exist because the design requires review before anything counts
  as saved. `build-system-prompt.js` feeds the agent only `kept` rows (plus pending
  recommendations under a separate "Awaiting Review" heading). If you add a write
  path, respect this — don't insert straight to `kept`.
- **Eleven tools write live, and deliberately so.** The review gate exists for
  things the agent *proposes*; these eleven record something the travellers have
  already decided, and making them tap Keep on their own booking is bureaucracy:
  - `add_activity` and `add_packing_item` — `packing_items` has no `status`
    because an unticked checkbox is already its own review, and `activities.status`
    (`planned` / `booked` / `cancelled`, migration 007) is **not** a review gate:
    every row shows the moment it's written, and the column says what the
    travellers committed to, not whether a human has seen it. `planned` is how a
    decided-but-unbooked day gets recorded — the thing the agent otherwise had to
    either overstate as booked or lose.
  - `save_accommodation`, `save_flight`, `save_car_rental` and `note_trip_fact` —
    the `trip`, `flights`, `accommodation` and `car_rental` tables had **no write path at all** before these,
    from the app or from a tool. The agent filed a booked apartment as an
    `add_activity` called "Check in — Haus Bergblick" and then, on the next
    message, told the travellers that leg was still unbooked, because
    `buildSystemPrompt()` rebuilds from the tables and the tables never changed.
    If you add a table the agent should know, it needs a section in
    `build-system-prompt.js` **and** a tool, or the agent can't record what it's
    told. `accommodation.status` (`booked` / `researching`) carries the only
    hedge; a place they're merely considering is still a `save_recommendation`.

  - `save_learning` and `forget_learning` — **the only memory the agent has of
    anything either traveller has said.** `buildSystemPrompt()` rebuilds from the
    tables every turn and the transcript is bounded by the session, so a
    preference stated in chat and not written to `learnings` is gone by the next
    reply, and was never visible on the other phone at all. The gate that catches
    a wrong recommendation is one tap; the gate that would catch a wrong learning
    is the Saved tab, after the fact — which is the trade, because a preference
    is usually stated in passing and stopping to confirm it would train them out
    of saying it.

  Each is visibly attributed — `packing_items.added_by` marks agent-written rows,
  and every one of the eleven prints a `userLine` in the chat — so nothing the
  agent writes appears silently.
- **Four of the tools exist to change what an earlier one wrote.**
  `update_activity`, `cancel_activity`, `remove_trip_fact` and `forget_learning`. Without them the
  record only accretes, and because `buildSystemPrompt()` rebuilds from the tables
  every turn, a stale row isn't clutter — it's the agent telling them next week to
  book something they booked today. Two consequences worth keeping:
  - **Activities are addressed by a short id, printed in the prompt.**
    `build-system-prompt.js` prefixes every agenda line with `[#` + the first six
    characters of the uuid, and `findActivity()` in `tools.js` resolves that
    prefix (falling back to an exact name match, and reporting ambiguity rather
    than picking). Change the prefix length in one place and you must change it in
    the other, or the agent will hand back ids nothing resolves.
  - **`cancel_activity` marks, it doesn't delete.** The row leaves the Agenda but
    stays in the agent's context under a "Cancelled" heading, for the same reason
    `recommendations.status` has a `rejected` value: the next day plan would
    otherwise re-propose the outing they called off this morning.
  - `add_activity` updates a row with the same name on the same date instead of
    inserting a second one, because a plan firms up over several messages and the
    model keeps reaching for `add_activity` while it does.
  - **`save_learning` replaces by tag**, for the same reason and a sharper one:
    the tag is the handle (`normalizeTag` in `tools.js` decides what counts as
    the same tag, migration 009 collapsed the pre-existing duplicates), and a
    preference is stated, then restated, sharpened, and eventually reversed.
    "Prefers museums" and "not another museum" sitting side by side undated is
    worse than either alone — the agent reading both has learned nothing. So
    there is no `update_learning`: saving the tag again *is* the update, and
    `forget_learning` is only for something the agent got wrong. `updated_at` is
    therefore when the current version was learned, and it's what the prompt
    prints and both lists sort on. Both sorts happen in JS, not in the query,
    because ordering on a column a database without migration 009 doesn't have
    fails the whole select — which would read as "no learnings" and silently wipe
    the agent's memory rather than degrade.
- **A card shows what you need at the door; the notes are for the agent.** The
  Stay card is dates, check-in window and a maps link; the Car card is two times,
  two places and the reference. `accommodation.notes` and `car_rental.notes` still
  hold the cancellation terms, the host's phone number, the excess and the fuel
  policy — `build-system-prompt.js` feeds all of it to the agent, and the UI shows
  none of it. That split is the design, not an oversight: the thing you need
  standing outside a door with a toddler on one arm is not the thing you need when
  deciding whether to drive to Germany. The consequence is a prompt rule — when it
  matters on the day, the agent has to *say* it, because no card will.
- **`save_accommodation`, `save_flight` and `save_car_rental` replace rather than
  append.** One stay per `check_in`, one flight per `direction`, one rental per
  `pickup_date`. That's what makes a changed booking
  a change instead of a second bed on the same night, and it's why `save_flight`
  is documented as taking every field even the unchanged ones: a row carrying the
  new time and the old flight number is a wrong answer that looks right. The car
  works the same way.
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
  no state library, no icon library — `src/components/Icon.jsx` is the whole icon
  set, twenty inline SVGs transcribed from the design. Add one only by
  transcribing it too; a path drawn to a different grid reads as a different
  family, and nothing outside that file should contain an `<svg>`.
- No semicolons, single quotes, 2-space indent. Match the surrounding file.
- Model ID lives in one place: `MODEL` at the top of `api/chat.js`.
- **Design tokens are CSS variables in `src/index.css`; component styles are in
  `src/App.css`.** Don't hard-code a colour or a font stack — if a value isn't in
  `:root`, check `design-spec.md` before inventing one.
