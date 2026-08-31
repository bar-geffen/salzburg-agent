# Session 1 — Gaps

What `salzburg-app-session1-spec.md` promises that the code doesn't do yet. Ordered
by how much else depends on it. Items marked **Decision** need a human answer;
the rest are just build work.

**Resolved so far:** gaps 1 (tools), 2 (pending state), 3 (tool-block persistence),
4 (tool loop), 6 (tabs + design system), 7 (RLS) and 8 (auth) are done.
Remaining: **5** (realtime, PR 3) and the structured day plan (PR 2) — both now
tracked in `session2-spec.md`, which supersedes this file for what's next.

---

## 1. Agent learning tools — DONE

**Resolved:** `src/lib/tools.js` defines four tools and their executors, passed on
every request. Verified end to end in the browser: a message mentioning a restaurant
and a nap constraint produced a `save_recommendation` (status `pending`) and a
`save_learning` (type `constraint`) in Supabase, and the agent replied "saved to your
review list" rather than claiming it was live.

```js
save_learning       { type: 'liked'|'disliked'|'requirement'|'constraint'|'preference',
                      tag: string, note: string, source_message: string }
save_recommendation { name: string, category: 'food'|'activity'|'day-trip'|'accommodation'|'other',
                      source?: string, location?: string, notes?: string }
log_journal_entry   { date: 'YYYY-MM-DD', what_we_did?: string, notes?: string,
                      rating?: 1..5, energy_level?: 'low'|'medium'|'high',
                      want_more_of?: string, want_less_of?: string }
add_activity        { name: string, date: 'YYYY-MM-DD', time?: string,
                      location?: string, notes?: string }
```

Descriptions say **when** to call each tool, not just what it does — models are
conservative about reaching for tools, and the trigger condition drives the
should-call rate. `strict: true` is deliberately not used: structured outputs aren't
supported on `claude-sonnet-4-6`.

## 2. Pending state — DONE (migration 001)

`design-spec.md` is explicit: a captured recommendation lands sand-tinted under
`Caught in chat` with **Keep / Not this one** before it becomes a kept card, and the
auto-drafted journal entry shows **Edit / Keep** — *"nothing is ever posted without
appearing here first."*

The original schema couldn't express that — anything a tool wrote went live instantly.

**Resolved:** `recommendations.status` (`pending` / `kept` / `rejected`) and
`journal.status` (`draft` / `kept`) now exist. `build-system-prompt.js` feeds the
agent `kept` recommendations under **Saved Recommendations**, `pending` ones under a
separate **Awaiting Review** heading that tells it not to treat them as saved, and
excludes `rejected` entirely so a declined suggestion never comes back. Journal is
`kept` only.

The UI for acting on these — Keep / Not this one, Edit / Keep — is part of gap 6.

## 3. Tool-block persistence — DONE (migration 001)

`messages.content` is `text`. A tool loop produces `tool_use` and `tool_result`
blocks that have to survive a page reload, or the replayed conversation won't
validate against the API on the next turn.

**Resolved:** `messages.content_json jsonb` now holds the block array, with `content`
kept as the plain-text rendering for display. `App.jsx` writes both.

In practice the loop sidesteps the replay problem rather than solving it — see the
design note under gap 4. Because tool turns are never persisted, replaying plain text
is valid and `content_json` is a fidelity/debugging record. It becomes load-bearing
if tool turns are ever persisted (e.g. to show tool activity in the UI).

## 4. Client tool loop — DONE

**Resolved:** `sendMessage` in `App.jsx` loops on `stop_reason === 'tool_use'`,
executing tools concurrently and returning every `tool_result` in a single user
message (splitting them trains the model out of parallel calls). A failing tool comes
back as an error result rather than throwing, so the agent adapts instead of the turn
dying. Capped at `MAX_TOOL_ITERATIONS` (5).

