-- Migration 004 - Chat sessions: split one endless thread into named ones
--
-- Run this in the Supabase SQL Editor (SQL Editor -> New query -> paste -> Run).
--
-- WHEN TO RUN IT: *after* the client that knows about sessions is deployed. This
-- is the reverse of 003's ordering, and for a different reason: the last
-- statement makes messages.session_id NOT NULL, and the old client inserts
-- messages without one. Run this while the old bundle is still live and every
-- send fails until the new one ships.
--
--   Order: deploy client -> then this file.
--
-- The reverse is safe: the new client tolerates this migration not having run
-- yet. It falls back to loading every message as one thread, exactly as today,
-- and hides the session switcher. So deploying early costs nothing.
--
-- If you want the table now but not the constraint, comment out the very last
-- statement. It is deliberately last so it can be split off.
--
-- Pure ASCII, like 003 - no em-dashes, no arrows, no emoji - so any way you copy
-- it is safe.
--
-- Safe to run as many times as you like: every statement is `if not exists`, the
-- policy is dropped before it is created, and the backfill no-ops once there is
-- nothing left to backfill. This matters because the SQL editor runs the whole
-- script in one transaction, so a single "already exists" error would roll back
-- everything else too.

-- The table ------------------------------------------------------------------
-- Sessions are shared, not per-user: shared chat history is a product
-- requirement, and sessions organise that one history rather than partitioning
-- it. `started_by` is a label, not an owner - nothing reads it for access.

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: a session exists before it has a name. The client writes a
  -- 40-character fallback on the first message and upgrades it to a generated
  -- title a moment later.
  title text,
  started_by text,
  created_at timestamptz default now(),
  -- The list sorts on this descending. There is no trigger - the client bumps
  -- it after each insert, the same way updated_at is handled elsewhere.
  last_message_at timestamptz default now()
);

alter table messages add column if not exists session_id uuid
  references chat_sessions(id) on delete cascade;

create index if not exists messages_session_created_idx
  on messages (session_id, created_at);

-- The backfill ---------------------------------------------------------------
-- Not optional. The UI filters on session_id, so without this every message
-- ever sent disappears behind the filter and it looks exactly like data loss.
--
-- Wrapped in a block rather than the obvious
--   `with s as (insert into chat_sessions ... returning id) update messages ...`
-- because that version inserts a fresh, empty "Before sessions" row every time
-- the file is run, and this file is meant to be re-runnable.

do $$
declare legacy uuid;
begin
  if exists (select 1 from messages where session_id is null) then

    select id into legacy from chat_sessions where title = 'Before sessions' limit 1;

    if legacy is null then
      insert into chat_sessions (title) values ('Before sessions') returning id into legacy;
    end if;

    update messages set session_id = legacy where session_id is null;

    -- So the old thread sorts by when it was last used, not by when this
    -- migration happened to run.
    update chat_sessions
       set last_message_at = coalesce(
             (select max(created_at) from messages where session_id = legacy),
             now())
     where id = legacy;

  end if;
end $$;

-- Row Level Security ---------------------------------------------------------
-- Tenth table, same single policy as the other nine. `using` governs reads and
-- which rows an update may touch; `with check` governs what a write may leave
-- behind. Both are required - a policy with only `using` leaves the table
-- writable by anyone.

alter table chat_sessions enable row level security;

drop policy if exists "trip members" on chat_sessions;
create policy "trip members" on chat_sessions for all
  using (public.is_trip_member()) with check (public.is_trip_member());

-- The constraint -------------------------------------------------------------
-- Last, and only valid once the backfill above has run. See the ordering note
-- at the top: this is the statement that breaks a client which doesn't know
-- about sessions yet.

alter table messages alter column session_id set not null;

-- Verification ---------------------------------------------------------------
-- Read all four outputs before you close the tab.

-- 1. Every session with its message count. "Before sessions" must be here with
--    a non-zero count if you had any history at all. A zero here means the
--    backfill did not do what it was supposed to.
select s.title,
       s.last_message_at,
       count(m.id) as messages
from chat_sessions s
left join messages m on m.session_id = s.id
group by s.id, s.title, s.last_message_at
order by s.last_message_at desc;

-- 2. Zero rows. Anything here is a message the UI will never show.
select count(*) as orphaned_messages from messages where session_id is null;

-- 3. Ten rows, every policyname "trip members".
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename;

-- 4. One row, rowsecurity true.
select relname as tablename, relrowsecurity as rowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
  and relname = 'chat_sessions';
