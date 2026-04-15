-- Stage 11 migration: idempotent safety net for reactions + encouragements
-- realtime. Run if emoji reactions or encouragement messages aren't
-- propagating between member and leader screens.

-- Ensure reactions table exists (stage5 may not have been applied).
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
create policy "reactions_all_anon" on public.reactions
  for all using (true) with check (true);

-- Ensure encouragements table exists (stage9 may not have been applied).
create table if not exists public.encouragements (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.sessions(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete cascade,
  message text not null,
  created_at timestamptz default now()
);

create index if not exists encouragements_session_id_idx
  on public.encouragements(session_id);

alter table public.encouragements enable row level security;
drop policy if exists "encouragements_all_anon" on public.encouragements;
create policy "encouragements_all_anon" on public.encouragements
  for all using (true) with check (true);

-- Realtime publication — safe to re-add; ignore duplicate errors on Supabase.
-- participants is included because the leader screen's live join list depends
-- on it, and it's a common source of "realtime not updating" reports.
do $$
begin
  begin
    alter publication supabase_realtime add table public.reactions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.encouragements;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.participants;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.sessions;
  exception when duplicate_object then null;
  end;
end $$;

alter table public.reactions replica identity full;
alter table public.encouragements replica identity full;
alter table public.participants replica identity full;
alter table public.sessions replica identity full;

-- Verify — run this and confirm every required table appears:
--   select tablename from pg_publication_tables
--     where pubname = 'supabase_realtime'
--     order by tablename;
-- Expected: encouragements, participants, reactions, results, sessions
