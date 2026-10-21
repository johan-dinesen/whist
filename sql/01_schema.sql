-- Run once in Supabase > SQL Editor.
-- Full game registrations are written atomically by the register_game RPC.
-- No direct anonymous access and no direct browser writes to raw tables.

create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  is_guest boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists players_display_name_ci on public.players (lower(trim(display_name)));

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 120),
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tournament_valid_dates check (start_at is null or end_at is null or end_at > start_at)
);

-- The small approved user list. Add auth.users IDs after the first email login.
create table if not exists public.registrars (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  client_request_id uuid not null unique,
  tournament_id uuid references public.tournaments(id) on delete restrict,
  played_at timestamptz not null,
  created_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  call_type text not null check (call_type in (
    'almindelig','gode','halve','vip','sol','ren_sol','bordlaegger','ren_bordlaegger'
  )),
  tricks smallint check (tricks between 9 and 13),
  trump text check (trump in ('hearts','clubs','diamonds','spades','no_trump')),
  vip_depth smallint check (vip_depth between 1 and 3),
  score smallint check (score between -7 and 4)
);
create index if not exists games_played_at_idx on public.games (played_at);
create index if not exists games_tournament_played_at_idx on public.games (tournament_id, played_at);

create table if not exists public.game_participants (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  seat smallint not null check (seat between 1 and 4),
  is_caller boolean not null default false,
  is_partner boolean not null default false,
  solo_result text check (solo_result in ('Vundet (0 stik)','Vundet (1 stik)','Vundet','Tabt')),
  was_guest boolean not null default false,
  primary key (game_id, player_id),
  unique (game_id, seat)
);
create index if not exists game_participants_player_idx on public.game_participants (player_id);

-- Lock down data access: browser is allowed to READ only reference tables.
alter table public.players enable row level security;
alter table public.tournaments enable row level security;
alter table public.registrars enable row level security;
alter table public.games enable row level security;
alter table public.game_participants enable row level security;

revoke all on table public.players, public.tournaments, public.registrars,
  public.games, public.game_participants from anon, authenticated;
grant select on table public.players, public.tournaments to authenticated;

create or replace function public.is_registrar()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.registrars
    where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_registrar() from public, anon, authenticated;
grant execute on function public.is_registrar() to authenticated;

create policy "Approved registrars can list players" on public.players
  for select to authenticated using ((select public.is_registrar()));
create policy "Approved registrars can list tournaments" on public.tournaments
  for select to authenticated using ((select public.is_registrar()));

