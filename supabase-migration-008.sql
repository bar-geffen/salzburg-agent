-- Migration 008 — the car gets a table, stays get their check-in times
--
-- Run this in the Supabase SQL Editor (SQL Editor -> New query -> paste -> Run).
--
-- ASCII-only, so `cat supabase-migration-008.sql | pbcopy` is safe.
--
-- Safe to run twice: the column adds are guarded, the car seed only fires on an
-- empty table, and the trip.notes rewrite only fires while the car paragraph is
-- still in there.
--
-- This IS a schema change, so it is mirrored into supabase-schema.sql.
--
-- WHY. 006 put the car rental in trip.notes because there was nowhere else for
-- it. That was wrong in a way that only showed up on a phone: trip.notes renders
-- on the Agenda's first card, so an 11-line rental contract became the first
-- thing you read about your own trip, ahead of where you are sleeping. A booking
-- with a date, a time, a place and a reference is the same shape as a flight, and
-- it wants the same thing a flight has -- its own row and its own card.
--
-- The accommodation columns are the other half of the same lesson. "Check-in
-- 15:00-20:00, ring an hour ahead" was buried in a notes paragraph next to the
-- cancellation policy, so the card could either show all of it or none of it.
-- A time you have to hit is not a note.

-- 1. Accommodation: the fields the card actually needs ----------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'accommodation' and column_name = 'check_in_time'
  ) then
    -- text, not time: "15:00-20:00" is a window, and the window is the fact.
    alter table accommodation add column check_in_time text;
    alter table accommodation add column check_out_time text;
    -- Optional exact pin. The card falls back to a maps search on name +
    -- address, which is right often enough that this stays nullable.
    alter table accommodation add column maps_url text;
  end if;
end $$;

update accommodation set check_in_time = '15:00-20:00', check_out_time = '09:30'
where check_in = '2026-09-19' and check_in_time is null;

-- 2. The car ----------------------------------------------------------------
-- One row per rental. Shaped like flights: a pick-up and a drop-off, each with
-- a place, a date and a time, plus the reference you have to quote at the desk.

create table if not exists car_rental (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  vehicle text,
  pickup_location text not null,
  pickup_date date not null,
  pickup_time text,
  dropoff_location text,
  dropoff_date date not null,
  dropoff_time text,
  driver text,
  confirmation_ref text,
  maps_url text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table car_rental enable row level security;

drop policy if exists "trip members" on car_rental;
create policy "trip members" on car_rental
  for all using (public.is_trip_member()) with check (public.is_trip_member());

insert into car_rental (
  company, vehicle, pickup_location, pickup_date, pickup_time,
  dropoff_location, dropoff_date, dropoff_time, driver, confirmation_ref, notes
)
select
  'Budget Austria (via Ofran)',
  'Group SI CDAR - Seat Leon or similar, automatic, A/C',
  'Salzburg Airport', '2026-09-15', '16:00',
  'Salzburg Airport', '2026-09-26', '13:00',
  'Ori (the only named driver)',
  '02385655IL6',
  'Voucher 45427841. Airport desk +43 662 877 278, open 08:30-20:30. Included: airport fee, Super CDW and Super TP both at zero excess, unlimited km, VAT, vehicle licence fee. Not included: GPS (EUR 170), one-way fees, tolls and vignettes. Fuel is full-to-full, so budget a fill-up near the airport on the last morning. Baby seat pre-booked, EUR 99 plus tax, for a child of 1y5m - bringing our own instead is still an open option. Crossing a border needs written confirmation from the rental company, so Germany is out: Berchtesgaden, Koenigssee, and the deutsches Eck shortcut between Salzburg and the Pinzgau; route via the A10. Watch the last morning - the car is booked back at 13:00 on Sep 26 but the flight leaves at 12:50, so it has to go back hours before the booked time.'
where not exists (select 1 from car_rental);

-- 3. Give the trip card its trip back ---------------------------------------
-- What is left is what belongs on a trip card: who is going, and what is still
-- open. Everything else now has a card of its own.
--
-- Guarded on the car paragraph still being present, so this cannot run twice and
-- cannot overwrite facts the agent has noted since.

update trip set notes =
'Two adults (Bar, Ori) + Amir, 17 months. Self-drive, three legs.
Still open: Salzburg city accommodation for Sep 24-26. Rupertikirtag runs Sep 23-27 in the Altstadt, so weigh location against the crowds.
Still open: laundry access at all three properties, which the six-days-of-clothes packing plan depends on.
Still open: Sommerkarte inclusion with the Kaprun host.'
where notes like '%Budget Austria%';

-- 4. Check it worked --------------------------------------------------------
-- Expect: three new accommodation columns, one car row, and trip notes that are
-- four short lines rather than a page.

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'accommodation'
  and column_name in ('check_in_time', 'check_out_time', 'maps_url')
order by column_name;

select company, pickup_date, pickup_time, dropoff_date, dropoff_time, confirmation_ref from car_rental;

select name, check_in, check_in_time, check_out_time from accommodation order by check_in;

select length(notes) as trip_notes_length, notes from trip;

notify pgrst, 'reload schema';
