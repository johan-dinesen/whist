-- Whist database health check for scheduled GitHub Actions requests.
-- Apply once in the Supabase SQL Editor. Safe to run again.
-- No game data is read or modified, and no anonymous Auth users are created.

begin;

create or replace function public.whist_health_check()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.whist_health_check() from public, anon, authenticated;
grant execute on function public.whist_health_check() to anon;

-- Ask PostgREST to refresh its function metadata.
notify pgrst, 'reload schema';

commit;
