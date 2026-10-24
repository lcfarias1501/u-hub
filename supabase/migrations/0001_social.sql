-- U-Hub · Perfil & amigos
-- Run once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run: every object is created with IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS.

-- ── Profiles ────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name  text not null default '' check (char_length(display_name) <= 32),
  avatar_icon   text not null default 'gamepad' check (char_length(avatar_icon) <= 32),
  avatar_accent text not null default 'violet'
                check (avatar_accent in ('violet', 'indigo', 'blue', 'sky', 'emerald', 'amber', 'rose', 'zinc')),
  discord_avatar text,
  -- Short code people can share instead of their username.
  friend_code   text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are visible to signed-in users" on public.profiles;
create policy "profiles are visible to signed-in users" on public.profiles
  for select to authenticated using (true);

drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Only these columns are editable by the owner (id and friend_code stay server-managed).
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_icon, avatar_accent, discord_avatar, updated_at) on public.profiles to authenticated;

-- Create a profile on first sign-in, with a unique username derived from the Discord name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base text;
  candidate text;
begin
  base := lower(regexp_replace(
    coalesce(meta ->> 'name', meta ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1), ''),
    '[^a-zA-Z0-9_]', '', 'g'));
  base := left(base, 15);
  if char_length(base) < 3 then base := 'player'; end if;

  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    candidate := base || floor(random() * 10000)::int::text;
  end loop;

  insert into public.profiles (id, username, display_name, discord_avatar)
  values (
    new.id,
    candidate,
    left(coalesce(meta -> 'custom_claims' ->> 'global_name', meta ->> 'full_name', meta ->> 'name', candidate), 32),
    meta ->> 'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Friend requests & friendships ───────────────────────────────────────────

-- Only pending requests live here: accepting or declining deletes the row.
create table if not exists public.friend_requests (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null references public.profiles (id) on delete cascade,
  to_id      uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_id, to_id),
  check (from_id <> to_id)
);

-- One row per pair, stored with the smaller id first.
create table if not exists public.friendships (
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create index if not exists friend_requests_to_idx on public.friend_requests (to_id);
create index if not exists friendships_b_idx on public.friendships (user_b);

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "see own requests" on public.friend_requests;
create policy "see own requests" on public.friend_requests
  for select to authenticated using ((select auth.uid()) in (from_id, to_id));

-- Cancel (sender) or dismiss (recipient). Creating/accepting goes through the functions below.
drop policy if exists "delete own requests" on public.friend_requests;
create policy "delete own requests" on public.friend_requests
  for delete to authenticated using ((select auth.uid()) in (from_id, to_id));

drop policy if exists "see own friendships" on public.friendships;
create policy "see own friendships" on public.friendships
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));

drop policy if exists "remove own friendships" on public.friendships;
create policy "remove own friendships" on public.friendships
  for delete to authenticated using ((select auth.uid()) in (user_a, user_b));

-- Send a request by username or friend code. If the other person already asked
-- you, this accepts it instead. Returns: sent | accepted | already_friends |
-- already_sent | not_found | self.
create or replace function public.send_friend_request(target text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  them uuid;
  q text := lower(trim(both from trim(leading '@' from coalesce(target, ''))));
begin
  if me is null then raise exception 'not authenticated'; end if;

  select id into them from public.profiles
   where username = q or friend_code = upper(q)
   limit 1;

  if them is null then return 'not_found'; end if;
  if them = me then return 'self'; end if;

  if exists (select 1 from public.friendships where user_a = least(me, them) and user_b = greatest(me, them)) then
    return 'already_friends';
  end if;

  if exists (select 1 from public.friend_requests where from_id = them and to_id = me) then
    delete from public.friend_requests where from_id = them and to_id = me;
    insert into public.friendships (user_a, user_b) values (least(me, them), greatest(me, them)) on conflict do nothing;
    return 'accepted';
  end if;

  if exists (select 1 from public.friend_requests where from_id = me and to_id = them) then
    return 'already_sent';
  end if;

  insert into public.friend_requests (from_id, to_id) values (me, them);
  return 'sent';
end;
$$;

-- Accept or decline a request addressed to the caller.
create or replace function public.respond_friend_request(request_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  sender uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.friend_requests where id = request_id and to_id = me returning from_id into sender;
  if sender is null then raise exception 'request not found'; end if;
  if accept then
    insert into public.friendships (user_a, user_b) values (least(me, sender), greatest(me, sender)) on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.send_friend_request(text) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- Live updates for the friends list (row filtering still follows RLS).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'friend_requests') then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'friendships') then
    alter publication supabase_realtime add table public.friendships;
  end if;
end $$;

-- ── Presence (Realtime Authorization) ───────────────────────────────────────
-- Each user publishes their status on the private channel "presence:<their id>".
-- Only they can write to it; only they and their friends can listen.

drop policy if exists "uhub presence: listen to self and friends" on realtime.messages;
create policy "uhub presence: listen to self and friends" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'presence'
    and (
      (select realtime.topic()) = 'presence:' || (select auth.uid())::text
      or exists (
        select 1 from public.friendships f
         where (f.user_a = (select auth.uid()) and (select realtime.topic()) = 'presence:' || f.user_b::text)
            or (f.user_b = (select auth.uid()) and (select realtime.topic()) = 'presence:' || f.user_a::text)
      )
    )
  );

drop policy if exists "uhub presence: publish own status" on realtime.messages;
create policy "uhub presence: publish own status" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and (select realtime.topic()) = 'presence:' || (select auth.uid())::text
  );
