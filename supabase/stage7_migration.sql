-- Stage 7: per-participant locked bids (입찰 확정 시스템)
-- Run once in Supabase SQL Editor.
--
-- Each participant carries an array of bid entries — one per value they've
-- locked a bid on. The leader client transitions statuses on award/skip; the
-- member client treats any row with status='bidding' or 'won' as money
-- currently committed against the budget.
--
--   [{ value_id, amount, status, confirmed_at }, ...]
--   status: 'bidding' | 'won' | 'lost'

alter table public.participants
  add column if not exists bids jsonb not null default '[]'::jsonb;

-- participants is already in supabase_realtime (stage 5). Ensure replica
-- identity is full so UPDATE payloads carry the new bids column.
alter table public.participants replica identity full;
