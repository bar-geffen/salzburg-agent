# Session 1 — Gaps

What `salzburg-app-session1-spec.md` promises that the code doesn't do yet. Ordered
by how much else depends on it. Items marked **Decision** need a human answer;
the rest are just build work.

**Resolved so far:** gaps 2 (pending state), 3 (tool-block persistence), and 7 (RLS)
are done — see `supabase-migration-001.sql`. Remaining: 1, 4, 5, 6.

---

## 1. Agent learning has no tools

The spec's core feature — the agent extracting learnings, recommendations, and
journal entries into Supabase — has **no implementation and no defined schema**.
`api/chat.js` forwards a `tools` array, but nothing populates it and no tool
definitions exist anywhere in the repo.

Proposed tool set, matching the existing Supabase columns. Put it in
`src/lib/tools.js` and pass it on every request:

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

Write descriptions that say **when** to call each one, not just what it does —
current models are conservative about reaching for tools, and the trigger condition
is what drives the should-call rate. Give each one a couple of the examples from the
spec's "Agent learning" section.

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

**Resolved:** `messages.content_json jsonb` now holds the full block array, with
`content` kept as the plain-text rendering for display. `App.jsx` writes both. The
tool loop (gap 4) should read `content_json` when replaying history to the API.

## 4. The client tool loop isn't written

`api/chat.js` deliberately returns raw blocks and `stop_reason` so the client can run
the loop. The client doesn't. Needs: on `stop_reason === 'tool_use'`, execute each
`tool_use` block against Supabase, append all `tool_result` blocks in a **single**
user message, re-POST, repeat. Cap the iterations.

`sendMessage` in `App.jsx` now extracts text and surfaces errors correctly, but it
stops at the first response — it does not loop.

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