-- Explicit permissions are intentionally NOT granted for direct game writes.
-- This single RPC validates and writes both tables in one transaction.
create or replace function public.register_game(
  p_request_id uuid,
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
  v_uid uuid := auth.uid();
  v_id uuid;
  v_total int;
  v_unique int;
  v_seats int;
  v_min_seat int;
  v_max_seat int;
  v_active int;
  v_callers int;
  v_partners int;
  v_bad_solo int;
  v_solo boolean := p_call_type in ('sol','ren_sol','bordlaegger','ren_bordlaegger');
begin
  if v_uid is null or not public.is_registrar() then
    raise exception 'Brugeren er ikke godkendt til registrering';
  end if;
  if p_request_id is null then raise exception 'Manglende request-id'; end if;
  if p_played_at is null or p_played_at > now() + interval '10 minutes' then
    raise exception 'Ugyldigt spilletidspunkt';
  end if;
  if p_tournament_id is not null and not exists
    (select 1 from public.tournaments where id = p_tournament_id) then
    raise exception 'Ukendt turnering';
  end if;
  if p_call_type not in ('almindelig','gode','halve','vip','sol','ren_sol','bordlaegger','ren_bordlaegger')
    or p_call_type is null then raise exception 'Ukendt melding'; end if;
  if p_participants is null or jsonb_typeof(p_participants) <> 'array'
    or jsonb_array_length(p_participants) <> 4 then
    raise exception 'Et spil skal have præcis fire spillere';
  end if;

  select count(*),count(distinct (item->>'player_id')::uuid),
         count(distinct (item->>'seat')::smallint),
         min((item->>'seat')::smallint),max((item->>'seat')::smallint),
         count(*) filter (where coalesce((item->>'is_caller')::boolean,false)),
         count(*) filter (where coalesce((item->>'is_partner')::boolean,false))
    into v_total,v_unique,v_seats,v_min_seat,v_max_seat,v_callers,v_partners
    from jsonb_array_elements(p_participants) as item;
  if v_total<>4 or v_unique<>4 or v_seats<>4 or v_min_seat<>1 or v_max_seat<>4 then
    raise exception 'Spillere og pladser skal være fire forskellige';
  end if;
  select count(*) into v_active from public.players
   where id in (select (item->>'player_id')::uuid from jsonb_array_elements(p_participants) as item)
   and active;
  if v_active<>4 then raise exception 'Ukendt eller inaktiv spiller'; end if;

  if v_solo then
    if p_tricks is not null or p_trump is not null or p_vip_depth is not null or p_score is not null
      or v_callers<1 or v_partners<>0 then raise exception 'Ugyldig solomelding'; end if;
    select count(*) into v_bad_solo from jsonb_array_elements(p_participants) as item
    where (coalesce((item->>'is_caller')::boolean,false)
           and not coalesce((case when p_call_type in ('sol','bordlaegger')
                   then item->>'solo_result' in ('Vundet (0 stik)','Vundet (1 stik)','Tabt')
                   else item->>'solo_result' in ('Vundet','Tabt') end),false))
       or (not coalesce((item->>'is_caller')::boolean,false)
           and item->>'solo_result' is not null);
    if v_bad_solo>0 then raise exception 'Ugyldigt udfald for en melder'; end if;
  else
    if v_callers<>1 or v_partners<>1 or p_tricks is null or p_tricks not between 9 and 13
       or p_score is null or p_score not between -7 and 4 or p_trump is null
       or p_trump not in ('hearts','clubs','diamonds','spades','no_trump') then
      raise exception 'Ufuldstændig almindelig melding';
    end if;
    if (p_call_type='vip' and (p_vip_depth is null or p_vip_depth not between 1 and 3))
       or (p_call_type<>'vip' and p_vip_depth is not null) then
      raise exception 'Ugyldig Vip-dybde';
    end if;
    if p_call_type='gode' and p_trump not in ('clubs','no_trump') then
      raise exception 'Gode tillader kun klør eller uden trumf';
    end if;
    if exists (select 1 from jsonb_array_elements(p_participants) as item
               where item->>'solo_result' is not null) then
      raise exception 'Soloudfald ved almindelig melding';
    end if;
  end if;

  -- Idempotent mobile retries: a repeated request cannot create a second game.
  insert into public.games (
    client_request_id,tournament_id,played_at,recorded_by,call_type,
    tricks,trump,vip_depth,score
  ) values (
    p_request_id,p_tournament_id,p_played_at,v_uid,p_call_type,
    p_tricks,p_trump,p_vip_depth,p_score
  ) on conflict (client_request_id) do nothing returning id into v_id;

  if v_id is null then
    select id into v_id from public.games
     where client_request_id=p_request_id and recorded_by=v_uid;
    if v_id is null then raise exception 'Request-id blev allerede anvendt'; end if;
    return v_id;
  end if;

  insert into public.game_participants(game_id,player_id,seat,is_caller,is_partner,solo_result,was_guest)
  select v_id,(item->>'player_id')::uuid,(item->>'seat')::smallint,
    coalesce((item->>'is_caller')::boolean,false),
    coalesce((item->>'is_partner')::boolean,false),item->>'solo_result',pl.is_guest
  from jsonb_array_elements(p_participants) as item
  join public.players pl on pl.id=(item->>'player_id')::uuid;

  return v_id;
end;
$$;
revoke all on function public.register_game(uuid,uuid,timestamptz,text,smallint,smallint,text,smallint,jsonb)
  from public, anon, authenticated;
grant execute on function public.register_game(uuid,uuid,timestamptz,text,smallint,smallint,text,smallint,jsonb)
  to authenticated;
