-- Run this in your Supabase SQL Editor (supabase.com → your project → SQL Editor)
--
-- This is the full current schema, for a fresh database. If you already ran an
-- earlier version of this file, don't re-run it — apply the numbered migrations
-- instead, which add the same changes to an existing database:
--
--   001  status columns on recommendations and journal
--   002  the packing_items table and its 160 seed items
--   003  Google auth: is_trip_member() and the nine policy swaps
--   004  chat_sessions, messages.session_id, and the backfill of old messages
--
-- On a fresh database: run this file, then 002 for the packing seed. 004's
-- backfill is a migration-only concern: a fresh database has no messages to
-- orphan, and session_id is not null here from the start.

-- Trip profile
create table trip (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_date date not null,
  end_date date not null,
  travelers jsonb not null default '[]',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Flights
create table flights (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('outbound', 'return')),
  date date not null,
  departure_time text not null,
  arrival_time text not null,
  from_airport text not null,
  to_airport text not null,
  airline text,
  flight_number text,
  confirmation_ref text,
  created_at timestamptz default now()
);

-- Accommodation
create table accommodation (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  check_in date not null,
  check_out date not null,
  status text not null default 'researching' check (status in ('booked', 'researching', 'wishlist')),
  notes text,
  confirmation_ref text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Activities (booked/reserved things pinned to dates)
create table activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  time text,
  location text,
  notes text,
  confirmation_ref text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Recommendations (unscheduled suggestions)
create table recommendations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'activity' check (category in ('food', 'activity', 'day-trip', 'accommodation', 'other')),
  source text, -- who recommended it
  location text,
  notes text,
  visited boolean default false,
  rating integer check (rating >= 1 and rating <= 5),
  -- Agent-captured suggestions land as 'pending' and need Keep / Not this one
  -- before they count as saved. Only 'kept' rows go into the system prompt.
  status text not null default 'pending' check (status in ('pending', 'kept', 'rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Daily journal
create table journal (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  what_we_did text,
  notes text,
  rating integer check (rating >= 1 and rating <= 5),
  energy_level text check (energy_level in ('low', 'medium', 'high')),
  want_more_of text,
  want_less_of text,
  -- The agent drafts one entry per day from that day's chat; it isn't shown as
  -- part of the trip record until the user keeps it.
  status text not null default 'draft' check (status in ('draft', 'kept')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Agent learnings (extracted from conversations)
create table learnings (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('liked', 'disliked', 'requirement', 'constraint', 'preference')),
  tag text not null,
  note text not null,
  source_message text, -- the user message that triggered this learning
  created_at timestamptz default now()
);

-- Chat sessions
-- One shared history, organised into threads. Sessions are what bound the
-- transcript sent to the API on each turn; the agent's memory is the tables
-- below, rebuilt on every message, so a new session loses nothing durable.
--
-- Shared, not per-user: `started_by` is a label, not an owner.
create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  title text, -- nullable: a session exists before it has a name
  started_by text,
  created_at timestamptz default now(),
  -- The list sorts on this descending. No trigger: the client bumps it after
  -- each insert, the way updated_at is handled elsewhere.
  last_message_at timestamptz default now()
);

-- Chat messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  sender text, -- 'Bar' or 'Ori' for user messages
  content text not null, -- plain-text rendering, used for display
  content_json jsonb,    -- full Claude content blocks (text + tool_use + tool_result)
  created_at timestamptz default now()
);

create index messages_session_created_idx on messages (session_id, created_at);

-- Packing list
-- No status column, unlike recommendations and journal: an unticked checkbox is
-- already its own review state, so the agent's add_packing_item writes straight
-- to the list (like add_activity) and `added_by` is how the UI marks those rows.
--
-- The 160 seed items are NOT here — they live in supabase-migration-002.sql, so
-- there is only one copy of the list. On a fresh database, run this file and then
-- 002: `create table if not exists` no-ops and the seed fires on the empty table.
create table packing_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in (
    'carry-on', 'amir-clothes', 'amir-diapers', 'amir-medical', 'ori', 'bar',
    'hiking-gear', 'toiletries', 'practical', 'documents', 'toys-books'
  )),
  packed boolean not null default false,
  packed_by text,                         -- 'Bar' or 'Ori' — who ticked it
  added_by text not null default 'seed',  -- 'seed' | 'Bar' | 'Ori' | 'agent'
  -- Position within a category. The list has a deliberate order (passports
  -- first, snacks together) that alphabetical or created_at would destroy.
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index packing_items_category_sort_idx on packing_items (category, sort_order);

-- Row Level Security ---------------------------------------------------------
-- The anon key ships in the client bundle, so without RLS every table is
-- world-readable and world-writable to anyone with the URL. Access is gated on
-- the email claim in the Supabase Auth JWT, checked by one function that all
-- ten policies call — an address changes in exactly one place.
--
-- Checked on the email rather than auth.uid() so it survives a user being
-- deleted and signing in again with a new user id. coalesce() keeps it false
-- (not null) for an anonymous request, where there is no JWT at all.
--
-- The app's sign-in screen mirrors this list in src/lib/auth.js, but that copy
-- is convenience only — this is the enforcement. A Google account that isn't
-- listed here authenticates successfully and then reads zero rows from
-- everything, which is why App.jsx has a "not on this trip" screen.

create or replace function public.is_trip_member() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') in (
    'bar.geffen2@gmail.com',
    'oriorio@gmail.com'
  )
