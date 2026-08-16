-- Migration 001 — pending state, tool-block persistence, RLS
--
-- Run this in the Supabase SQL Editor (SQL Editor → New query → paste → Run).
--
-- Safe to run as many times as you like. Every statement checks whether its work
-- is already done, so re-running is a no-op rather than an error. This matters
-- because the SQL editor runs the whole script in one transaction: under the
-- naive version, one "already exists" error would roll back everything else too.
--
-- The last statement prints the three columns this migration adds, so you can
-- see it worked instead of trusting "Success. No rows returned".

-- 1. Pending state ----------------------------------------------------------
-- The design requires review before anything goes live: recommendations the
-- agent captures from chat land as 'pending' with Keep / Not this one, and the
-- auto-drafted journal entry lands as 'draft' with Edit / Keep.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recommendations' and column_name = 'status'
  ) then
    alter table recommendations
      add column status text not null default 'pending'
      check (status in ('pending', 'kept', 'rejected'));

    -- Rows that predate this migration were written under the old
    -- "immediately live" semantics, so treat them as already reviewed.
    update recommendations set status = 'kept';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'journal' and column_name = 'status'
  ) then
    alter table journal
      add column status text not null default 'draft'
      check (status in ('draft', 'kept'));

    update journal set status = 'kept';
  end if;
end $$;

-- 2. Tool-block persistence -------------------------------------------------
-- messages.content stays the plain-text rendering used for display. The full
-- Claude content-block array (text + tool_use + tool_result) goes here so a
-- conversation can be replayed to the API after a page reload.

alter table messages add column if not exists content_json jsonb;

-- 3. Row Level Security -----------------------------------------------------
-- The anon key ships in the client bundle, so without RLS every table is
-- world-readable and world-writable to anyone with the URL. These policies keep
-- today's behaviour identical while putting the switch in place: to lock the
-- app down later, replace `using (true)` with a real condition here rather than
-- changing application code.
--
-- `enable row level security` is idempotent; `create policy` is not, so each one
-- is dropped first.

do $$
declare t text;
begin
  foreach t in array array[
    'trip', 'flights', 'accommodation', 'activities',
    'recommendations', 'journal', 'learnings', 'messages'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon full access" on %I', t);
    execute format(
      'create policy "anon full access" on %I for all using (true) with check (true)', t
    );
  end loop;
end $$;

-- 4. Confirm it worked ------------------------------------------------------
-- Expect exactly three rows: journal.status, messages.content_json,
-- recommendations.status. Anything less means something above didn't apply.

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name in ('recommendations', 'journal') and column_name = 'status')
    or (table_name = 'messages' and column_name = 'content_json')
  )
order by table_name;
