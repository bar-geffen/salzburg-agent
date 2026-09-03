-- Migration 005 — the region guide's places, as recommendations
--
-- Run this in the Supabase SQL Editor (SQL Editor -> New query -> paste -> Run).
--
-- HOW YOU COPY THIS FILE MATTERS, for the same reason as 002: it contains German
-- umlauts (Zwölferhorn, Bürgl, Mönchsberg, Schmittenhöhe). `cat file | pbcopy`
-- mangles them when LANG is unset. Copy from a text editor, or use:
--
--   osascript -e 'set the clipboard to (read POSIX file "'"$PWD"'/supabase-migration-005.sql" as «class utf8»)'
--
-- The verification query at the bottom prints the names back — read its output.
--
-- Safe to run twice. Both inserts are guarded on `source = 'Region guide'`, so a
-- second run is a no-op rather than a duplicate set.
--
-- No schema change here; this is a data seed, so it is not mirrored into
-- supabase-schema.sql (same arrangement as 002's 160 packing items).
--
-- WHY THESE LAND AS 'kept', NOT 'pending'. The review gate exists for what the
-- agent catches in chat -- nothing it captures should count as saved without a
-- tap. These rows are the travellers' own researched shortlist, pasted in by
-- hand, and routing them through review would mean tapping Keep 27 times to
-- confirm a list they wrote. They are also the prose in src/data/region-guide.js,
-- which the agent reads as reference regardless of this table.

-- 1. The places -------------------------------------------------------------
-- Extracted from src/data/region-guide.js. The notes keep the opinion and the
-- turn-back point, because a name on its own is the part nobody needed.

insert into recommendations (name, category, source, location, notes, status)
select v.name, v.category, v.source, v.location, v.notes, v.status
from (values
  -- Leg 1 - St. Gilgen / Wolfgangsee
  ('Zwölferhorn cable car', 'activity', 'Region guide', 'St. Gilgen',
   'Leg 1. 15 min ride, station in the village. Clear morning, back before the nap.', 'kept'),
  ('Wolfgangsee boat to St. Wolfgang', 'day-trip', 'Region guide', 'Wolfgangsee',
   'Leg 1. 45 min each way; the village is the day trip. Skip the Schafbergbahn.', 'kept'),
  ('Mondsee', 'day-trip', 'Region guide', 'Mondsee',
   'Leg 1. 30 min drive. Sound of Music church, small pedestrian centre, lake promenade. Easy half-day.', 'kept'),
  ('St. Gilgen lakefront playground', 'activity', 'Region guide', 'St. Gilgen',
   'Leg 1. By the boat dock. The default late-afternoon spot.', 'kept'),
  ('Fuschlsee', 'activity', 'Region guide', 'Fuschlsee',
   'Leg 1. The quieter alternative to Wolfgangsee - flat lake path, stroller-friendly loop.', 'kept'),
  ('Zwölferhorn Panorama Circuit', 'activity', 'Region guide', 'St. Gilgen',
   'Leg 1 hike. Gondola up, ~4km flat loop, hut at the top - the best short mountain hike here for this age. Shorten: turn back at the first meadow (~1km).', 'kept'),
  ('St. Gilgen to Fürberg lakeside path', 'activity', 'Region guide', 'Wolfgangsee',
   'Leg 1 hike. ~5km one-way along the shore to Gasthaus Fürberg. Bail-out: ferry back from the Fürberg dock.', 'kept'),
  ('Falkenstein pilgrim path (partial)', 'activity', 'Region guide', 'St. Gilgen',
   'Leg 1 hike. St. Gilgen to Fürberg segment only, ~5km / 200m. Do not continue to St. Wolfgang (8.9km plus a climb) - ferry back.', 'kept'),
  ('Fuschlsee northern shore', 'activity', 'Region guide', 'Fuschlsee',
   'Leg 1 hike. Flat, forested, turn back anywhere. Aim 5-6km out-and-back; the full loop is 11km, so do not.', 'kept'),
  ('Bürgl Panoramaweg', 'activity', 'Region guide', 'Strobl',
   'Leg 1 hike. 4.8km easy loop on wooden walkways around the rock. Very carrier-friendly.', 'kept'),

  -- Leg 2 - Kaprun / Zell am See
  ('Sigmund-Thun-Klamm gorge walk', 'activity', 'Region guide', 'Kaprun',
   'Leg 2. ~1hr loop on wooden walkways, on the doorstep. Carrier only, not a stroller.', 'kept'),
  ('Zell am See lakefront + Elisabethpark', 'activity', 'Region guide', 'Zell am See',
   'Leg 2. Flat promenade, playground, boat rentals. The easy default day.', 'kept'),
  ('Maiskogel cable car', 'activity', 'Region guide', 'Kaprun',
   'Leg 2. The better toddler choice over the Kitzsteinhorn - meadows, easy walks, alpine coaster nearby.', 'kept'),
  ('Kitzsteinhorn - stop at the Alpincenter', 'activity', 'Region guide', 'Kaprun',
   'Leg 2. The 3,029m top station is too high for a toddler (irritability, disrupted sleep, AMS risk). Stop at the Alpincenter, 2,450m: glacier views and snow to touch. Under an hour up there.', 'kept'),
  ('Krimml Waterfalls', 'day-trip', 'Region guide', 'Krimml',
   'Leg 2. Lower section is stroller-friendly on paved path; do not attempt the full ascent. ~1hr drive each way - save it for good weather.', 'kept'),
  ('Grossglockner High Alpine Road', 'day-trip', 'Region guide', 'Grossglockner',
   'Leg 2. One dedicated day, planned as a drive with stops (Edelweiss Spitze, Fuscher Törl), not as hikes. Time it so he sleeps through the switchbacks.', 'kept'),
  ('Maiskogel Hut Tour', 'activity', 'Region guide', 'Kaprun',
   'Leg 2 hike - the best mountain hike of the trip. MK Maiskogelbahn to 1,570m, then pram-friendly: Unterbergalm, Glocknerblick, Maiskogel Alm. ~5-6km loop, gentle, several hut stops, cable car back down.', 'kept'),
  ('Sigmund-Thun-Klamm + Klammsee loop', 'activity', 'Region guide', 'Kaprun',
   'Leg 2 hike. Gorge walkway plus the easy lake loop above it. ~4.5km, 1.5-2.5hr. Carrier essential in the gorge.', 'kept'),
  ('Kapruner Loop', 'activity', 'Region guide', 'Kaprun',
   'Leg 2 hike. ~5km circular above the village, Zeller See and Kitzsteinhorn views. No cable car needed - the option for when the weather clears.', 'kept'),
  ('Zeller See lakeside walk to Thumersbach', 'activity', 'Region guide', 'Zell am See',
   'Leg 2 hike. Flat, stroller/carrier-friendly, beaches and cafes. 5-7km one-way, boat or bus back. Do not do the full 11km loop.', 'kept'),
  ('Kitzsteinhorn glacier moraine loop', 'activity', 'Region guide', 'Kaprun',
   'Leg 2 hike. ~30 min circular from the Alpincenter (2,450m). Short by design; pair with the cable-car visit, under an hour at altitude total.', 'kept'),
  ('Sisi circular trail (Schmittenhöhe)', 'activity', 'Region guide', 'Zell am See',
   'Leg 2 hike. Easy top-of-cable-car loop, panoramic, ~2-3km. A good add-on if you are already up there.', 'kept'),

  -- Leg 3 - Salzburg city
  ('Mirabell Gardens', 'activity', 'Region guide', 'Salzburg',
   'Leg 3. Free, stroller-perfect, iconic. 30 min.', 'kept'),
  ('Hohensalzburg Fortress', 'activity', 'Region guide', 'Salzburg',
   'Leg 3. Funicular up, walk the ramparts, come down. Skip the interior museums.', 'kept'),
  ('Salzburg Zoo (Hellbrunn)', 'activity', 'Region guide', 'Salzburg',
   'Leg 3. One of the best toddler activities in the region - small, walkable, open enclosures. Half a day.', 'kept'),
  ('Getreidegasse + Altstadt stroll', 'activity', 'Region guide', 'Salzburg',
   'Leg 3. 1-2 hrs at most. Cobblestones are rough on a stroller - use the carrier.', 'kept'),
  ('Mönchsberg / Kapuzinerberg paths', 'activity', 'Region guide', 'Salzburg',
   'Leg 3 hike. 3-5km carrier-fine loops above the old town with fortress views, stroller-difficult. Two nights are realistically better spent on the sights.', 'kept')
) as v(name, category, source, location, notes, status)
where not exists (select 1 from recommendations where source = 'Region guide');

-- 2. The cuts ---------------------------------------------------------------
-- The guide names what to skip, and this table already has a place for that:
-- build-system-prompt.js excludes 'rejected' rows entirely "so they don't get
-- re-proposed", which is exactly what these are. They stay out of the Saved tab
-- too -- it renders pending and kept only. The reasoning lives in the guide file,
-- which the agent does read.
--
-- Hellbrunn's trick fountains are deliberately NOT here: that one is a
-- conditional skip (fine if it's unseasonably warm), and a rejected row is
-- invisible, so the condition could never be weighed. It stays in the guide only.
--
-- Delete this block before pasting if you would rather keep the shortlist to
-- things you're doing.

insert into recommendations (name, category, source, location, notes, status)
select v.name, v.category, v.source, v.location, v.notes, v.status
from (values
  ('Sound of Music bus tour', 'day-trip', 'Region guide (cut)', 'Salzburg',
   'Cut: too long, toddler-hostile.', 'rejected'),
  ('Salzbergwerk salt mines', 'day-trip', 'Region guide (cut)', 'Hallein',
   'Cut: realistically age 4+.', 'rejected'),
  ('DomQuartier museums', 'activity', 'Region guide (cut)', 'Salzburg',
   'Cut: not toddler-appropriate.', 'rejected'),
  ('Schafbergbahn cog railway', 'activity', 'Region guide (cut)', 'St. Wolfgang',
   'Cut: too long, and altitude this age does not need.', 'rejected'),
  ('Kitzsteinhorn summit (top station)', 'activity', 'Region guide (cut)', 'Kaprun',
   'Cut: 3,029m is an altitude risk for a toddler. Stop at the Alpincenter instead.', 'rejected'),
  ('Berchtesgaden / Königssee', 'day-trip', 'Region guide (cut)', 'Germany',
   'Cut: Austria-only routing, not even in transit.', 'rejected')
) as v(name, category, source, location, notes, status)
where not exists (select 1 from recommendations where source = 'Region guide (cut)');

-- 3. Check it worked --------------------------------------------------------
-- Read this output rather than trusting "Success. No rows returned". Expect
-- 27 kept and 6 rejected, and umlauts that still look like umlauts.

select status, count(*) as rows, string_agg(name, ' | ' order by name) as names
from recommendations
where source like 'Region guide%'
group by status
order by status;
