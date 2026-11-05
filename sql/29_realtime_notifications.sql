-- Whist: automatic cross-device refresh for Registrering, Stilling and Historik.
-- Apply once in Supabase > SQL Editor, after the existing schema migrations.
-- Safe to re-run. Does not change scoring rules, existing games, or permissions
-- on games/game_participants. Only revision metadata is exposed to visitors.

begin;

-- A single public-to-read, server-only-to-write revision row. Anonymous Auth
-- users have the "authenticated" Postgres role in Supabase.
create table if not exists public.whist_change_signal (
  id smallint primary key default 1 check (id = 1),
  revision bigint not null default 0,
  source text not null default 'initial',
  changed_at timestamptz not null default now()
);

alter table public.whist_change_signal enable row level security;
revoke all on table public.whist_change_signal from public, anon, authenticated;
grant select on table public.whist_change_signal to authenticated;

drop policy if exists "Whist visitors may read the change signal"
  on public.whist_change_signal;
create policy "Whist visitors may read the change signal"
  on public.whist_change_signal
  for select to authenticated using (true);

insert into public.whist_change_signal (id) values (1)
  on conflict (id) do nothing;

-- Called by database triggers after statements that modify relevant tables.
-- Changes to the signal row participate in the same transaction, so the
-- Realtime event is visible only after the game or edit has fully committed.
create or replace function public.whist_bump_change_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.whist_change_signal
     set revision = revision + 1,
         source = TG_TABLE_NAME,
         changed_at = clock_timestamp()
   where id = 1;
  return null;
end;
$$;

revoke all on function public.whist_bump_change_signal() from public, anon, authenticated;

-- Statement-level triggers avoid one notification for each of a game's four
-- participants. A registration normally produces two revision changes:
-- the games insert and the game_participants insert, in one transaction.
drop trigger if exists whist_realtime_games on public.games;
create trigger whist_realtime_games
  after insert or update or delete on public.games
  for each statement execute function public.whist_bump_change_signal();

drop trigger if exists whist_realtime_participants on public.game_participants;
create trigger whist_realtime_participants
  after insert or update or delete on public.game_participants
  for each statement execute function public.whist_bump_change_signal();

drop trigger if exists whist_realtime_players on public.players;
create trigger whist_realtime_players
  after insert or update or delete on public.players
  for each statement execute function public.whist_bump_change_signal();

drop trigger if exists whist_realtime_tournaments on public.tournaments;
create trigger whist_realtime_tournaments
  after insert or update or delete on public.tournaments
  for each statement execute function public.whist_bump_change_signal();

-- Keep any other tables already in the Realtime publication. Never drop or
-- recreate that publication, because it may be used elsewhere in Supabase.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and not puballtables
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whist_change_signal'
  ) then
    alter publication supabase_realtime add table public.whist_change_signal;
  end if;
end;
$$;

commit;
