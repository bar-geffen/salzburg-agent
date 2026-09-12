-- Migration 007 — activities get a status, so a plan can be recorded before it's booked
--
-- Run this in the Supabase SQL Editor (SQL Editor -> New query -> paste -> Run).
--
-- ASCII-only, so `cat supabase-migration-007.sql | pbcopy` is safe.
--
-- Safe to run twice: the column add is guarded, and the backfill only touches
-- rows with a null status, of which there are none after the first run.
--
-- This IS a schema change, so it is mirrored into supabase-schema.sql.
--
-- WHY, GIVEN 001 DELIBERATELY LEFT THIS TABLE ALONE. The status columns on
-- recommendations and journal are review gates -- a row the agent wrote that
-- doesn't count until a human taps Keep. This one is not that. Every activity
-- row still appears the moment it is written; 'planned' vs 'booked' is what the
-- travellers have committed to, not whether they have seen it. Which is why
-- 'planned' rows show on the agenda (tagged) instead of hiding in a review
-- queue, and why the agent may write either without asking.
--
-- 'cancelled' is here rather than a delete so that a dropped plan stays legible:
-- the agenda hides it, the agent still sees it listed as cancelled, and it does
-- not quietly re-propose the thing they just called off.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'status'
  ) then
    -- Default 'booked': every row written before this migration was written
    -- under a tool that only accepted things that were already fixed.
    alter table activities
      add column status text not null default 'booked'
      check (status in ('planned', 'booked', 'cancelled'));
  end if;
end $$;

-- Check it worked ------------------------------------------------------------
-- Ask information_schema, not the table. A `group by status` over activities
-- returns nothing at all when there are no activities yet, which is exactly the
-- "Success. No rows returned" this check exists to distinguish from a failure.
--
-- Expect one row: status | text | 'booked'::text | NO.

select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'activities' and column_name = 'status';

-- And the counts, which are legitimately empty on a trip with nothing pinned yet.
select status, count(*) as rows from activities group by status order by status;

-- PostgREST caches the schema. It normally picks a new column up on its own, but
-- if the app comes back with PGRST204 ("Could not find the 'status' column ... in
-- the schema cache") when the agent writes an activity, this is the nudge:
notify pgrst, 'reload schema';
