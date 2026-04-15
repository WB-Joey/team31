-- Stage 4 migration: per-participant emoji reaction on the result screen.
-- Run once in Supabase SQL Editor.

alter table public.participants
  add column if not exists reaction text
  check (reaction is null or reaction in ('thumbs_up', 'laugh', 'fire', 'sad'));