$$;

alter table trip            enable row level security;
alter table flights         enable row level security;
alter table accommodation   enable row level security;
alter table activities      enable row level security;
alter table recommendations enable row level security;
alter table journal         enable row level security;
alter table learnings       enable row level security;
alter table messages        enable row level security;
alter table packing_items   enable row level security;
alter table chat_sessions   enable row level security;

-- `using` governs reads and which rows an update may touch; `with check`
-- governs what a write may leave behind. Both are required — a policy with only
-- `using` leaves the table writable by anyone.
create policy "trip members" on trip            for all using (public.is_trip_member()) with check (public.is_trip_member());
create policy "trip members" on flights         for all using (public.is_trip_member()) with check (public.is_trip_member());
create policy "trip members" on accommodation   for all using (public.is_trip_member()) with check (public.is_trip_member());
create policy "trip members" on activities      for all using (public.is_trip_member()) with check (public.is_trip_member());
create policy "trip members" on recommendations for all using (public.is_trip_member()) with check (public.is_trip_member());
create policy "trip members" on journal         for all using (public.is_trip_member()) with check (public.is_trip_member());
create policy "trip members" on learnings       for all using (public.is_trip_member()) with check (public.is_trip_member());
create policy "trip members" on messages        for all using (public.is_trip_member()) with check (public.is_trip_member());
create policy "trip members" on packing_items   for all using (public.is_trip_member()) with check (public.is_trip_member());
create policy "trip members" on chat_sessions   for all using (public.is_trip_member()) with check (public.is_trip_member());

-- Seeds ----------------------------------------------------------------------
-- These run in the SQL editor, which is not subject to RLS, so they insert fine
-- even though the policies above would reject the same statement from the app.

-- Seed the trip
insert into trip (title, start_date, end_date, travelers, notes) values (
  'Salzburg 2026',
  '2026-09-15',
  '2026-09-26',
  '["Ori", "Bar", "Amir"]',
  'Two adults + 17-month-old. Open to day trips within ~1hr of Salzburg.'
);

-- Seed the flights
insert into flights (direction, date, departure_time, arrival_time, from_airport, to_airport, airline, flight_number) values
  ('outbound', '2026-09-15', '12:00', '14:35', 'TLV Terminal 1', 'SZG', 'Israir', '6H 243'),
  ('return', '2026-09-26', '12:50', '17:25', 'SZG', 'TLV', 'Israir', '6H 250');
