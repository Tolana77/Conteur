-- Accueil multijoueur : administrateurs, couleurs, préfabriqués et création.
-- Le navigateur hôte reste la seule autorité qui installe un personnage dans le moteur.

alter table public.multiplayer_members
  drop constraint if exists multiplayer_members_role_check;

alter table public.multiplayer_members
  add constraint multiplayer_members_role_check
  check (role in ('host', 'admin', 'player', 'spectator'));

alter table public.multiplayer_members
  add column if not exists player_color text not null default '#6B4A5C';

alter table public.multiplayer_members
  drop constraint if exists multiplayer_members_player_color_check;

alter table public.multiplayer_members
  add constraint multiplayer_members_player_color_check
  check (player_color ~ '^#[0-9A-Fa-f]{6}$');

create or replace function public.multiplayer_color_for_user(p_user_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array[
    '#C86464', '#D08A4B', '#C5A84A', '#68A864', '#4F9C91',
    '#5689B8', '#7668B5', '#A263B0', '#B55F86', '#8B7461'
  ])[1 + get_byte(decode(substr(md5(p_user_id::text), 1, 2), 'hex'), 0) % 10];
$$;

update public.multiplayer_members
set player_color = public.multiplayer_color_for_user(user_id);

create or replace function public.set_multiplayer_member_color()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.player_color := public.multiplayer_color_for_user(new.user_id);
  return new;
end;
$$;

drop trigger if exists multiplayer_member_color_before_insert on public.multiplayer_members;
create trigger multiplayer_member_color_before_insert
before insert on public.multiplayer_members
for each row execute function public.set_multiplayer_member_color();

create or replace function public.is_multiplayer_admin(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.multiplayer_members member
    where member.room_id = p_room_id
      and member.user_id = p_user_id
      and member.role in ('host', 'admin')
  );
$$;

revoke all on function public.multiplayer_color_for_user(uuid) from public;
revoke all on function public.is_multiplayer_admin(uuid, uuid) from public;
grant execute on function public.is_multiplayer_admin(uuid, uuid) to authenticated;

create table if not exists public.multiplayer_character_presets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  summary text not null default '' check (char_length(summary) <= 500),
  character_package jsonb not null check (
    jsonb_typeof(character_package) = 'object'
    and pg_column_size(character_package) <= 262144
  ),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (room_id, name)
);

create table if not exists public.multiplayer_character_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('preset', 'custom')),
  preset_id uuid references public.multiplayer_character_presets(id) on delete set null,
  character_package jsonb not null check (
    jsonb_typeof(character_package) = 'object'
    and pg_column_size(character_package) <= 262144
  ),
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'rejected')
  ),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (room_id, user_id)
    references public.multiplayer_members(room_id, user_id)
    on delete cascade
);

create unique index if not exists multiplayer_one_open_character_request_per_user
  on public.multiplayer_character_requests(room_id, user_id)
  where status in ('pending', 'processing');

alter table public.multiplayer_character_presets enable row level security;
alter table public.multiplayer_character_requests enable row level security;

drop policy if exists multiplayer_character_presets_read_room on public.multiplayer_character_presets;
create policy multiplayer_character_presets_read_room
  on public.multiplayer_character_presets for select to authenticated
  using (public.is_multiplayer_member(room_id));

drop policy if exists multiplayer_character_requests_read_owner_or_host on public.multiplayer_character_requests;
create policy multiplayer_character_requests_read_owner_or_host
  on public.multiplayer_character_requests for select to authenticated
  using (user_id = auth.uid() or public.is_multiplayer_host(room_id));

grant select on public.multiplayer_character_presets to authenticated;
grant select on public.multiplayer_character_requests to authenticated;

