-- Whist settlement and history. Apply AFTER 01_schema.sql and 04_shared_password.sql.
-- This script only creates calculated views and one read-only RPC; no existing
-- games or participants are modified. Safe to re-run.
--
-- Confirmed scoring: 9 Gode = 0.40; 10 Gode = 0.80; 11 Gode = 1.60.
-- For Halve, 9 Halve = 0.50; 10 Halve = 1.00; 11 Halve = 2.00.
-- This calculation is unchanged from v0.1.5.

begin;

-- One row per player per game. This view uses invoker security, has no
-- client grants, and is read through get_game_history() after authorization.
create or replace view public.game_player_payouts
with (security_invoker = true) as
with valued as (
  select
    g.id,
    case
      when g.call_type in ('almindelig','gode','halve','vip') then
        (case g.call_type
          when 'almindelig' then 0.30::numeric
          when 'gode'       then 0.40::numeric
          when 'halve'      then 0.50::numeric
          when 'vip'        then 0.60::numeric
        end)
        * power(2::numeric, g.tricks - 9)
        * (case
            when g.score >= 0 then 1::numeric + g.score::numeric / 2
            else -(1::numeric + (abs(g.score)::numeric - 1) / 2)
          end)
        * (case when g.call_type = 'vip' then g.vip_depth else 1 end)
      when g.call_type = 'sol'             then 0.30::numeric
      when g.call_type = 'ren_sol'         then 0.60::numeric
      when g.call_type = 'bordlaegger'     then 1.20::numeric
      when g.call_type = 'ren_bordlaegger' then 2.40::numeric
    end as value,
    g.call_type in ('sol','ren_sol','bordlaegger','ren_bordlaegger') as is_solo
  from public.games g
)
select
  gp.game_id,
  gp.player_id,
  p.display_name as player_name,
  gp.seat,
  gp.is_caller,
  gp.is_partner,
  gp.solo_result,
  gp.was_guest as is_guest,
  round(
    case
      when v.is_solo then (
        -- Each caller settles independently against the other three.
        -- A winner receives V, with each opponent paying V/3;
        -- a loser pays V, with each opponent receiving V/3.
        select coalesce(sum(case
          when caller.player_id = gp.player_id then
            case when caller.solo_result like 'Vundet%' then v.value else -v.value end
          else
            case when caller.solo_result like 'Vundet%' then -v.value / 3 else v.value / 3 end
        end), 0::numeric)
        from public.game_participants caller
        where caller.game_id = gp.game_id and caller.is_caller
      )
      else
        -- Normally two partners each gain V and defenders each lose V.
        -- Legacy records with caller=partner have just one team member;
        -- allocating 3V to them keeps the four-person total at zero.
        case when gp.is_caller or gp.is_partner then
          v.value * (
            (4 - (select count(*) from public.game_participants team
                  where team.game_id = gp.game_id
                    and (team.is_caller or team.is_partner)))::numeric
            / nullif((select count(*) from public.game_participants team
                      where team.game_id = gp.game_id
                        and (team.is_caller or team.is_partner)), 0)
          )
        else -v.value end
    end,
    2
  )::numeric(12,2) as payout
from public.game_participants gp
join public.players p on p.id = gp.player_id
join valued v on v.id = gp.game_id;

create or replace view public.game_history
with (security_invoker = true) as
select
  g.id,
  g.played_at,
  g.created_at,
  g.tournament_id,
  g.call_type,
  g.tricks,
  g.trump,
  g.vip_depth,
  g.score,
  string_agg(p.player_name, ', ' order by p.seat)
    filter (where p.is_caller) as callers,
  string_agg(p.player_name, ', ' order by p.seat)
    filter (where p.is_partner) as partners,
  bool_or(p.is_guest) as has_guests,
  sum(p.payout)::numeric(12,2) as payout_sum,
  jsonb_agg(
    jsonb_build_object(
      'player_id', p.player_id,
      'name', p.player_name,
      'seat', p.seat,
      'is_caller', p.is_caller,
      'is_partner', p.is_partner,
      'solo_result', p.solo_result,
      'is_guest', p.is_guest,
      'payout', p.payout
    ) order by p.seat
  ) as participants
from public.games g
join public.game_player_payouts p on p.game_id = g.id
group by g.id;

-- Explicitly prevent use as an unauthenticated data-access shortcut.
revoke all on public.game_player_payouts, public.game_history
  from public, anon, authenticated;

-- Only a browser holding current shared-password authorization may read
-- history via the API. NULL date bounds allow all games. Date end exclusive.
-- Include-guests = false excludes games involving a guest entirely.
-- Tournament id is optional for future statistics/tournament filtering.
create or replace function public.get_game_history(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_include_guests boolean default true,
  p_tournament_id uuid default null,
  p_max_games integer default 500
)
returns setof public.game_history
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_registrar() then
    raise exception 'Du skal indtaste den fælles adgangskode for at se historik';
  end if;
  return query
    select h.*
    from public.game_history h
    where (p_from is null or h.played_at >= p_from)
      and (p_to is null or h.played_at < p_to)
      and (coalesce(p_include_guests, true) or not h.has_guests)
      and (p_tournament_id is null or h.tournament_id = p_tournament_id)
    order by h.played_at desc, h.id desc
    limit least(greatest(coalesce(p_max_games, 500), 1), 2000);
end;
$$;
revoke all on function public.get_game_history(timestamptz,timestamptz,boolean,uuid,integer)
  from public, anon, authenticated;
grant execute on function public.get_game_history(timestamptz,timestamptz,boolean,uuid,integer)
  to authenticated;

commit;

-- Useful SQL Editor diagnostics, after applying:
-- select id, call_type, played_at, payout_sum, participants
-- from public.game_history order by played_at desc limit 10;
-- select game_id, sum(payout) from public.game_player_payouts
-- group by game_id having sum(payout) <> 0;
