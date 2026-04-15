-- Stage 5 migration
-- Run once in Supabase SQL Editor.

-- ========================================
-- 1. reactions table (replaces participants.reaction)
-- ========================================
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  emoji text not null check (emoji in ('thumbs_up', 'laugh', 'fire', 'sad')),
  created_at timestamptz not null default now(),
  unique (session_id, participant_id, emoji)
);

create index if not exists reactions_session_id_idx on public.reactions(session_id);

alter table public.reactions enable row level security;

drop policy if exists "reactions_all_anon" on public.reactions;
create policy "reactions_all_anon" on public.reactions for all using (true) with check (true);

alter publication supabase_realtime add table public.reactions;
alter table public.reactions replica identity full;

-- ========================================
-- 2. Sharing-order columns on sessions
-- ========================================
alter table public.sessions
  add column if not exists sharing_order jsonb,
  add column if not exists sharing_index int not null default 0;

-- Full replica identity so realtime UPDATE payloads include all columns
alter table public.sessions replica identity full;
