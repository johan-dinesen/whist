-- Run this ONCE in Supabase SQL Editor AFTER sql/01_schema.sql and sql/02_seed.sql.
-- Converts per-email registrar approval into a 30-day authorization for each
-- anonymous browser session. There are NO passwords or keys in the GitHub code.
-- IMPORTANT: After running this migration, set the actual password privately in
-- the Supabase SQL Editor using the example in README.md.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- One bcrypt password hash, never a plaintext password.
create table if not exists private.registration_secret (
  id smallint primary key default 1 check (id=1),
  password_hash text not null,
  changed_at timestamptz not null default now()
);
revoke all on table private.registration_secret from public, anon, authenticated;

-- Limit failed guesses per anonymous device/session. For an internet-facing site
-- also use a strong passphrase; a determined actor can obtain new sessions.
create table if not exists private.registration_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failures integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
revoke all on table private.registration_attempts from public, anon, authenticated;

alter table public.registrars add column if not exists expires_at timestamptz;
-- Old email-approved accounts must not retain permanent access by accident.
update public.registrars set expires_at=now() where expires_at is null;
alter table public.registrars alter column expires_at set not null;

create or replace function public.is_registrar()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.registrars
    where user_id = auth.uid() and expires_at > now()
  );
$$;
revoke all on function public.is_registrar() from public, anon, authenticated;
grant execute on function public.is_registrar() to authenticated;

-- Registered (including anonymous Supabase Auth) visitors may choose players
-- and tournaments without knowing the password. They cannot write games.
drop policy if exists "Approved registrars can list players" on public.players;
drop policy if exists "Approved registrars can list tournaments" on public.tournaments;
drop policy if exists "Visitors can list active players" on public.players;
drop policy if exists "Visitors can list tournaments" on public.tournaments;

create policy "Visitors can list active players" on public.players
  for select to authenticated using (active=true);
create policy "Visitors can list tournaments" on public.tournaments
  for select to authenticated using (true);

grant select on public.players, public.tournaments to authenticated;
-- Reconfirm: no direct writes to games or participants from browser clients.
revoke insert, update, delete on public.games, public.game_participants from anon, authenticated;

-- Return the expiry for the current browser; NULL means password is required.
create or replace function public.registration_access_until()
returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(expires_at)
  from public.registrars
  where user_id=auth.uid() and expires_at > now();
$$;
revoke all on function public.registration_access_until() from public, anon, authenticated;
grant execute on function public.registration_access_until() to authenticated;

-- Password verification takes place in Postgres, not in public HTML/JS.
-- Return expiry (success) or NULL (wrong/temporarily blocked).
-- Do not RAISE on an incorrect password: a raised exception would roll back
-- the failed-attempt counter along with the rest of the transaction.
create or replace function public.unlock_registration(p_password text)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_failures integer;
  v_blocked_until timestamptz;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'Anonym session mangler';
  end if;
  if p_password is null or length(p_password) < 8 or octet_length(p_password) > 72 then
    return null;
  end if;

  insert into private.registration_attempts(user_id)
  values (v_uid) on conflict (user_id) do nothing;

  select failures,blocked_until into v_failures,v_blocked_until
  from private.registration_attempts
  where user_id=v_uid for update;

  if v_blocked_until is not null and v_blocked_until>now() then
    return null;
  end if;
  if v_blocked_until is not null and v_blocked_until<=now() then
    update private.registration_attempts
    set failures=0,blocked_until=null,updated_at=now()
    where user_id=v_uid;
    v_failures:=0;
  end if;

  select password_hash into v_hash
  from private.registration_secret where id=1;
  if v_hash is null then
    raise exception 'Fælles kode er endnu ikke konfigureret';
  end if;

  if extensions.crypt(p_password,v_hash)=v_hash then
    v_expires:=now()+interval '30 days';
    insert into public.registrars(user_id,expires_at)
      values(v_uid,v_expires)
      on conflict(user_id) do update set expires_at=excluded.expires_at;
    delete from private.registration_attempts where user_id=v_uid;
    return v_expires;
  end if;

  update private.registration_attempts
  set failures=v_failures+1,
      blocked_until=case when v_failures+1>=5 then now()+interval '15 minutes' else null end,
      updated_at=now()
  where user_id=v_uid;
  return null;
end;
$$;
revoke all on function public.unlock_registration(text) from public, anon, authenticated;
grant execute on function public.unlock_registration(text) to authenticated;

-- Existing register_game() from 01_schema.sql calls is_registrar() on every
-- submission, so its existing transaction/validation remains protected.
commit;
