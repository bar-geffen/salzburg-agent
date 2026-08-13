# Session 1 — Gaps

What `salzburg-app-session1-spec.md` promises that the code doesn't do yet. Ordered
by how much else depends on it. Items marked **Decision** need a human answer;
the rest are just build work.

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

## 2. The schema has no pending state, but the design requires one

`design-spec.md` is explicit: a captured recommendation lands sand-tinted under
`Caught in chat` with **Keep / Not this one** before it becomes a kept card, and the
auto-drafted journal entry shows **Edit / Keep** — *"nothing is ever posted without
appearing here first."*

The current schema can't express that. `recommendations` has no status column and
`journal` has no draft state, so anything a tool writes is immediately live.

Add to `supabase-schema.sql`:

```sql
alter table recommendations
  add column status text not null default 'pending'
  check (status in ('pending', 'kept', 'rejected'));

alter table journal
  add column status text not null default 'draft'
  check (status in ('draft', 'kept'));
```

Then `build-system-prompt.js` should feed the agent only `kept` recommendations and
`kept` journal entries, so a rejected suggestion doesn't come back next turn.

## 3. Messages can't round-trip a tool loop

`messages.content` is `text`. A tool loop produces `tool_use` and `tool_result`
blocks that have to survive a page reload, or the replayed conversation won't
validate against the API on the next turn.

**Decision:** two options.

- **Store blocks.** Add `content_json jsonb` to `messages`, write the full block
  array there, keep `content` as the plain-text rendering for display. Correct, and
  a bit more code.
- **Store text only, don't replay tool turns.** Simpler, but the agent loses sight
  of what it just saved within a conversation.

Recommend the first. Either way `build-system-prompt.js` already re-reads all state
from Supabase every turn, so the agent recovers the *facts* even under option two —
it's the mid-turn continuity that suffers.

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

## 7. Database is wide open — **Decision**

No table has RLS enabled. The anon key is in the client bundle, so "deploy on an
unguessable URL" protects the page, not the data: anyone who loads the app can read
and write every table.

Options, cheapest first:

1. Enable RLS with a permissive `using (true)` policy — same practical exposure,
   but it silences Supabase's warnings and gives you one place to tighten later.
2. Add the PIN screen the spec already floats, and gate on a Supabase Edge Function
   rather than the client.
3. Accept it and move on — it's a private trip tool for two people.

For a trip database holding a door code and flight details, (1) plus (2) is cheap.
Worth 20 minutes; your call.

---

## Deferred by design

- **Weather** — the spec explicitly defers it. `build-system-prompt.js` already
  leaves a labelled slot in the prompt. Leave it.
- **Model** — `claude-sonnet-4-6` in `api/chat.js` is a valid, current model ID, just
  a generation behind. `claude-sonnet-5` or `claude-opus-5` are the current options
  and are a one-line change. Not urgent.