**Design note — the loop runs in memory.** Only the user's message and the agent's
final reply are persisted; intermediate `tool_use` / `tool_result` turns are not.
What the tools wrote is already in Supabase and `buildSystemPrompt()` re-reads every
table next message, so nothing is forgotten — and persisting `tool_use` blocks
without their results would produce a history the API rejects if the page reloads
mid-loop. `content_json` therefore holds the final response blocks rather than the
whole exchange.

## 5. No realtime — partly mitigated, PR 3

The spec says one user's changes are "immediately visible to the other."

**Mitigated for now:** `use-trip-data.js` refetches on `visibilitychange`, on window
focus, and via the header's Refresh control, so picking the phone back up shows
what the other person did. Chat messages still need a reload.

**Still open (PR 3):** Supabase realtime subscriptions. Two prerequisites, both
noted because they're easy to miss:

- **`supabase-migration-003.sql` must add the tables to the `supabase_realtime`
  publication** — including `packing_items`, so a tick lands on the other phone.
  No file in the repo does this yet, and without it realtime silently does
  nothing. (002 was taken by the packing list.)
- A **connection indicator** in the header, so a dead websocket (or a forgotten
  migration) is visible rather than mysterious.

Also needed: dedupe realtime echoes by server id, and change the
`setMessages(updatedMessages)` whole-array overwrite in `sendMessage` — if the
other user's message lands between load and insert, that line drops it.

## 6. Agenda and Saved tabs — DONE

**Resolved:** three tabs as a segmented control, plus the full design system
(tokens, the three fonts, and a restyled Chat). `Agenda.jsx` shows trip/day cards,
Stay, Flights and the journal draft with edit-in-place; `Saved.jsx` shows filter
pills, pending cards with Keep / Not this one, and kept cards with Remove.

What the Agenda shows is driven by trip phase — before / during / after — because
"Today" means nothing when the trip is weeks away.

**Deliberately omitted:** the design's `+ Add to today`, `+ Add`, `Edit` (Stay),
`See all`, `Keep both` and `+ Add one yourself` affordances. Every one has a working
alternative — say it in chat — and a disabled button is a promise with "not yet"
attached. Adding them means building forms, which is a bigger change than it looks.

## 7. Database access — closed by session 2, PR 4

The anon key is in the client bundle, so "deploy on an unguessable URL" protects the
page, not the data: anyone who loads the app can read and write every table.

**Resolved (partly):** RLS is now enabled on all eight tables with a permissive
`using (true)` policy. Practical exposure is unchanged, but access is now controlled
in one place — tightening it means editing the policy, not the app.

**Closed (session 2, PR 4):** the permissive policy is gone. All nine tables now
call `public.is_trip_member()`. The PIN idea was never built and is now moot.

## 8. No auth — closed by session 2, PR 4

The sender gate is `localStorage` only: it picks a name for message attribution, it
is not a login. Anyone with the URL can read and write everything, including the
accommodation record, which is where a door code would live.

**Decision:** Google OAuth via Supabase Auth, deferred to its own PR. It isn't a UI
change — it touches RLS (`using (true)` → `auth.uid() is not null`), where `sender`
comes from, the Supabase project's auth config, and a redirect URL per environment.
Bundling it into the design-system rewrite would have made that diff unreviewable.

It supersedes the PIN gate in gap 7. Worth doing before the trip.

**Closed (session 2, PR 4).** Google sign-in via Supabase Auth, restricted to two
addresses by `public.is_trip_member()`. One detail landed differently from the note
above: the policies check the **email claim**, not `auth.uid() is not null` — the
latter would have let any Google account in the world read the trip. `sender` now
comes from the session rather than `localStorage`.

---

## Deferred by design

- **Weather** — the spec explicitly defers it. `build-system-prompt.js` already
  leaves a labelled slot in the prompt. Leave it.
- **Model** — `claude-sonnet-4-6` in `api/chat.js` is a valid, current model ID, just
  a generation behind. `claude-sonnet-5` or `claude-opus-5` are the current options
  and are a one-line change. Not urgent.
