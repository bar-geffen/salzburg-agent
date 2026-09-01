-- Migration 003 - Google auth: lock every table to two people
--
-- Run this in the Supabase SQL Editor (SQL Editor -> New query -> paste -> Run).
--
-- WHEN TO RUN IT: *after* the client that can sign in is deployed and you have
-- both signed in successfully. This migration is the moment the anon key stops
-- working. Run it while production still serves the old localStorage gate and
-- the app goes dark for both of you until the new bundle ships.
--
--   Order: dashboard setup -> deploy client -> both sign in -> then this file.
--
-- The reverse is safe: deploying the new client before this runs is fine,
-- because the policies are still permissive and a signed-in client passes
-- either way.
--
-- If you do lock yourself out, the SQL editor is not subject to RLS. Come back
-- here and replace the function body with `select true`, then fix and re-run.
--
-- This file is deliberately pure ASCII, unlike migration 002 - no em-dashes, no
-- arrows, no emoji. That sidesteps the pbcopy/MacRoman mangling that 002 has to
-- warn about, so any way you copy this is safe.
--
-- Safe to run as many times as you like: the function is `create or replace`
-- and every policy is dropped before it is created. This matters because the
-- SQL editor runs the whole script in one transaction, so a single "already
-- exists" error would roll back everything else too.

-- The allowlist --------------------------------------------------------------
-- One function, called by all nine policies, so an address changes in exactly
-- one place. The check is on the email claim in the JWT rather than auth.uid()
-- so it survives a user being deleted and signing in again with a new user id.
-- coalesce() keeps it false (not null) for an anonymous request, where there is
-- no JWT at all.
--
-- src/lib/auth.js carries the same two addresses so the app can show a "not on
-- this trip" screen. That copy is convenience; this one is the enforcement.
-- Edit both together.

create or replace function public.is_trip_member() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') in (
    'bar.geffen2@gmail.com',
    'oriorio@gmail.com'
  )
$$;

-- The policies ---------------------------------------------------------------
-- `using` governs reads and which rows an update may touch; `with check`
-- governs what a write may leave behind. Both are required - a policy with only
-- `using` leaves the table writable by anyone.

drop policy if exists "anon full access" on trip;
drop policy if exists "trip members" on trip;
create policy "trip members" on trip for all
  using (public.is_trip_member()) with check (public.is_trip_member());

drop policy if exists "anon full access" on flights;
drop policy if exists "trip members" on flights;
create policy "trip members" on flights for all
  using (public.is_trip_member()) with check (public.is_trip_member());

drop policy if exists "anon full access" on accommodation;
drop policy if exists "trip members" on accommodation;
create policy "trip members" on accommodation for all
  using (public.is_trip_member()) with check (public.is_trip_member());

drop policy if exists "anon full access" on activities;
drop policy if exists "trip members" on activities;
create policy "trip members" on activities for all
  using (public.is_trip_member()) with check (public.is_trip_member());

drop policy if exists "anon full access" on recommendations;
drop policy if exists "trip members" on recommendations;
create policy "trip members" on recommendations for all
  using (public.is_trip_member()) with check (public.is_trip_member());

drop policy if exists "anon full access" on journal;
drop policy if exists "trip members" on journal;
create policy "trip members" on journal for all
  using (public.is_trip_member()) with check (public.is_trip_member());

drop policy if exists "anon full access" on learnings;
drop policy if exists "trip members" on learnings;
create policy "trip members" on learnings for all
  using (public.is_trip_member()) with check (public.is_trip_member());

drop policy if exists "anon full access" on messages;
drop policy if exists "trip members" on messages;
create policy "trip members" on messages for all
  using (public.is_trip_member()) with check (public.is_trip_member());

drop policy if exists "anon full access" on packing_items;
drop policy if exists "trip members" on packing_items;
create policy "trip members" on packing_items for all
  using (public.is_trip_member()) with check (public.is_trip_member());

-- Belt and braces: RLS is already enabled on all nine by the schema, but a
-- policy on a table with RLS switched off is decoration.
alter table trip            enable row level security;
alter table flights         enable row level security;
alter table accommodation   enable row level security;
alter table activities      enable row level security;
alter table recommendations enable row level security;
alter table journal         enable row level security;
alter table learnings       enable row level security;
alter table messages        enable row level security;
alter table packing_items   enable row level security;

-- Verification ---------------------------------------------------------------
-- Read all three outputs before you close the tab.

-- 1. The allowlist, as the database now has it. Check both addresses by eye.
select pg_get_functiondef(to_regprocedure('public.is_trip_member()')::oid) as allowlist;

-- 2. Nine rows, every policyname "trip members". Anything still reading
--    "anon full access" did not get swapped.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename;

-- 3. Nine rows, rowsecurity true on every one.
select relname as tablename, relrowsecurity as rowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
  and relname in ('trip', 'flights', 'accommodation', 'activities',
                  'recommendations', 'journal', 'learnings', 'messages',
                  'packing_items')
order by relname;
