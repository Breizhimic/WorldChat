begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 30),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index room_members_user on public.room_members(user_id);

create table public.room_invites (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null
);

create table public.messages (
  id uuid primary key,
  sequence bigint generated always as identity unique,
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  language text not null check (language in ('fr', 'en')),
  created_at timestamptz not null default clock_timestamp()
);

create index messages_room_sequence on public.messages(room_id, sequence desc);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_invites enable row level security;
alter table public.messages enable row level security;

create function private.is_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

revoke all on function private.is_room_member(uuid) from public, anon;
grant execute on function private.is_room_member(uuid) to authenticated;

create policy members_read_rooms on public.rooms
  for select to authenticated using (private.is_room_member(id));
create policy members_read_members on public.room_members
  for select to authenticated using (private.is_room_member(room_id));
create policy members_read_messages on public.messages
  for select to authenticated using (private.is_room_member(room_id));

-- All writes go through checked functions. Invitation tokens are never selectable.
revoke all on public.rooms, public.room_members, public.room_invites, public.messages from anon, authenticated;
grant select on public.rooms, public.room_members, public.messages to authenticated;

create function public.create_room(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_room_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  insert into public.rooms(name, owner_id)
    values (btrim(p_name), auth.uid()) returning id into v_room_id;
  insert into public.room_members(room_id, user_id, display_name)
    values (v_room_id, auth.uid(), btrim(p_display_name));
  return v_room_id;
end;
$$;

create function public.rotate_invitation(p_room_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_token text;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  perform 1 from public.rooms
    where id = p_room_id and owner_id = auth.uid() for no key update;
  if not found then raise exception 'Seul le créateur peut générer une invitation.'; end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.room_invites(room_id, token, expires_at)
    values (p_room_id, v_token, now() + interval '7 days')
    on conflict (room_id) do update
      set token = excluded.token, expires_at = excluded.expires_at;
  return v_token;
end;
$$;

create function public.join_room(p_token text, p_display_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_room_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  select room_id into v_room_id from public.room_invites
    where token = p_token and expires_at > now() for share;
  if v_room_id is null then raise exception 'Invitation invalide ou expirée.'; end if;
  insert into public.room_members(room_id, user_id, display_name)
    values (v_room_id, auth.uid(), btrim(p_display_name))
    on conflict (room_id, user_id) do nothing;
  return v_room_id;
end;
$$;

create function public.send_message(
  p_room_id uuid, p_id uuid, p_body text, p_language text
)
returns setof public.messages language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  select display_name into v_name from public.room_members
    where room_id = p_room_id and user_id = auth.uid();
  if v_name is null then raise exception 'Tu ne fais pas partie de ce salon.'; end if;
  -- Serialize this room's inserts so sequence cursors also follow commit order.
  perform 1 from public.rooms where id = p_room_id for no key update;
  insert into public.messages(id, room_id, sender_id, sender_name, body, language)
    values (p_id, p_room_id, auth.uid(), v_name, btrim(p_body), p_language)
    on conflict (id) do nothing;
  if not exists (
    select 1 from public.messages
    where id = p_id and room_id = p_room_id and sender_id = auth.uid()
      and body = btrim(p_body) and language = p_language
  ) then
    raise exception 'Cet identifiant correspond à un autre message.';
  end if;
  return query select * from public.messages where id = p_id;
end;
$$;

revoke all on function public.create_room(text, text) from public, anon;
revoke all on function public.rotate_invitation(uuid) from public, anon;
revoke all on function public.join_room(text, text) from public, anon;
revoke all on function public.send_message(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_room(text, text) to authenticated;
grant execute on function public.rotate_invitation(uuid) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.send_message(uuid, uuid, text, text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  alter publication supabase_realtime add table public.messages;
end;
$$;

commit;
