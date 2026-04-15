-- Stage 6: live auction flow
-- Run once in Supabase SQL Editor.
--
-- Stores the editable value list AND the running state
-- (revealed ids, current item, awarded map, ended flag) in one jsonb column
-- on sessions. One column keeps realtime updates atomic.

alter table public.sessions
  add column if not exists auction_state jsonb not null default '{}'::jsonb;

-- Already published for realtime; ensure full replica identity so UPDATE
-- payloads include the whole row every time.
alter table public.sessions replica identity full;
