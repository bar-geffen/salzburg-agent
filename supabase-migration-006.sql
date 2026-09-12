-- Migration 006 — the booked itinerary: accommodation rows and the standing facts
--
-- Run this in the Supabase SQL Editor (SQL Editor -> New query -> paste -> Run).
--
-- Deliberately ASCII-only, unlike 002 and 005: no umlauts to mangle on the way
-- through the clipboard, so `cat supabase-migration-006.sql | pbcopy` is safe.
--
-- Safe to run twice. The accommodation inserts are guarded on confirmation_ref /
-- check_in, and the trip update is a straight overwrite of one row's notes.
--
-- No schema change here; this is data, so it is not mirrored into
-- supabase-schema.sql (same arrangement as 002 and 005).
--
-- WHY THIS IS SQL AND NOT A TOOL CALL. save_accommodation and note_trip_fact
-- would write exactly these rows, but they run client-side against an
-- authenticated session. This is the travellers' own paperwork, transcribed in
-- one pass, so it goes in by hand like the other seeds.
--
-- The flights already match this itinerary from the base schema (6H 243 out on
-- Sep 15 landing 14:35, Israir direct back on Sep 26 at 12:50), so nothing here
-- touches the flights table.

-- 1. Accommodation ----------------------------------------------------------
-- Legs 1 and 2 only. The Salzburg city stay (Sep 24-26) is NOT booked, and a
-- 'researching' row with no property name would be a placeholder the agent
-- reads as progress. It stays in the trip notes as an open item until there is
-- a real booking, which is then a save_accommodation call, not another migration.

insert into accommodation (name, address, check_in, check_out, status, confirmation_ref, notes)
select v.name, v.address, v.check_in::date, v.check_out::date, v.status, v.confirmation_ref, v.notes
from (values
  ('Anna Pertl', 'St. Gilgen, Wolfgangsee', '2026-09-15', '2026-09-19', 'booked', null,
   'Leg 1, 4 nights. ~EUR 1,088 total. ~55 min drive from Salzburg Airport. Non-refundable now - free cancellation ended Sep 7. Check-out is the morning of the 19th, the day of the drive to Kaprun.'),
  ('Apartments Obernosterer, unit AP6', 'Sportplatzstr. 19, 5710 Kaprun', '2026-09-19', '2026-09-24', 'booked', '21145',
   'Leg 2, 5 nights. EUR 900 total, Ortstaxe and Mobilitaetsabgabe included, 10% MwSt. Check-in 15:00-20:00 and the arrival time has to be given at least an hour ahead; an arrival after 20:00 must be agreed in advance or the booking can be cancelled. Check-out 09:30. Host +43 664 111 5655, info@apartment-kaprun.com. Whether the Sommerkarte is included is still to confirm with the host.')
) as v(name, address, check_in, check_out, status, confirmation_ref, notes)
where not exists (
  select 1 from accommodation a where a.check_in = v.check_in::date
);

-- 2. Standing facts on the trip row -----------------------------------------
-- The car rental has no table of its own and does not want one: it is a single
-- standing fact for the whole trip, which is what trip.notes is for (the same
-- place note_trip_fact writes). The seeded note this replaces described a
-- single-base trip within an hour of Salzburg, which is no longer the shape.
--
-- The three open items are three separate lines rather than one numbered
-- sentence, because remove_trip_fact takes a line at a time: booking the city
-- stay should close exactly that item, and a blob would force the agent to
-- delete all three and retype the two that are still open.

update trip set notes =
'Two adults (Bar, Ori) + Amir, 17 months. Self-drive, three legs: St. Gilgen Sep 15-19, Kaprun Sep 19-24, Salzburg city Sep 24-26.

Car: Budget Austria, booked via Ofran. Pick-up Salzburg Airport Tue 15 Sep 16:00, drop-off Salzburg Airport Sat 26 Sep 13:00, 11 days. Group SI CDAR - Seat Leon or similar, automatic, A/C. Voucher 45427841, confirmation 02385655IL6. Ori is the only named driver (min age 30). Airport desk +43 662 877 278, open 08:30-20:30. Included: airport fee, Super CDW and Super TP both at zero excess, unlimited km, VAT, vehicle licence fee. Not included: GPS (EUR 170), one-way fees, tolls and vignettes. Fuel is full-to-full. Crossing a border needs written confirmation from the rental company, so Germany is out for this trip - Berchtesgaden and Koenigssee, and also the deutsches Eck shortcut between Salzburg and the Pinzgau; route via the A10.

Baby seat pre-booked with the car, EUR 99 plus tax, logged for a child of 1y5m. Bringing our own seat instead is still an open option.

Watch the last morning: the car is booked back at 13:00 on Sep 26 but the flight leaves at 12:50, so the return has to happen hours before the booked time, with a fill-up before it.

Still open: Salzburg city accommodation for Sep 24-26. Rupertikirtag runs Sep 23-27 in the Altstadt, so weigh location against the crowds.
Still open: laundry access at all three properties, which the six-days-of-clothes packing plan depends on.
Still open: Sommerkarte inclusion with the Kaprun host.'
where id = (select id from trip order by created_at limit 1);

-- 3. Check it worked --------------------------------------------------------
-- Read this output rather than trusting "Success. No rows returned". Expect two
-- accommodation rows, and trip notes that start with "Two adults".

select name, check_in, check_out, status, confirmation_ref from accommodation order by check_in;
select left(notes, 80) as trip_notes_start, length(notes) as notes_length from trip;
