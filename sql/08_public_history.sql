-- Whist v0.1.9: allow anyone visiting Historik to read the game history.
-- Run after 05_scoring_history.sql and 06_tournament_notes.sql.
-- Anonymous Supabase Auth sessions have the authenticated DB role.
-- Registering games STILL requires the 30-day registration-password grant.
-- Administration STILL requires its separate 12-hour admin grant.
-- No games, tournament assignments, passwords or other data are changed.

begin;

-- Same signature expected by assets/js/history.js.
create or replace function public.get_game_history_for_notes(
  p_tournament_ids uuid[] default null,
  p_include_kredsspil boolean default true,
  p_include_guests boolean default false,
  p_max_games integer default 250,
  p_offset integer default 0
)
returns setof public.game_history
language plpgsql stable security definer set search_path = '' as $$
begin
  -- A free, automatically created anonymous session is enough for reading.
  -- Do not call is_registrar() here: it checks the WRITE password grant.
  if auth.uid() is null then
    raise exception 'Kunne ikke oprette en læsesession';
  end if;
  if p_tournament_ids is not null and exists (
    select 1 from unnest(p_tournament_ids) as requested(id)
    where not exists (select 1 from public.tournaments t where t.id = requested.id)
  ) then
    raise exception 'Ukendt spilsamling';
  end if;
  return query
    select h.*
    from public.game_history h
    where (
      p_tournament_ids is null
      or h.tournament_id = any(p_tournament_ids)
      or (h.tournament_id is null and coalesce(p_include_kredsspil,false))
    )
      and (coalesce(p_include_guests,false) or not h.has_guests)
    order by h.played_at desc, h.id desc
    limit least(greatest(coalesce(p_max_games,250),1),1000)
    offset greatest(coalesce(p_offset,0),0);
end;
$$;

-- No direct permission on the underlying views or game tables is added.
revoke all on function public.get_game_history_for_notes(uuid[],boolean,boolean,integer,integer)
  from public, anon, authenticated;
grant execute on function public.get_game_history_for_notes(uuid[],boolean,boolean,integer,integer)
  to authenticated;

commit;

-- Tell PostgREST to refresh function metadata (e.g. after a previous repair).
notify pgrst, 'reload schema';

-- Verify that the RPC exists. Calling from the SQL editor as postgres is
-- not a substitute for testing it from an anonymous browser session.
select to_regprocedure('public.get_game_history_for_notes(uuid[],boolean,boolean,integer,integer)')
  as history_function;
