# Session 2 — Spec

Three features, in the order they should be built. Same conventions as
`salzburg-app-session1-spec.md`: this says what to build and why, names the traps,
and marks the points where a human has to decide or paste something in.

**Written 2026-08-30. The trip starts 2026-09-15 — 16 days.** That deadline is the
main reason this document sequences rather than just lists. If only one of these
ships, it should be PR 4.

| | Feature | Why it's in this order |
|---|---|---|
| **PR 4** | Google auth, restricted to two people | Crucial, and it changes `sender`, which the other two build on |
| **PR 5** | Chat sessions | Cheap, and it fixes a cost/latency problem that gets worse daily |
| **PR 6** | Live flight status | Most work, narrowest window — dormant until ~Sep 13 |

Dependency note: PR 4 must land first. It changes where `sender` comes from and
rewrites every RLS policy — doing it after PR 5 means writing the `chat_sessions`
policies twice and reworking session ownership.

---

## PR 4 — Google auth, two people only

### The problem

The sender gate is `localStorage`. It picks a name for message attribution; it is
not a login. RLS is enabled but every policy is `using (true)`, and the anon key is
inlined into the client bundle — this is now demonstrated, not theoretical: grep the
deployed JS and the key is there in plaintext.

So anyone with the URL can read and write all nine tables. That includes
`accommodation`, which is where a door code goes, and `journal`, which is a diary.

### What to build

**Supabase Auth with the Google provider**, restricted to two email addresses, with
RLS as the enforcement layer and the UI as convenience only.

**Decision needed: Ori's Google address.** Bar's is `bar.geffen2@gmail.com`. The
spec below uses `<ori-email>` — it has to be the address on the Google account they
actually sign in with, which may not be the one you'd guess.

#### Enforcement: one function, nine policies

Don't hardcode the emails into nine policies — that's nine places to edit when
someone's address changes. Put the allowlist in a single SQL function and have every
policy call it:

```sql
create or replace function public.is_trip_member() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') in (
    'bar.geffen2@gmail.com',
    '<ori-email>'
  )
$$;
```

Then, for each of the nine tables, replace the permissive policy:

```sql
drop policy "anon full access" on messages;
create policy "trip members" on messages for all
  using (public.is_trip_member())
  with check (public.is_trip_member());
```

Two properties worth being explicit about. `using` governs reads and which rows an
update can touch; `with check` governs what a write may leave behind — both are
needed, and omitting `with check` leaves the table writable. And the check is on the
**email claim in the JWT**, not on `auth.uid()`, so it keeps working if a user is
ever deleted and signs in again with a new user id.

A signed-out visitor now gets zero rows from every table rather than an error. Design
for that: the app must not read an empty result as "no trip yet".

#### Client changes

- **`src/lib/auth.js`** (new) — wraps `supabase.auth`: `signInWithGoogle()`,
  `signOut()`, and a `useSession()` hook over `onAuthStateChange`. One place that
  knows about auth, the way `trip-data.js` is one place that knows about the tables.
- **`src/App.jsx`** — replace the `sender` gate. Three states: no session → sign-in
  screen; session whose email isn't allowlisted → "not on this trip" screen with a
  sign-out button; allowlisted → the app.
- **`sender`** now derives from the session instead of `localStorage`. Map email →
  display name (`Bar` / `Ori`) in one constant next to the allowlist. Keep the
  `messages.sender` column as-is — it's a display name, and rewriting it to store
  emails buys nothing and breaks existing rows.
- Sign-out lives in the header. Rare action, so it doesn't need to be prominent, but
  it has to exist — without it a wrong-account sign-in is unrecoverable on a phone.

#### The third screen is not optional

A Google user who isn't on the allowlist **authenticates successfully**. Supabase
creates the user; the JWT is valid; every query then returns nothing. If the app only
branches on "session or no session", that person sees a fully-loaded app with an
empty trip, and so does either of you if you sign in with the wrong Google account —
which is easy on a phone with several accounts. Name the state explicitly:

> *Signed in as someone@gmail.com, who isn't on this trip. Sign out and try another
> account.*

### Setup that isn't automated

Consistent with the rest of this project, some of this is paste-work:

1. **Google Cloud** — create a project, configure the OAuth consent screen, create an
   OAuth 2.0 Client ID (Web application). Copy the client ID and secret.
2. **Supabase → Authentication → Providers → Google** — enable, paste both values.
   Supabase shows you the callback URL to add back into the Google console.
3. **Supabase → Authentication → URL Configuration** — Site URL is the production
   domain. Add redirect URLs for `http://localhost:5173` (dev) and the production
   domain.
4. **`supabase-migration-003.sql`** — the function and the nine policy swaps. Run it
   by hand, and update `supabase-schema.sql` to match.

**Trap: preview deployments.** Vercel preview URLs contain the branch name and change
per branch, so they will never match a fixed redirect URL and Google sign-in will
fail on every preview. Either add a wildcard redirect pattern in Supabase's URL
configuration, or accept that auth only works on localhost and production and test it
there. Decide before you spend an hour debugging a preview.

