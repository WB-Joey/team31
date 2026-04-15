-- Church Team Meeting Platform — Supabase Schema
-- Run this in the Supabase SQL editor (or via `supabase db push`)

-- Enable uuid generation
create extension if not exists "pgcrypto";

-- =========================================================
-- 1. contents: master list of team-meeting activities
-- =========================================================
create table if not exists public.contents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  min_people int not null,
  max_people int not null,
  requires_table boolean not null default false,
  tension_level text not null check (tension_level in ('low', 'medium', 'high')),
  play_type text not null check (play_type in ('individual', 'team', 'mixed')),
  duration_min int not null,
  needs_materials text not null check (needs_materials in ('none', 'paper_pen', 'other')),
  activity_type text not null check (activity_type in ('icebreaking', 'values', 'competition', 'cooperation')),
  leader_guide text not null,
  member_guide text not null,
  winner_formula text not null,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 2. sessions: one room per team meeting
-- =========================================================
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  content_id uuid not null references public.contents(id) on delete restrict,
  leader_id text not null,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'result')),
  filter_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sessions_room_code_idx on public.sessions(room_code);

-- =========================================================
-- 3. participants: members who joined a session
-- =========================================================
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  nickname text not null,
  is_leader boolean not null default false,
  memo text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists participants_session_id_idx on public.participants(session_id);

-- =========================================================
-- 4. results: final outcome per session
-- =========================================================
create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  winner_nickname text not null,
  winner_reason text not null,
  result_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists results_session_id_idx on public.results(session_id);

-- =========================================================
-- RLS: enable with permissive policies for MVP
-- Tighten later when auth is added in stage 5
-- =========================================================
alter table public.contents enable row level security;
alter table public.sessions enable row level security;
alter table public.participants enable row level security;
alter table public.results enable row level security;

drop policy if exists "contents_read_all" on public.contents;
create policy "contents_read_all" on public.contents for select using (true);

drop policy if exists "sessions_all_anon" on public.sessions;
create policy "sessions_all_anon" on public.sessions for all using (true) with check (true);

drop policy if exists "participants_all_anon" on public.participants;
create policy "participants_all_anon" on public.participants for all using (true) with check (true);

drop policy if exists "results_all_anon" on public.results;
create policy "results_all_anon" on public.results for all using (true) with check (true);

-- =========================================================
-- Realtime: enable for live participant + result updates
-- =========================================================
alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.results;
