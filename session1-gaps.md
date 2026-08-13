# Session 1 — Gaps

What `salzburg-app-session1-spec.md` promises that the code doesn't do yet. Ordered
by how much else depends on it. Items marked **Decision** need a human answer;
the rest are just build work.

**Resolved so far:** gaps 1 (tools), 2 (pending state), 3 (tool-block persistence),
4 (tool loop), and 7 (RLS) are done. Remaining: 5 (realtime) and 6 (Agenda/Saved tabs).

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

## 5. No realtime

The spec says one user's changes are "immediately visible to the other."
`loadMessages()` runs once on mount and never again. Add a Supabase realtime
subscription on `messages` (and on `recommendations` / `journal` once the Saved and
Agenda tabs exist), or poll. Realtime is available on the free tier.

## 6. Agenda and Saved tabs don't exist

`App.jsx` is chat-only. The design specifies three tabs; the two trip-context
surfaces, their cards, and their in-place editing are unbuilt. See `design-spec.md`
for the card anatomy — note that editing happens **in place, no modals**.

## 7. Database access — RLS enabled (migration 001), PIN still open

The anon key is in the client bundle, so "deploy on an unguessable URL" protects the
page, not the data: anyone who loads the app can read and write every table.

**Resolved (partly):** RLS is now enabled on all eight tables with a permissive
`using (true)` policy. Practical exposure is unchanged, but access is now controlled
in one place — tightening it means editing the policy, not the app.

**Still open:** the PIN screen the spec floats. Worth doing before the trip, since
the accommodation record holds a door code. Gate it in a Supabase Edge Function, not
the client, or it's decorative.

---

## Deferred by design

- **Weather** — the spec explicitly defers it. `build-system-prompt.js` already
  leaves a labelled slot in the prompt. Leave it.
- **Model** — `claude-sonnet-4-6` in `api/chat.js` is a valid, current model ID, just
  a generation behind. `claude-sonnet-5` or `claude-opus-5` are the current options
  and are a one-line change. Not urgent.