**Trap: lock-out order.** Run the migration *after* the client can sign in, or the
app goes dark for both of you in the window between. If you do lock yourself out, the
Supabase SQL editor is not subject to RLS — you can always fix the function there.

### Done when

Both of you can sign in with Google on your phones and see the same trip; a third
Google account gets the "not on this trip" screen; and with `is_trip_member()`
temporarily returning false, `curl` against the REST endpoint with the anon key
returns `[]` for every table.

---

## PR 5 — Chat sessions

### The problem

`messages` is one flat, ever-growing list. Two consequences.

The one you noticed: every conversation since the beginning of the project is one
scroll. Planning Tuesday and logging Sunday are the same thread.

The one you haven't yet, and the reason this is worth doing before the trip:
`sendMessage` sends **every message ever** to the API on every turn
(`apiMessages = updatedMessages.map(...)`). That history is resent in full on each
tool-loop iteration too. Cost and latency grow with the square of how much you use
the app, and eleven days of two people chatting is exactly the shape that hurts.
Sessions bound it.

### Why this is cheap — and the thing not to break

The agent's memory is **not** the transcript. `buildSystemPrompt()` rebuilds from
eight tables on every single message: learnings, kept recommendations, journal,
activities, flights, accommodation, packing, trip. Starting a new session therefore loses
nothing durable — everything that mattered was extracted into a table by a tool at
the time it was said.

That is what makes this feature a schema change rather than a memory-architecture
project, and it's the property to protect. **Do not** compensate by feeding other
sessions' transcripts into the prompt. If something needs to survive a session
boundary, the fix is a tool that writes it to a table, not a wider context window.

### Schema

```sql
create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  title text,
  started_by text,
  created_at timestamptz default now(),
  last_message_at timestamptz default now()
);

alter table messages add column session_id uuid references chat_sessions(id) on delete cascade;
create index on messages (session_id, created_at);
```

`title` is nullable — a session exists before it has a name.

**Backfill in the same migration.** Create one session titled "Before sessions" and
point every existing message at it. Skipping this orphans the entire history behind a
UI that filters on `session_id`, and it will look exactly like data loss.

```sql
with s as (insert into chat_sessions (title) values ('Before sessions') returning id)
update messages set session_id = (select id from s) where session_id is null;
```

Make `session_id` `not null` only after the backfill. Add the `chat_sessions` policy
using `is_trip_member()` from PR 4.

### Behaviour

- **Shared, not per-user.** Shared chat history is a product requirement — sessions
  are a way to organise one shared history, not to give each traveller their own.
  `started_by` is a label, not an owner.
- **New chat** creates a session lazily: don't insert a row until the first message
  is sent, or an abandoned tap leaves an empty session in the list forever.
- **Titles.** Auto-name from the first exchange. Cheapest good option: after the
  first assistant reply lands, one short non-streaming call asking for a ≤6-word
  title. Fall back to the first 40 characters of the opening message if it fails —
  a title is not worth failing a turn over. Let it be edited.
- **`last_message_at`** updates on every insert; the list sorts on it descending.
- **Loading a session** replaces `messages` state; the tool loop is untouched.

### UI

The design has four tabs (Chat, Agenda, Saved, Pack) and no icons, and
`design-spec.md` is the source of truth — don't add a fifth for this. Sessions are a
way to organise the Chat tab, not a place of their own. Minimal fit within the
existing shell:

- On the Chat tab, the header subtitle becomes the current session's title.
- Tapping it opens a list of sessions (title, relative date, message count) with
  **New chat** at the top.
- The list reuses the Saved tab's card treatment. No new tokens.

This is the one part of this PR that touches design. If it grows past a list and a
button, it needs a pass in Claude Design first rather than invented styling.

### Also fix while you're in here

`App.jsx:85` — `setMessages(updatedMessages)` is built from a stale `messages`
closure, and `loadMessages()` runs once on mount and never again. Together that means
you don't see the other person's messages until a full page reload, and the header's
Refresh button doesn't help because it only refreshes the six trip tables. Wire
`loadMessages` into `refreshAll` and the visibility/focus handler, and make the
post-insert update `setMessages(prev => [...prev, savedMsg])`.

Roughly five lines, and it delivers most of what realtime would, which is why
realtime stays deferred.

### Done when

New chat starts an empty thread; past sessions load intact; the pre-existing history
is in "Before sessions"; a fact told to the agent in session A is still known in
session B because it was saved to a table; and the request payload no longer grows
with total app usage.

---

## PR 6 — Live flight status

### Scope, honestly

Two flights: outbound Sep 15, return Sep 26. Flight-status APIs generally have no
data until roughly 24–72 hours before departure, so **this feature does nothing until
about Sep 13** and is fully exercised on exactly two days.

It is also the one thing here that a competitor already does well: the airline's own
app will tell you about a delay, probably sooner.

Build it anyway, but build it for the thing the airline app can't do. The value isn't
a status line on a card — it's that **the agent knows**. "You land 40 minutes late,
so the 16:00 check-in is tight but fine, and skip the supermarket stop" is a sentence
only this app can produce. Spec the system-prompt integration as the deliverable and
the card as the by-product, not the reverse.

