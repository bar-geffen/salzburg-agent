-- Migration 002 — the packing list
--
-- Run this in the Supabase SQL Editor (SQL Editor → New query → paste → Run).
--
-- Safe to run as many times as you like. The table creation is guarded, the RLS
-- policy is dropped before it is created, and the seed only fires when the table
-- is completely empty — so a second run is a no-op rather than 160 duplicates.
-- This matters because the SQL editor runs the whole script in one transaction:
-- one "already exists" error would roll back everything else too.
--
-- The last statement prints one row per category with its item count, so you can
-- see it worked instead of trusting "Success. No rows returned".

-- 1. The table --------------------------------------------------------------
-- Note what is deliberately absent: a `status` column. Recommendations and
-- journal entries have one because the design requires review before they count
-- as saved. An unticked checkbox is already its own review state, and removing
-- an item is one tap — so the agent's add_packing_item writes straight to the
-- list, the way add_activity writes straight to the agenda. `added_by` is how
-- the UI marks those rows, so nothing the agent adds appears silently.

create table if not exists packing_items (
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

-- Every read is "one category, in order", which is exactly this index.
create index if not exists packing_items_category_sort_idx
  on packing_items (category, sort_order);

-- 2. Row Level Security -----------------------------------------------------
-- Same permissive policy as every other table (see migration 001): the switch is
-- in place so tightening access later means editing the policy, not the app.

alter table packing_items enable row level security;
drop policy if exists "anon full access" on packing_items;
create policy "anon full access" on packing_items for all using (true) with check (true);

-- 3. Seed -------------------------------------------------------------------
-- The list as it stood before it moved into the app. Only runs on an empty
-- table, so re-running this file never duplicates and never clobbers a tick.

insert into packing_items (name, category, sort_order)
select name, category, sort_order
from (values
  -- Carry-on ✈️
  ('Passports (3)', 'carry-on', 1),
  ('Baby carrier', 'carry-on', 2),
  ('Infant car seat (gate-check)', 'carry-on', 3),
  ('Israir booking + car rental voucher', 'carry-on', 4),
  ('EUR cash + €1 coins for Kaprun laundry', 'carry-on', 5),
  ('Laptops + chargers', 'carry-on', 6),
  ('Garmin charger', 'carry-on', 7),
  ('Headphones (Ori + Bar)', 'carry-on', 8),
  ('Earplugs, eyemask (Ori)', 'carry-on', 9),
  ('Amir: 1 tetra', 'carry-on', 10),
  ('Amir: shoes (worn)', 'carry-on', 11),
  ('Amir: warm hat + sun hat', 'carry-on', 12),
  ('Amir: fleece / sweatshirt', 'carry-on', 13),
  ('Amir: 6–7 diapers', 'carry-on', 14),
  ('Amir: water bottle / sippy', 'carry-on', 15),
  ('Amir: 1 bag wet wipes', 'carry-on', 16),
  ('Amir: pacifiers', 'carry-on', 17),
  ('Amir: 1 dose Novimol/Neurofen', 'carry-on', 18),
  ('Amir: 2 single-use bibs', 'carry-on', 19),
  ('Amir: 1 spoon', 'carry-on', 20),
  ('Amir: משטח החתלה', 'carry-on', 21),
  ('Amir: sunscreen (small)', 'carry-on', 22),
  ('Amir: sunglasses', 'carry-on', 23),
  ('Amir: full change of clothes (spills)', 'carry-on', 24),
  ('Bar: spare shirt (spills)', 'carry-on', 25),
  ('Snacks: vegetables', 'carry-on', 26),
  ('Snacks: fruit', 'carry-on', 27),
  ('Snacks: olive sticks', 'carry-on', 28),
  ('Snacks: muffins', 'carry-on', 29),
  ('Snacks: sandwiches', 'carry-on', 30),
  ('Snacks: פרכיות', 'carry-on', 31),
  ('Snacks: מקלות גבינה', 'carry-on', 32),
  ('Toys: drawing pad', 'carry-on', 33),
  ('Toys: popit', 'carry-on', 34),
  ('Toys: busy book', 'carry-on', 35),
  ('Toys: small cars', 'carry-on', 36),
  ('Toys: 1–2 favorite books', 'carry-on', 37),

  -- Amir — clothes
  ('2-tog sleeping bag (Kaprun nights are cold)', 'amir-clothes', 1),
  ('1-tog sleeping bag (St. Gilgen backup)', 'amir-clothes', 2),
  ('2 tetras (1 in carry-on)', 'amir-clothes', 3),
  ('5 short-sleeved bodysuits (base layer)', 'amir-clothes', 4),
  ('6 long-sleeved shirts', 'amir-clothes', 5),
  ('2 warm pajamas (long sleeve + long pants)', 'amir-clothes', 6),
  ('6 pairs of long pants / warm leggings', 'amir-clothes', 7),
  ('3 pairs of thick socks (some wool)', 'amir-clothes', 8),
  ('2 fleeces / warm sweatshirts', 'amir-clothes', 9),
  ('Warm coat / puffer (Kitzsteinhorn day + cold mornings)', 'amir-clothes', 10),
  ('Rain shell / waterproof jacket ⭐', 'amir-clothes', 11),
  ('Warm hat / beanie ⭐', 'amir-clothes', 12),
  ('Mittens or gloves ⭐', 'amir-clothes', 13),
  ('Sun hat (in carry-on)', 'amir-clothes', 14),
  ('Swimsuit (Tauern Spa)', 'amir-clothes', 15),
  ('Waterproof shoes / rubber boots (optional, for puddles)', 'amir-clothes', 16),

  -- Amir — diapers & feeding
  ('Day diapers — 1 pack (buy more at dm/Müller in Kaprun)', 'amir-diapers', 1),
  ('10 nighttime diapers', 'amir-diapers', 2),
  ('4 swim diapers', 'amir-diapers', 3),
  ('2 bags wet wipes (1 in carry-on)', 'amir-diapers', 4),
  ('Silicon bib', 'amir-diapers', 5),
  ('Single-use bibs', 'amir-diapers', 6),
  ('2 spoons (1 in carry-on)', 'amir-diapers', 7),

  -- Amir — medical & care
  ('Nose spray', 'amir-medical', 1),
  ('Eardrops', 'amir-medical', 2),
  ('Novimol / Neurofen', 'amir-medical', 3),
  ('Camilia (nose + teeth)', 'amir-medical', 4),
  ('Tyto', 'amir-medical', 5),
  ('Thermometer ⭐', 'amir-medical', 6),
  ('Nebuliser?', 'amir-medical', 7),
  ('משאף?', 'amir-medical', 8),
  ('Hairbrush', 'amir-medical', 9),
  ('Toothbrush + toothpaste', 'amir-medical', 10),

  -- Ori
  ('Long pajamas (long-sleeve top + pants)', 'ori', 1),
  ('Warm fleece / sweatshirt', 'ori', 2),
  ('Uniqlo down coat ⭐', 'ori', 3),
  ('Rain shell (goes over the down) ⭐', 'ori', 4),
  ('6 t-shirts / base layers', 'ori', 5),
  ('3 long-sleeved shirts (merino if possible)', 'ori', 6),
  ('Hiking pants x 2', 'ori', 7),
  ('Jeans', 'ori', 8),
  ('Underwear x 6', 'ori', 9),
  ('5–6 socks (2 thick wool for hiking)', 'ori', 10),
  ('Hiking boots ⭐', 'ori', 11),
  ('Sneakers (town)', 'ori', 12),
  ('Flipflops (Tauern Spa)', 'ori', 13),
  ('Warm hat / beanie', 'ori', 14),
  ('Light gloves', 'ori', 15),
  ('Buff / neckwarmer', 'ori', 16),
  ('Swimsuit', 'ori', 17),
  ('Sunglasses', 'ori', 18),

  -- Bar
  ('Long pajamas', 'bar', 1),
  ('Sleeping cap', 'bar', 2),
  ('Warm fleece / sweatshirt', 'bar', 3),
  ('Uniqlo down coat ⭐', 'bar', 4),
  ('Rain shell ⭐', 'bar', 5),
  ('6 t-shirts / long-sleeved base layers', 'bar', 6),
  ('3 long-sleeved shirts (merino)', 'bar', 7),
  ('Hiking pants x 2', 'bar', 8),
  ('Jeans', 'bar', 9),
  ('Underwear', 'bar', 10),
  ('Bras', 'bar', 11),
  ('Sports bras', 'bar', 12),
  ('Sports leggings', 'bar', 13),
  ('Modibodi', 'bar', 14),
  ('Ruby cup', 'bar', 15),
  ('5–6 socks (2 thick wool for hiking)', 'bar', 16),
  ('Hiking boots ⭐', 'bar', 17),
  ('Sneakers', 'bar', 18),
  ('Flipflops (Tauern Spa)', 'bar', 19),
  ('Warm hat / beanie', 'bar', 20),
  ('Gloves', 'bar', 21),
  ('Buff / neckwarmer', 'bar', 22),
  ('Swimsuit', 'bar', 23),
  ('Sunglasses', 'bar', 24),
  ('Hairbrush', 'bar', 25),
  ('Toothbrush', 'bar', 26),

  -- Hiking & rain gear (shared)
  ('Rain cover for baby carrier ⭐⭐ (most-forgotten item)', 'hiking-gear', 1),
  ('2 small day-hike backpacks', 'hiking-gear', 2),
  ('2 adult water bottles', 'hiking-gear', 3),
  ('Trail snacks stash (bars, nuts)', 'hiking-gear', 4),
  ('Small first-aid kit (plasters, blister patches)', 'hiking-gear', 5),

  -- Toiletries & skincare
  ('Prophesia', 'toiletries', 1),
  ('Allergix', 'toiletries', 2),
  ('Avamys', 'toiletries', 3),
  ('Prenatal', 'toiletries', 4),
  ('Omega 3', 'toiletries', 5),
  ('Cleanser balm', 'toiletries', 6),
  ('Face wash 1', 'toiletries', 7),
  ('Face wash 2', 'toiletries', 8),
  ('Toners', 'toiletries', 9),
  ('Face creams', 'toiletries', 10),
  ('Serums', 'toiletries', 11),
  ('Acne patches', 'toiletries', 12),
  ('Lip balm x 2 ⭐ (dry alpine air)', 'toiletries', 13),
  ('Hand / body lotion ⭐', 'toiletries', 14),
  ('Adult sunscreen ⭐ (alpine sun)', 'toiletries', 15),
  ('Hairclips', 'toiletries', 16),
  ('Nail clipper', 'toiletries', 17),
  ('Nail file', 'toiletries', 18),

  -- Practical / apartment
  ('Detergent pods (small pack for Kaprun laundry)', 'practical', 1),
  ('€1 coins × ~20 (Obernosterer washer/dryer @ €4)', 'practical', 2),
  ('Reusable shopping bags (Austria doesn''t give free ones)', 'practical', 3),
  ('Small ziplocs (wet swim gear, dirty diapers on drives)', 'practical', 4),
  ('Small trash bags', 'practical', 5),

  -- Documents & money
  ('Passports (3)', 'documents', 1),
  ('Israir booking confirmation', 'documents', 2),
  ('Anna Pertl booking + contact', 'documents', 3),
  ('Obernosterer booking + contact', 'documents', 4),
  ('Salzburg city booking (TBD)', 'documents', 5),
  ('Car rental voucher (SZG)', 'documents', 6),
  ('Travel insurance policy + emergency numbers', 'documents', 7),
  ('Amir''s health insurance card + kupat cholim number', 'documents', 8),
  ('Driver''s license (+ IDP if easy)', 'documents', 9),
  ('Credit cards', 'documents', 10),
  ('EUR cash — small bills', 'documents', 11),

  -- Toys & books (checked)
  ('Cups', 'toys-books', 1),
  ('Extra car-ride entertainment (drives up to 2h)', 'toys-books', 2),
  ('Book: Wheels on the Bus', 'toys-books', 3),
  ('Book: Baby Babble', 'toys-books', 4),
  ('Book: George', 'toys-books', 5),
  ('Book: I''ll Love You Always', 'toys-books', 6),
  ('Book: מעשה בחמישה בלונים', 'toys-books', 7)
) as seed(name, category, sort_order)
where not exists (select 1 from packing_items);

-- 4. Confirm it worked ------------------------------------------------------
-- Expect 11 rows totalling 160 items: carry-on 37, amir-clothes 16,
-- amir-diapers 7, amir-medical 10, ori 18, bar 26, hiking-gear 5,
-- toiletries 18, practical 5, documents 11, toys-books 7.

select category, count(*) as items, count(*) filter (where packed) as packed
from packing_items
group by category
order by category;
