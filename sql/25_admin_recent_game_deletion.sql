-- Administration: show and delete the 10 most recently REGISTERED games.
-- Run once in Supabase SQL Editor AFTER 05_scoring_history.sql and
-- 07_administration.sql (and after existing deployed migrations).
-- This migration only adds protected functions and a private recovery log;
-- it does not delete or otherwise modify any existing games.
begin;

-- Keep a private snapshot so an accidentally deleted registration can be
-- recovered manually by a database owner. This is not exposed to the browser.
create table if not exists private.admin_deleted_games (
  audit_id bigint generated always as identity primary key,
  game_id uuid not null,
  deleted_at timestamptz not null default clock_timestamp(),
  deleted_by uuid not null,
  game_row jsonb not null,
  participants jsonb not null
);
revoke all on table private.admin_deleted_games from public, anon, authenticated;

-- Require the SAME strong 12-hour authorization as tournament administration.
-- Sorting by created_at, rather than played_at, includes recently entered games
-- even if their playing timestamp was typed incorrectly.
create or replace function public.admin_recent_games()
returns setof public.game_history
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.admin_access_until() is null then
    raise exception 'Administrationsadgang mangler eller er udløbet';
  end if;

  return query
    select h.*
    from (
      select g.id, g.created_at
      from public.games g
      order by g.created_at desc, g.id desc
      limit 10
    ) recent
    join public.game_history h on h.id = recent.id
    order by recent.created_at desc, recent.id desc;
end;
$$;
revoke all on function public.admin_recent_games() from public, anon, authenticated;
grant execute on function public.admin_recent_games() to authenticated;

-- Delete ONE game, only while it is still among the last 10 registrations.
-- Its participants cascade automatically via the original foreign key.
-- All payouts/statistics are computed from current games, so they recalculate
-- without any manual adjustment. A snapshot is saved in the same transaction.
create or replace function public.admin_delete_recent_game(p_game_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_game jsonb;
  v_participants jsonb;
  v_deleted uuid;
begin
  if public.admin_access_until() is null then
    raise exception 'Administrationsadgang mangler eller er udløbet';
  end if;
  if p_game_id is null then
    raise exception 'Spil-id mangler';
  end if;

  -- Lock the target game while checking eligibility and taking its snapshot.
  select to_jsonb(g) into v_game
  from public.games g
  where g.id = p_game_id
  for update;
  if v_game is null then
    raise exception 'Spillet findes ikke længere. Opdater listen.';
  end if;
  if not exists (
    select 1 from (
      select g.id from public.games g
      order by g.created_at desc, g.id desc
      limit 10
    ) recent where recent.id = p_game_id
  ) then
    raise exception 'Spillet er ikke længere blandt de 10 seneste. Opdater listen.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.seat), '[]'::jsonb)
  into v_participants
  from public.game_participants p
  where p.game_id = p_game_id;

  insert into private.admin_deleted_games
    (game_id, deleted_by, game_row, participants)
  values (p_game_id, auth.uid(), v_game, v_participants);

  delete from public.games g
  where g.id = p_game_id
  returning g.id into v_deleted;

  if v_deleted is null then
    raise exception 'Spillet kunne ikke slettes';
  end if;
  return v_deleted;
end;
$$;
revoke all on function public.admin_delete_recent_game(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_recent_game(uuid) to authenticated;

-- Never grant direct DELETE rights to authenticated browser sessions.
revoke delete on table public.games, public.game_participants from anon, authenticated;
commit;

notify pgrst, 'reload schema';
