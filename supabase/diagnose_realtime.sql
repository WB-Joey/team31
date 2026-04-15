-- Run in Supabase SQL Editor to verify Realtime is set up correctly.

-- 1. Which tables are published for Realtime?
--    Expect to see: participants, sessions, results
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime';

-- 2. If `participants` is missing, add it:
-- alter publication supabase_realtime add table public.participants;
-- alter publication supabase_realtime add table public.sessions;
-- alter publication supabase_realtime add table public.results;

-- 3. Check REPLICA IDENTITY — FULL is recommended so UPDATE/DELETE events
--    carry the old row. Missing this can cause silent drops.
select c.relname as table_name,
       case c.relreplident
         when 'd' then 'default'
         when 'n' then 'nothing'
         when 'f' then 'full'
         when 'i' then 'index'
       end as replica_identity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('participants', 'sessions', 'results');

-- 4. To upgrade replica identity if needed:
-- alter table public.participants replica identity full;
-- alter table public.sessions replica identity full;
-- alter table public.results replica identity full;
