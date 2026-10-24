-- U-Hub · Contas próprias + sincronização de configurações
-- Run in the Supabase SQL Editor after 0001_social.sql. Safe to re-run.

-- ── Sign-up with a chosen username ──────────────────────────────────────────
-- Email sign-ups pass { username, display_name } as user metadata; Discord
-- sign-ins keep deriving the username from the Discord name.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted text := lower(coalesce(meta ->> 'username', ''));
  base text;
  candidate text;
begin
  if wanted ~ '^[a-z0-9_]{3,20}$' and not exists (select 1 from public.profiles where username = wanted) then
    candidate := wanted;
  else
    base := lower(regexp_replace(
      coalesce(nullif(wanted, ''), meta ->> 'name', meta ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1), ''),
      '[^a-zA-Z0-9_]', '', 'g'));
    base := left(base, 15);
    if char_length(base) < 3 then base := 'player'; end if;
    candidate := base;
    while exists (select 1 from public.profiles where username = candidate) loop
      candidate := base || floor(random() * 10000)::int::text;
    end loop;
  end if;

  insert into public.profiles (id, username, display_name, discord_avatar)
  values (
    new.id,
    candidate,
    left(coalesce(nullif(meta ->> 'display_name', ''), meta -> 'custom_claims' ->> 'global_name', meta ->> 'full_name', meta ->> 'name', candidate), 32),
    meta ->> 'avatar_url'
  );
  return new;
end;
$$;

-- Lets the sign-up form say "username taken" before submitting. Only reveals
-- whether a username exists, nothing else about the account.
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(name, '')) ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(name));
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- ── Settings sync ───────────────────────────────────────────────────────────
-- One JSON document per user: { "<key>": { "value": …, "updatedAt": <ms> } }.
-- Only non-sensitive preferences are synced; the vault never leaves the device.

create table if not exists public.user_settings (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  -- A runaway client shouldn't be able to store megabytes of junk.
  check (pg_column_size(data) < 512 * 1024)
);

alter table public.user_settings enable row level security;

drop policy if exists "own settings: read" on public.user_settings;
create policy "own settings: read" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "own settings: create" on public.user_settings;
create policy "own settings: create" on public.user_settings
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "own settings: update" on public.user_settings;
create policy "own settings: update" on public.user_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Other devices of the same user pick up changes live.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'user_settings') then
    alter publication supabase_realtime add table public.user_settings;
  end if;
end $$;
