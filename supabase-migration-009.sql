-- Migration 009 — learnings get an updated_at, and one row per tag
--
-- Run this in the Supabase SQL Editor (SQL Editor -> New query -> paste -> Run).
--
-- ASCII-only, so `cat supabase-migration-009.sql | pbcopy` is safe.
--
-- Safe to run twice: the column add is guarded, the backfill only touches rows
-- with a null updated_at, and the de-duplication finds nothing on a second run.
--
-- This IS a schema change, so it is mirrored into supabase-schema.sql.
--
-- WHY. `learnings` was the one table the agent could write to and never change.
-- Every other record got an edit path -- update_activity, cancel_activity,
-- remove_trip_fact -- for a reason spelled out in CLAUDE.md: buildSystemPrompt()
-- rebuilds from these tables on every turn, so a stale row is not clutter, it is
-- the agent being wrong out loud on every future message. Learnings are the
-- worst case of that, because they are the rows that shape what it suggests.
-- "Prefers museums" and "not another museum", both undated, both true-looking,
-- and the agent reading them side by side has learned less than nothing.
--
-- So save_learning now replaces by tag instead of appending, and the tag is the
-- handle the agent addresses. That needs two things from the database: a column
-- that says when the current version was learned (created_at can't -- it is when
-- the first version was), and no pre-existing duplicate tags for the new rule to
-- trip over.
--
-- The app ships before this is pasted and keeps working without it: the
-- executor retries the write without updated_at if the column is missing, and
-- both the prompt builder and the Saved tab sort in JS rather than in the query,
-- because ordering on a column that isn't there yet fails the whole select --
-- which would read as "no learnings" and silently wipe the agent's memory.

-- 1. When the current version of this learning was learned -------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'learnings' and column_name = 'updated_at'
  ) then
    alter table learnings add column updated_at timestamptz default now();
  end if;
end $$;

update learnings set updated_at = created_at where updated_at is null;

-- 2. One row per tag ---------------------------------------------------------
-- Newest wins, which is the same rule the tool now applies: a preference
-- restated later is the correction, not a second opinion.
--
-- Tags are compared the way tools.js normalizes them -- case-folded, anything
-- non-alphanumeric collapsed to a hyphen -- so "High Chair" and "high-chair"
-- are recognised as the one fact they are.

with ranked as (
  select
    id,
    row_number() over (
      partition by trim(both '-' from lower(regexp_replace(tag, '[^a-zA-Z0-9]+', '-', 'g')))
      order by coalesce(updated_at, created_at) desc, created_at desc
    ) as n
  from learnings
)
delete from learnings
where id in (select id from ranked where n > 1);

-- Normalize what's left, so the tags the agent reads back are the tags it can
-- address. A tag it can't match is a learning it can't correct.
update learnings
set tag = trim(both '-' from lower(regexp_replace(tag, '[^a-zA-Z0-9]+', '-', 'g')))
where tag <> trim(both '-' from lower(regexp_replace(tag, '[^a-zA-Z0-9]+', '-', 'g')));

-- 3. Check it worked ---------------------------------------------------------
-- Expect: an updated_at column, no null values in it, and no repeated tag.

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'learnings' and column_name = 'updated_at';

select count(*) as learnings, count(updated_at) as with_updated_at from learnings;

select tag, count(*) from learnings group by tag having count(*) > 1;

select type, tag, note, updated_at from learnings order by updated_at desc;

notify pgrst, 'reload schema';
