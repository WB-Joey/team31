-- Stage 8 migration: ladder-game picker for 나눔 time.
-- Run once in Supabase SQL Editor.

alter table public.sessions
  add column if not exists sharing_ladder jsonb;

-- sharing_order retains its shape (participant ID array) but is now written
-- incrementally — starts null, grows as the leader picks speakers.

-- replica identity is already `full` from stage5; no change needed.