create or replace function public.set_multiplayer_member_role(
  p_room_id uuid,
  p_user_id uuid,
  p_role text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_multiplayer_host(p_room_id) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_role not in ('admin', 'player', 'spectator') then
    raise exception 'INVALID_ROLE';
  end if;

  update public.multiplayer_members
  set role = p_role,
      character_id = case when p_role = 'spectator' then null else character_id end
  where room_id = p_room_id
    and user_id = p_user_id
    and role <> 'host';
  return found;
end;
$$;

create or replace function public.join_multiplayer_room(
  p_join_code text,
  p_display_name text,
  p_role text default 'player'
)
returns setof public.multiplayer_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.multiplayer_rooms;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_role not in ('player', 'spectator') then raise exception 'INVALID_ROLE'; end if;
  if char_length(trim(p_display_name)) not between 2 and 40 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;

  select * into v_room
  from public.multiplayer_rooms room
  where room.join_code = upper(trim(p_join_code)) and room.status <> 'closed';
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  insert into public.multiplayer_members(room_id, user_id, display_name, role)
  values (v_room.id, auth.uid(), trim(p_display_name), p_role)
  on conflict (room_id, user_id) do update
    set display_name = excluded.display_name,
        role = case
          when public.multiplayer_members.role in ('host', 'admin')
            then public.multiplayer_members.role
          else excluded.role
        end,
        character_id = case
          when excluded.role = 'spectator' and public.multiplayer_members.role not in ('host', 'admin')
            then null
          else public.multiplayer_members.character_id
        end;
  return next v_room;
end;
$$;

create or replace function public.create_multiplayer_character_preset(
  p_room_id uuid,
  p_name text,
  p_summary text,
  p_character_package jsonb
)
returns setof public.multiplayer_character_presets
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_multiplayer_admin(p_room_id) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if char_length(trim(p_name)) not between 1 and 80 then
    raise exception 'INVALID_PRESET_NAME';
  end if;
  if jsonb_typeof(p_character_package) <> 'object' or pg_column_size(p_character_package) > 262144 then
    raise exception 'INVALID_CHARACTER_PACKAGE';
  end if;

  return query
  insert into public.multiplayer_character_presets(
    room_id, name, summary, character_package, created_by
  ) values (
    p_room_id,
    left(trim(p_name), 80),
    left(trim(coalesce(p_summary, '')), 500),
    p_character_package,
    auth.uid()
  )
  returning *;
exception when unique_violation then
  raise exception 'PRESET_NAME_ALREADY_EXISTS';
end;
$$;

create or replace function public.delete_multiplayer_character_preset(p_preset_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
begin
  select room_id into v_room_id
  from public.multiplayer_character_presets
  where id = p_preset_id;
  if v_room_id is null or not public.is_multiplayer_admin(v_room_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.multiplayer_character_presets where id = p_preset_id;
  return found;
end;
$$;

create or replace function public.submit_multiplayer_character_request(
  p_room_id uuid,
  p_kind text,
  p_preset_id uuid default null,
  p_character_package jsonb default null
)
returns setof public.multiplayer_character_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.multiplayer_members;
  v_package jsonb;
begin
  select * into v_member
  from public.multiplayer_members member
  where member.room_id = p_room_id and member.user_id = auth.uid();
  if not found or v_member.role not in ('player', 'admin') or v_member.character_id is not null then
    raise exception 'CHARACTER_REQUEST_NOT_ALLOWED';
  end if;
  if p_kind not in ('preset', 'custom') then
    raise exception 'INVALID_CHARACTER_REQUEST_KIND';
  end if;

  if p_kind = 'preset' then
    select character_package into v_package
    from public.multiplayer_character_presets
    where id = p_preset_id and room_id = p_room_id;
    if v_package is null then raise exception 'PRESET_NOT_FOUND'; end if;
  else
    v_package := p_character_package;
  end if;
  if jsonb_typeof(v_package) <> 'object' or pg_column_size(v_package) > 262144 then
    raise exception 'INVALID_CHARACTER_PACKAGE';
  end if;

  return query
  insert into public.multiplayer_character_requests(
    room_id, user_id, kind, preset_id, character_package
  ) values (
    p_room_id, auth.uid(), p_kind,
    case when p_kind = 'preset' then p_preset_id else null end,
    v_package
  )
  returning *;
exception when unique_violation then
  raise exception 'CHARACTER_REQUEST_ALREADY_PENDING';
end;
$$;

create or replace function public.set_multiplayer_character_request_status(
  p_request_id uuid,
  p_status text,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
begin
  select room_id into v_room_id
  from public.multiplayer_character_requests
  where id = p_request_id;
  if v_room_id is null or not public.is_multiplayer_host(v_room_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_status = 'processing' then
    update public.multiplayer_character_requests
    set status = 'processing', error = null
    where id = p_request_id and status = 'pending';
  elsif p_status in ('completed', 'rejected') then
    update public.multiplayer_character_requests
    set status = p_status,
        error = left(p_error, 500),
        completed_at = now()
    where id = p_request_id and status in ('pending', 'processing');
  else
    raise exception 'INVALID_CHARACTER_REQUEST_STATUS';
  end if;
  return found;
end;
$$;

-- L'admin est un joueur privilégié ; l'hôte reste le seul arbitre du moteur.
create or replace function public.assign_multiplayer_character(
  p_room_id uuid,
  p_user_id uuid,
  p_character_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_role text;
  v_assigned boolean;
begin
  if not public.is_multiplayer_host(p_room_id) then
    raise exception 'PERMISSION_DENIED';
  end if;
  select role into v_target_role
  from public.multiplayer_members
  where room_id = p_room_id and user_id = p_user_id;
  if not found or v_target_role = 'spectator' then
    raise exception 'MEMBER_CANNOT_CONTROL_CHARACTER';
  end if;
  if p_character_id is not null and exists (
    select 1 from public.multiplayer_members
    where room_id = p_room_id
      and character_id = p_character_id
      and user_id <> p_user_id
  ) then
    raise exception 'CHARACTER_ALREADY_CLAIMED';
  end if;

  update public.multiplayer_members
  set character_id = nullif(trim(p_character_id), '')
  where room_id = p_room_id and user_id = p_user_id;
  v_assigned := found;
  if v_assigned and nullif(trim(p_character_id), '') is not null then
    update public.multiplayer_rooms
    set status = 'active', updated_at = now()
    where id = p_room_id and status = 'lobby';
  end if;
  return v_assigned;
end;
$$;

create or replace function public.submit_multiplayer_turn(
  p_room_id uuid,
  p_content text,
  p_actions jsonb default '[]'::jsonb,
  p_kind text default 'narrative',
  p_check_request_id text default null
)
returns setof public.multiplayer_turns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.multiplayer_members;
  v_turn public.multiplayer_turns;
begin
  select * into v_member
  from public.multiplayer_members member
  where member.room_id = p_room_id and member.user_id = auth.uid();
  if not found or v_member.role not in ('player', 'admin') or v_member.character_id is null then
    raise exception 'PLAYER_CHARACTER_REQUIRED';
  end if;
  if not exists (
    select 1 from public.multiplayer_rooms where id = p_room_id and status <> 'closed'
  ) then raise exception 'ROOM_CLOSED'; end if;
  if jsonb_typeof(p_actions) <> 'array' or jsonb_array_length(p_actions) > 2 or pg_column_size(p_actions) > 65536 then
    raise exception 'INVALID_ACTIONS';
  end if;
  if p_kind not in ('narrative', 'playerCheck') then raise exception 'INVALID_TURN_KIND'; end if;
  if p_kind = 'playerCheck' and nullif(trim(p_check_request_id), '') is null then
    raise exception 'CHECK_REQUEST_REQUIRED';
  end if;
  if p_check_request_id is not null and char_length(p_check_request_id) > 160 then
    raise exception 'CHECK_REQUEST_TOO_LONG';
  end if;
  if p_kind = 'narrative' and char_length(trim(coalesce(p_content, ''))) = 0 and jsonb_array_length(p_actions) = 0 then
    raise exception 'EMPTY_TURN';
  end if;

  insert into public.multiplayer_turns(
    room_id, user_id, character_id, kind, check_request_id, content, actions
  ) values (
    p_room_id, auth.uid(), v_member.character_id, p_kind,
    nullif(trim(p_check_request_id), ''), left(trim(coalesce(p_content, '')), 4000), p_actions
  ) returning * into v_turn;
  return next v_turn;
exception when unique_violation then
  raise exception 'TURN_ALREADY_PENDING';
end;
$$;

revoke all on function public.set_multiplayer_member_role(uuid, uuid, text) from public;
revoke all on function public.create_multiplayer_character_preset(uuid, text, text, jsonb) from public;
revoke all on function public.delete_multiplayer_character_preset(uuid) from public;
revoke all on function public.submit_multiplayer_character_request(uuid, text, uuid, jsonb) from public;
revoke all on function public.set_multiplayer_character_request_status(uuid, text, text) from public;
grant execute on function public.set_multiplayer_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.create_multiplayer_character_preset(uuid, text, text, jsonb) to authenticated;
grant execute on function public.delete_multiplayer_character_preset(uuid) to authenticated;
grant execute on function public.submit_multiplayer_character_request(uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.set_multiplayer_character_request_status(uuid, text, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'multiplayer_character_presets'
  ) then
    alter publication supabase_realtime add table public.multiplayer_character_presets;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'multiplayer_character_requests'
  ) then
    alter publication supabase_realtime add table public.multiplayer_character_requests;
  end if;
end;
$$;
