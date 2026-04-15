-- Stage 10 migration: persist each participant's remaining budget for live
-- visibility on the leader screen.
-- Run once in Supabase SQL Editor.

alter table public.participants
  add column if not exists remaining_budget bigint default 100000000;

-- Backfill for any existing rows so leader view immediately renders.
update public.participants
  set remaining_budget = 100000000
  where remaining_budget is null;