### Architecture

Same shape as `api/chat.js`, for the same reason: the provider key must not reach the
browser.

```
Agenda mount / focus
   └─▶ POST /api/flight-status  { flightIds }
            └─▶ api/flight-status.js   (server holds FLIGHT_API_KEY)
                     ├─▶ provider API
                     └─▶ supabase upsert flight_status     ← shared, cached
   ◀── rows
```

Write results to Supabase rather than returning them straight to the caller. Three
things fall out of that: both phones see the same status, the last-known value
survives an API outage, and `buildSystemPrompt()` can read it like any other table.

```sql
create table flight_status (
  flight_id uuid primary key references flights(id) on delete cascade,
  status text,              -- scheduled | active | landed | cancelled | diverted | unknown
  scheduled_departure timestamptz,
  estimated_departure timestamptz,
  scheduled_arrival timestamptz,
  estimated_arrival timestamptz,
  departure_gate text,
  departure_terminal text,
  arrival_gate text,
  arrival_terminal text,
  raw jsonb,                -- the provider payload, for debugging a wrong answer
  fetched_at timestamptz default now()
);
```

### Provider

**Decision needed.** AviationStack, FlightAware AeroAPI, and FlightLabs all have free
or cheap tiers that cover two flights comfortably. Pick on: does the free tier
include *live* status (several restrict it to paid), does it cover the specific
carrier, and how it identifies a flight — most want IATA flight number plus date,
which is what `flights.flight_number` and `flights.date` already hold.

Isolate the provider behind one module with one function,
`fetchStatus({ flightNumber, date })` returning the shape above. Assume you will
change providers once when the first one disappoints.

### Polling

No webhooks on cheap tiers, so poll — but narrowly:

- Only when a flight is within **72 hours**, and never for a flight more than 24h
  past. Outside that window, skip the call entirely and serve whatever is stored.
- Only on Agenda mount and on the existing focus/visibility refetch. No timers.
- Server-side cache: if `fetched_at` is under **15 minutes** old, return the stored
  row without calling the provider.

That keeps a free tier's monthly quota safe by roughly two orders of magnitude, and
the window check means the feature costs nothing at all for the 340 days a year
you're not flying.

### System prompt

Add a `## Flight Status` section to `buildSystemPrompt()` — near Flights, and only
when there's something to say. Include the delta, not just the times ("estimated
arrival 14:35, 40 minutes late"), because the delta is what the agent reasons with.
When nothing is live, the section says so; do not leave a stale value looking current.

### Failure and testing

Never show a bare failure and never imply freshness you don't have. Show last-known
with an explicit relative timestamp — "as of 12 minutes ago" — and on total failure,
the scheduled times as they already appear today. This is the same principle as the
blank-page work: degrade to something that explains itself.

**Testing before September.** You cannot test this on your own flights until ~Sep 13,
which is two days before you fly and much too late to find out the provider doesn't
cover your carrier. Build a dev-only override that lets you pass an arbitrary flight
number and date, point it at something departing today, and verify the whole path in
August. Confirm your actual carrier and flight numbers are covered at the same time.

### Design

The Flights card already has a headline/footer split (`pickFlights`). Live status
needs a home in it, and that is a design decision, not a coding one — take it to
Claude Design and transcribe into `design-spec.md` rather than inventing a colour for
"delayed". Until then, plain text under the headline using existing tokens.

### Done when

Within 72 hours of a flight, the Agenda shows live status with a fetch timestamp; the
agent can answer "are we delayed?"; both phones agree; and pulling the network shows
last-known with its age rather than an error or a blank.

---

## Cross-cutting

**Migrations.** Numbered, run by hand in the Supabase SQL editor, per the existing
convention: 003 for auth, 004 for sessions, 005 for flight status — 002 is taken by
the packing list. Every one updates
`supabase-schema.sql` too, and every one gets called out in the PR description,
because someone has to paste it in.

**Environment variables.** PR 6 adds `FLIGHT_API_KEY` — server-only, deliberately
without the `VITE_` prefix so Vite can't inline it, and set as a **Secret** in Vercel.
The two `VITE_` vars must stay type **Config**: they are compiled into the bundle and
Vercel will refuse to call them secret, correctly.

**One PR each.** These three touch different layers and have different risk. Bundling
auth with a schema change makes the diff unreviewable, which is the same reasoning
that kept auth out of the design-system PR in session 1.

## Out of scope, deliberately

- **Supabase realtime.** The focus refetch plus the fix in PR 5 covers the realistic
  two-phones case. Revisit after the trip if it actually annoyed you.
- **Weather.** Still deferred; the prompt slot stays.
- **Per-user data isolation.** Shared trip, shared everything. Auth is a gate, not a
  partition.
- **Structured day plans (the old PR 2).** Day planning works conversationally today.
  It's the best remaining feature idea, but it competes with these three for 16 days
  and loses to all of them.
