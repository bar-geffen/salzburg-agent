-- Migration 001 — pending state, tool-block persistence, RLS
--
-- Run this in the Supabase SQL Editor if you already ran supabase-schema.sql.
-- If you are setting up a fresh database, skip this file — supabase-schema.sql
-- already includes everything here.
--
-- Safe to run once. Re-running will error on the duplicate columns; that's fine,
-- it means it already applied.

-- 1. Pending state ----------------------------------------------------------
-- The design requires review before anything goes live: recommendations the
-- agent captures from chat land as 'pending' with Keep / Not this one, and the
-- auto-drafted journal entry lands as 'draft' with Edit / Keep.

alter table recommendations
  add column status text not null default 'pending'
  check (status in ('pending', 'kept', 'rejected'));

alter table journal
  add column status text not null default 'draft'
  check (status in ('draft', 'kept'));

-- Any rows created before this migration were written under the old
-- "immediately live" semantics, so treat them as already reviewed.
update recommendations set status = 'kept';
update journal set status = 'kept';

-- 2. Tool-block persistence -------------------------------------------------
-- messages.content stays the plain-text rendering used for display. The full
-- Claude content-block array (text + tool_use + tool_result) goes here so a
-- conversation can be replayed to the API after a page reload.

alter table messages add column content_json jsonb;

-- 3. Row Level Security -----------------------------------------------------
-- The anon key ships in the client bundle, so without RLS every table is
-- world-readable and world-writable to anyone with the URL. These policies keep
-- today's behaviour identical while putting the switch in place: to lock the
-- app down later, replace `using (true)` with a real condition here rather than
-- changing application code.

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
