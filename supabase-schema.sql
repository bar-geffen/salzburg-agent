-- Run this in your Supabase SQL Editor (supabase.com → your project → SQL Editor)

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
  content text not null,
  created_at timestamptz default now()
);

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
