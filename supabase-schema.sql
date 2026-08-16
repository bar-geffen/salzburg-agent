-- Run this in your Supabase SQL Editor (supabase.com → your project → SQL Editor)
--
-- This is the full current schema, for a fresh database. If you already ran an
-- earlier version of this file, don't re-run it — apply supabase-migration-001.sql
-- instead, which adds the same changes to an existing database.

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

-- Chat messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('user', 'assistant')),
  sender text, -- 'Bar' or 'Ori' for user messages
  content text not null, -- plain-text rendering, used for display
  content_json jsonb,    -- full Claude content blocks (text + tool_use + tool_result)
  created_at timestamptz default now()
);

-- Row Level Security ---------------------------------------------------------
-- The anon key ships in the client bundle, so without RLS every table is
-- world-readable and world-writable to anyone with the URL. These policies keep
-- today's behaviour identical while putting the switch in place: to lock the app
-- down later, replace `using (true)` here rather than changing app code.

alter table trip            enable row level security;
alter table flights         enable row level security;
alter table accommodation   enable row level security;
alter table activities      enable row level security;
alter table recommendations enable row level security;
alter table journal         enable row level security;
alter table learnings       enable row level security;
alter table messages        enable row level security;

create policy "anon full access" on trip            for all using (true) with check (true);
create policy "anon full access" on flights         for all using (true) with check (true);
create policy "anon full access" on accommodation   for all using (true) with check (true);
create policy "anon full access" on activities      for all using (true) with check (true);
create policy "anon full access" on recommendations for all using (true) with check (true);
create policy "anon full access" on journal         for all using (true) with check (true);
create policy "anon full access" on learnings       for all using (true) with check (true);
create policy "anon full access" on messages        for all using (true) with check (true);

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
