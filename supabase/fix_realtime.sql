-- Ensures Realtime is correctly wired for all tables we subscribe to.
-- Safe to re-run: everything is idempotent.

-- 1. Make sure every table we subscribe to is in the Realtime publication.
-- (Wrapped in DO blocks so re-running doesn't error on "already in publication".)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table public.participants;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'results'
  ) then
    alter publication supabase_realtime add table public.results;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'reactions'
  ) then
    alter publication supabase_realtime add table public.reactions;
  end if;
end $$;

-- 2. Replica identity full — needed for UPDATE/DELETE payloads to include
-- the old row, and generally safer for Realtime diff tracking.
alter table public.participants replica identity full;
alter table public.sessions replica identity full;
alter table public.results replica identity full;
alter table public.reactions replica identity full;

-- 3. Sanity check — should return all four tables.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('participants', 'sessions', 'results', 'reactions')
order by tablename;
