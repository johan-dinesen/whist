-- Admin corrections for the ten most recently registered games.
-- Apply after 25_admin_recent_game_deletion.sql and 27_gross_point_sources.sql.
-- Existing games are not changed. Corrections are audited and only accepted
-- with the same strong admin session used for tournament management.
begin;

-- Regular registration still shows -7 to +4; full-admin corrections can
-- record exceptional results such as -9 (down nine tricks).
alter table public.games drop constraint if exists games_score_check;
alter table public.games add constraint games_score_check
  check (score between -13 and 4);

create table if not exists private.admin_edited_games (
  audit_id bigint generated always as identity primary key,
  game_id uuid not null,
  edited_at timestamptz not null default clock_timestamp(),
  edited_by uuid not null,
  previous_game jsonb not null,
  previous_participants jsonb not null
);
revoke all on table private.admin_edited_games from public, anon, authenticated;

create or replace function public.admin_edit_recent_game(
  p_game_id uuid,
  p_tournament_id uuid,
  p_played_at timestamptz,
  p_call_type text,
  p_tricks smallint,
  p_vip_depth smallint,
  p_trump text,
  p_score smallint,
  p_participants jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old_game jsonb;
  v_old_participants jsonb;
  v_count int;
  v_distinct_players int;
  v_distinct_seats int;
  v_min_seat int;
  v_max_seat int;
  v_callers int;
  v_partners int;
  v_solo boolean := p_call_type in ('sol','ren_sol','bordlaegger','ren_bordlaegger');
begin
  if public.admin_access_until() is null then
    raise exception 'Administrationsadgang mangler eller er udløbet';
  end if;
  if p_game_id is null then raise exception 'Spil-id mangler'; end if;
  select to_jsonb(g) into v_old_game
  from public.games g where g.id = p_game_id for update;
  if v_old_game is null then raise exception 'Spillet findes ikke længere. Opdater listen.'; end if;
  if not exists (
    select 1 from (
      select id from public.games order by created_at desc, id desc limit 10
    ) recent where recent.id = p_game_id
  ) then
    raise exception 'Spillet er ikke længere blandt de 10 seneste. Opdater listen.';
  end if;
  if p_played_at is null or p_played_at > now() + interval '10 minutes' then
    raise exception 'Ugyldigt spilletidspunkt';
  end if;
  if p_tournament_id is not null and not exists (
    select 1 from public.tournaments where id = p_tournament_id
  ) then raise exception 'Ukendt spilsamling'; end if;
  if p_call_type is null or p_call_type not in
    ('almindelig','gode','halve','vip','sol','ren_sol','bordlaegger','ren_bordlaegger') then
    raise exception 'Ukendt melding';
  end if;
  if p_participants is null or jsonb_typeof(p_participants) <> 'array'
     or jsonb_array_length(p_participants) <> 4 then
    raise exception 'Vælg præcis fire spillere';
  end if;
  -- Guard malformed JSON input before casting UUID and seat strings.
  if exists (select 1 from jsonb_array_elements(p_participants) x
    where jsonb_typeof(x) <> 'object'
      or x->>'player_id' is null
      or (x->>'player_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or x->>'seat' not in ('1','2','3','4')
      or x->>'is_caller' not in ('true','false')
      or x->>'is_partner' not in ('true','false')) then
    raise exception 'Ugyldige spillere eller pladser';
  end if;
  select count(*),count(distinct (x->>'player_id')::uuid),
         count(distinct (x->>'seat')::smallint),
         min((x->>'seat')::smallint),max((x->>'seat')::smallint),
         count(*) filter (where (x->>'is_caller')::boolean),
         count(*) filter (where (x->>'is_partner')::boolean)
  into v_count,v_distinct_players,v_distinct_seats,v_min_seat,v_max_seat,v_callers,v_partners
  from jsonb_array_elements(p_participants) x;
  if v_count <> 4 or v_distinct_players <> 4 or v_distinct_seats <> 4
     or v_min_seat <> 1 or v_max_seat <> 4 then
    raise exception 'Vælg fire forskellige spillere';
  end if;
  -- Former guests can remain on edited historical games.
  if (select count(*) from public.players pl where pl.id in
      (select (x->>'player_id')::uuid from jsonb_array_elements(p_participants) x)) <> 4 then
    raise exception 'Ukendt spiller';
  end if;
  if v_solo then
    if p_tricks is not null or p_vip_depth is not null or p_trump is not null
       or p_score is not null or v_callers < 1 or v_partners <> 0 then
      raise exception 'Ugyldig solomelding';
    end if;
    if exists (select 1 from jsonb_array_elements(p_participants) x
      where (x->>'is_caller')::boolean is distinct from (x->>'solo_result' is not null)
        or ((x->>'is_caller')::boolean and not
          (case when p_call_type in ('sol','bordlaegger')
            then x->>'solo_result' in ('Vundet (0 stik)','Vundet (1 stik)','Tabt')
            else x->>'solo_result' in ('Vundet','Tabt') end))) then
      raise exception 'Angiv gyldigt udfald for hver solomelder';
    end if;
  else
    if v_callers <> 1 or v_partners <> 1
       or exists (select 1 from jsonb_array_elements(p_participants) x
         where (x->>'is_caller')::boolean and (x->>'is_partner')::boolean)
       or p_tricks is null or p_tricks not between 9 and 13
       or p_score is null or p_score not between -p_tricks and (13 - p_tricks)
       or p_trump is null or p_trump not in
         ('hearts','clubs','diamonds','spades','no_trump') then
      raise exception 'Ugyldige oplysninger eller resultat';
    end if;
    if (p_call_type = 'vip' and (p_vip_depth is null or p_vip_depth not between 1 and 3))
       or (p_call_type <> 'vip' and p_vip_depth is not null) then
      raise exception 'Ugyldig Vip-dybde';
    end if;
    if p_call_type = 'gode' and p_trump not in ('clubs','no_trump') then
      raise exception 'Gode tillader kun klør eller uden trumf';
    end if;
    if exists (select 1 from jsonb_array_elements(p_participants) x
               where x->>'solo_result' is not null) then
      raise exception 'Soloudfald ved almindelig melding';
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(gp) order by gp.seat), '[]'::jsonb)
  into v_old_participants from public.game_participants gp
  where gp.game_id = p_game_id;
  insert into private.admin_edited_games
    (game_id,edited_by,previous_game,previous_participants)
  values (p_game_id,auth.uid(),v_old_game,v_old_participants);

  update public.games set
    tournament_id = p_tournament_id, played_at = p_played_at,
    call_type = p_call_type, tricks = p_tricks, trump = p_trump,
    vip_depth = p_vip_depth, score = p_score
  where id = p_game_id;
  delete from public.game_participants where game_id = p_game_id;
  insert into public.game_participants
    (game_id,player_id,seat,is_caller,is_partner,solo_result,was_guest)
  select p_game_id, (x->>'player_id')::uuid, (x->>'seat')::smallint,
    (x->>'is_caller')::boolean, (x->>'is_partner')::boolean,
    x->>'solo_result', pl.is_guest
  from jsonb_array_elements(p_participants) x
  join public.players pl on pl.id = (x->>'player_id')::uuid;
  return p_game_id;
end;
$$;
revoke all on function public.admin_edit_recent_game(uuid,uuid,timestamptz,text,smallint,smallint,text,smallint,jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_edit_recent_game(uuid,uuid,timestamptz,text,smallint,smallint,text,smallint,jsonb)
  to authenticated;
revoke update on public.games, public.game_participants from anon, authenticated;
commit;
notify pgrst, 'reload schema';
