-- Whist v0.1.6: explicit tournament notes and Kredsspil.
-- Run AFTER 05_scoring_history.sql, once, in Supabase SQL Editor.
-- Non-destructive. All old games remain linked to the same tournament_id.
-- A NULL tournament_id means Kredsspil; Kredsspil is deliberately NOT a
-- row in tournaments so imported games can be categorised unambiguously.

begin;

-- Exactly one tournament can be active at a time. Initially NONE is active.
-- Set it explicitly when a tournament starts (example below).
alter table public.tournaments
  add column if not exists is_active boolean not null default false;
create unique index if not exists only_one_active_tournament
  on public.tournaments (is_active) where is_active = true;

-- Historic notes are labels/IDs only; no guessed date boundaries.
insert into public.tournaments (name) values
  ('Slettestrand 2023'),
  ('Hals 2024'),
  ('Helsinki 2024'),
  ('Hals 2025'),
  ('Klitmøller 2026')
on conflict (name) do nothing;

-- Existing games with tournament_id IS NULL stay Kredsspil.
-- The existing get_game_history RPC is preserved for compatibility.
-- New RPC supports selecting any combination of notes and paginating
-- through arbitrarily large historic imports without relying on dates.
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
  if auth.uid() is null or not public.is_registrar() then
    raise exception 'Du skal indtaste den fælles adgangskode for at se historik';
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

revoke all on function public.get_game_history_for_notes(uuid[],boolean,boolean,integer,integer)
  from public, anon, authenticated;
grant execute on function public.get_game_history_for_notes(uuid[],boolean,boolean,integer,integer)
  to authenticated;

commit;

-- To BEGIN a tournament (run separately; replace name):
-- begin;
-- update public.tournaments set is_active = false where is_active;
-- update public.tournaments set is_active = true where name = 'Klitmøller 2026';
-- commit;
--
-- To END a tournament (new games will default to Kredsspil):
-- update public.tournaments set is_active = false where is_active;
--
-- Verify:
-- select name, is_active from public.tournaments order by name;
-- select coalesce(t.name, 'Kredsspil') as note, count(*) as games
-- from public.games g left join public.tournaments t on t.id = g.tournament_id
-- group by t.name order by t.name;
