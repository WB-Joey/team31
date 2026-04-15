-- Stage 9 migration: leader encouragement messages from members.
-- Run once in Supabase SQL Editor.

create table if not exists public.encouragements (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.sessions(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete cascade,
  message text not null,
  created_at timestamp with time zone default now()
);

create index if not exists encouragements_session_id_idx
  on public.encouragements(session_id);

alter table public.encouragements enable row level security;

drop policy if exists "encouragements_all_anon" on public.encouragements;
create policy "encouragements_all_anon" on public.encouragements
  for all using (true) with check (true);

alter publication supabase_realtime add table public.encouragements;
alter table public.encouragements replica identity full;
