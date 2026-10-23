-- Whist v0.1.7: private administration of tournament labels and the default tag.
-- Apply ONCE AFTER 04_shared_password.sql and 06_tournament_notes.sql.
-- Does not modify any existing games or their tournament assignments.
-- IMPORTANT: afterwards set the independent admin password using the SQL in README.md.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admin_secret (
  id smallint primary key default 1 check (id = 1),
  password_hash text not null,
  changed_at timestamptz not null default clock_timestamp()
);
create table if not exists private.admin_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failures integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists private.admin_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  secret_changed_at timestamptz not null
);
revoke all on table private.admin_secret, private.admin_attempts, private.admin_sessions
  from public, anon, authenticated;

-- Database-side authorisation is checked again on EACH administrative write.
-- A new password (different changed_at) invalidates all previous sessions.
create or replace function public.admin_access_until()
returns timestamptz
language sql stable security definer set search_path = '' as $$
  select a.expires_at
  from private.admin_sessions a
  join private.admin_secret s on s.id = 1
  where a.user_id = auth.uid()
    and a.expires_at > now()
    and a.secret_changed_at = s.changed_at
    and auth.uid() is not null;
$$;
revoke all on function public.admin_access_until() from public, anon, authenticated;
grant execute on function public.admin_access_until() to authenticated;

-- Wrong passwords return NULL instead of raising so failed attempts COMMIT.
-- Lockout is per anonymous Supabase Auth session, not a substitute for
-- provider-level rate limiting (new anonymous sessions can bypass it).
create or replace function public.unlock_admin(p_password text)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_changed_at timestamptz;
  v_failures integer;
  v_blocked_until timestamptz;
  v_expiry timestamptz;
begin
  if v_uid is null then
    raise exception 'Anonym Supabase-session mangler';
  end if;
  if p_password is null or length(p_password) < 8 or octet_length(p_password) > 72 then
    return null;
  end if;
  insert into private.admin_attempts(user_id)
    values(v_uid) on conflict (user_id) do nothing;
  select failures, blocked_until
    into v_failures, v_blocked_until
    from private.admin_attempts where user_id=v_uid for update;
  if v_blocked_until is not null and v_blocked_until > now() then
    return null;
  end if;
  if v_blocked_until is not null and v_blocked_until <= now() then
    update private.admin_attempts
       set failures=0, blocked_until=null, updated_at=now()
     where user_id=v_uid;
    v_failures := 0;
  end if;
  select password_hash, changed_at into v_hash, v_changed_at
    from private.admin_secret where id=1;
  if v_hash is null then
    raise exception 'Administrationskoden er endnu ikke konfigureret';
  end if;
  if extensions.crypt(p_password,v_hash) = v_hash then
    v_expiry := now() + interval '12 hours';
    insert into private.admin_sessions(user_id,expires_at,secret_changed_at)
      values (v_uid,v_expiry,v_changed_at)
      on conflict (user_id) do update
        set expires_at=excluded.expires_at,
            secret_changed_at=excluded.secret_changed_at;
    delete from private.admin_attempts where user_id=v_uid;
    return v_expiry;
  end if;
  update private.admin_attempts
    set failures=v_failures + 1,
        blocked_until=case when v_failures + 1 >= 5 then now() + interval '15 minutes' else null end,
        updated_at=now()
    where user_id=v_uid;
  return null;
end;
$$;
revoke all on function public.unlock_admin(text) from public, anon, authenticated;
grant execute on function public.unlock_admin(text) to authenticated;

-- Only this function can add a named tournament, not the browser's table API.
-- Avoid case/whitespace duplicates such as 'Hals 2027' and ' hals 2027 '.
create unique index if not exists tournaments_name_normalized_unique
  on public.tournaments (lower(btrim(name)));

create or replace function public.admin_create_tournament(p_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(p_name);
  v_id uuid;
begin
  if public.admin_access_until() is null then
    raise exception 'Administrationsadgang mangler eller er udløbet';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'Navnet skal have mellem 1 og 120 tegn';
  end if;
  if lower(v_name) = 'kredsspil' then
    raise exception 'Kredsspil er en reserveret betegnelse for spil uden turnering';
  end if;
  insert into public.tournaments(name,is_active)
    values(v_name,false)
    on conflict do nothing returning id into v_id;
  if v_id is null then
    raise exception 'En spilsamling med dette navn findes allerede';
  end if;
  return v_id;
end;
$$;
revoke all on function public.admin_create_tournament(text) from public, anon, authenticated;
grant execute on function public.admin_create_tournament(text) to authenticated;

-- NULL means Kredsspil: no active named tournament.
-- Serialise concurrent administrators, and turn the old flag off FIRST to
-- respect the existing unique partial index on is_active.
create or replace function public.admin_set_active_tournament(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.admin_access_until() is null then
    raise exception 'Administrationsadgang mangler eller er udløbet';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(714181932434);
  if p_tournament_id is not null and not exists (
    select 1 from public.tournaments where id=p_tournament_id
  ) then
    raise exception 'Ukendt turnering';
  end if;
  update public.tournaments set is_active=false where is_active=true;
  if p_tournament_id is not null then
    update public.tournaments set is_active=true where id=p_tournament_id;
  end if;
end;
$$;
revoke all on function public.admin_set_active_tournament(uuid) from public, anon, authenticated;
grant execute on function public.admin_set_active_tournament(uuid) to authenticated;

-- Log out from this browser's admin grant without affecting game registration.
create or replace function public.lock_admin()
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    delete from private.admin_sessions where user_id=auth.uid();
  end if;
end;
$$;
revoke all on function public.lock_admin() from public, anon, authenticated;
grant execute on function public.lock_admin() to authenticated;

-- Browsers remain read-only on the table; changing the tag always requires RPC.
revoke insert,update,delete on public.tournaments from anon, authenticated;
commit;
