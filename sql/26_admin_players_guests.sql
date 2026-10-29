-- Full administration: rename regular players/guests, add guests, archive
-- guests, and restore archived guests. Apply after 07_administration.sql.
-- No existing game is deleted. Archived guests remain in past games.
-- A rename updates the existing player row, so past games show the new name.
begin;

-- Keep direct browser writes forbidden. Every mutation uses an RPC that
-- verifies the strong admin grant against the server's 12-hour session.
revoke insert, update, delete on public.players from anon, authenticated;

-- An admin can inspect inactive guests in addition to active players.
-- The normal public SELECT policy still exposes only active players.
create or replace function public.admin_list_players()
returns table (id uuid, display_name text, is_guest boolean, active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.admin_access_until() is null then
    raise exception 'Administrationsadgang mangler eller er udløbet';
  end if;
  return query
    select p.id, p.display_name, p.is_guest, p.active
    from public.players p
    order by p.is_guest, lower(p.display_name), p.id;
end;
$$;
revoke all on function public.admin_list_players() from public, anon, authenticated;
grant execute on function public.admin_list_players() to authenticated;

-- Renaming keeps the UUID and all historical game participants unchanged.
-- Existing statistics and historical displays use the current display_name.
create or replace function public.admin_rename_player(p_player_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(p_name);
  v_id uuid;
begin
  if public.admin_access_until() is null then
    raise exception 'Administrationsadgang mangler eller er udløbet';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 100
      or v_name ~ '[[:cntrl:]]' then
    raise exception 'Navnet skal være mellem 1 og 100 tegn uden linjeskift';
  end if;
  update public.players p
     set display_name = v_name
   where p.id = p_player_id and p.active
   returning p.id into v_id;
  if v_id is null then
    raise exception 'Spilleren findes ikke eller er ikke aktiv';
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'En spiller eller gæst med dette navn findes allerede';
end;
$$;
revoke all on function public.admin_rename_player(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_rename_player(uuid, text) to authenticated;

-- A new guest may be selected on Registrering immediately after insertion.
create or replace function public.admin_add_guest(p_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(p_name);
  v_id uuid;
begin
  if public.admin_access_until() is null then
    raise exception 'Administrationsadgang mangler eller er udløbet';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 100
      or v_name ~ '[[:cntrl:]]' then
    raise exception 'Navnet skal være mellem 1 og 100 tegn uden linjeskift';
  end if;
  insert into public.players(display_name, is_guest, active)
  values (v_name, true, true)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Navnet findes allerede. Tidligere gæster kan gendannes nedenfor.';
end;
$$;
revoke all on function public.admin_add_guest(text) from public, anon, authenticated;
grant execute on function public.admin_add_guest(text) to authenticated;

-- Never hard-delete a guest. Past games reference their UUID with a
-- RESTRICT foreign key; soft deletion preserves history and payouts.
create or replace function public.admin_archive_guest(p_player_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if public.admin_access_until() is null then
    raise exception 'Administrationsadgang mangler eller er udløbet';
  end if;
  update public.players p
     set active = false
   where p.id = p_player_id and p.is_guest and p.active
   returning p.id into v_id;
  if v_id is null then
    raise exception 'Gæsten findes ikke, er allerede fjernet eller er en fast spiller';
  end if;
  return v_id;
end;
$$;
revoke all on function public.admin_archive_guest(uuid) from public, anon, authenticated;
grant execute on function public.admin_archive_guest(uuid) to authenticated;

create or replace function public.admin_restore_guest(p_player_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if public.admin_access_until() is null then
    raise exception 'Administrationsadgang mangler eller er udløbet';
  end if;
  update public.players p
     set active = true
   where p.id = p_player_id and p.is_guest and not p.active
   returning p.id into v_id;
  if v_id is null then
    raise exception 'Gæsten findes ikke, er allerede aktiv eller er en fast spiller';
  end if;
  return v_id;
end;
$$;
revoke all on function public.admin_restore_guest(uuid) from public, anon, authenticated;
grant execute on function public.admin_restore_guest(uuid) to authenticated;

commit;
notify pgrst, 'reload schema';
