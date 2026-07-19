create extension if not exists pgcrypto;

create table if not exists public.multiplayer_rooms (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique check (join_code ~ '^[A-F0-9]{6}$'),
  campaign_id text not null check (char_length(campaign_id) between 1 and 160),
  name text not null check (char_length(name) between 1 and 120),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.multiplayer_members (
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  role text not null check (role in ('host', 'player', 'spectator')),
  character_id text,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create unique index if not exists multiplayer_one_user_per_character
  on public.multiplayer_members(room_id, character_id)
  where character_id is not null;

create table if not exists public.multiplayer_projections (
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence bigint not null check (sequence >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id),
  foreign key (room_id, user_id)
    references public.multiplayer_members(room_id, user_id)
    on delete cascade
);

create table if not exists public.multiplayer_turns (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null,
  kind text not null default 'narrative' check (kind in ('narrative', 'playerCheck')),
  check_request_id text,
  content text not null default '' check (char_length(content) <= 4000),
  actions jsonb not null default '[]'::jsonb check (
    jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) <= 2
  ),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'rejected')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (room_id, user_id)
    references public.multiplayer_members(room_id, user_id)
    on delete cascade
);

create unique index if not exists multiplayer_one_open_turn_per_user
  on public.multiplayer_turns(room_id, user_id)
  where status in ('pending', 'processing');

alter table public.multiplayer_rooms enable row level security;
alter table public.multiplayer_members enable row level security;
alter table public.multiplayer_projections enable row level security;
alter table public.multiplayer_turns enable row level security;

create or replace function public.is_multiplayer_member(
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
  );
$$;

create or replace function public.is_multiplayer_host(
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
    from public.multiplayer_rooms room
    where room.id = p_room_id
      and room.host_user_id = p_user_id
  );
$$;

revoke all on function public.is_multiplayer_member(uuid, uuid) from public;
revoke all on function public.is_multiplayer_host(uuid, uuid) from public;
grant execute on function public.is_multiplayer_member(uuid, uuid) to authenticated;
grant execute on function public.is_multiplayer_host(uuid, uuid) to authenticated;

drop policy if exists multiplayer_rooms_read_members on public.multiplayer_rooms;
create policy multiplayer_rooms_read_members
  on public.multiplayer_rooms for select to authenticated
  using (public.is_multiplayer_member(id));

drop policy if exists multiplayer_members_read_room on public.multiplayer_members;
create policy multiplayer_members_read_room
  on public.multiplayer_members for select to authenticated
  using (public.is_multiplayer_member(room_id));

drop policy if exists multiplayer_turns_read_room on public.multiplayer_turns;
create policy multiplayer_turns_read_room
  on public.multiplayer_turns for select to authenticated
  using (user_id = auth.uid() or public.is_multiplayer_host(room_id));

drop policy if exists multiplayer_projections_read_recipient on public.multiplayer_projections;
create policy multiplayer_projections_read_recipient
  on public.multiplayer_projections for select to authenticated
  using (user_id = auth.uid() or public.is_multiplayer_host(room_id));

drop policy if exists multiplayer_projections_host_insert on public.multiplayer_projections;
create policy multiplayer_projections_host_insert
  on public.multiplayer_projections for insert to authenticated
  with check (public.is_multiplayer_host(room_id));

drop policy if exists multiplayer_projections_host_update on public.multiplayer_projections;
create policy multiplayer_projections_host_update
  on public.multiplayer_projections for update to authenticated
  using (public.is_multiplayer_host(room_id))
  with check (public.is_multiplayer_host(room_id));

grant select on public.multiplayer_rooms to authenticated;
grant select on public.multiplayer_members to authenticated;
grant select on public.multiplayer_turns to authenticated;
grant select, insert, update on public.multiplayer_projections to authenticated;

create or replace function public.create_multiplayer_room(
  p_campaign_id text,
  p_display_name text,
  p_name text
)
returns setof public.multiplayer_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.multiplayer_rooms;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if char_length(trim(p_display_name)) not between 2 and 40 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;
  if char_length(trim(p_campaign_id)) not between 1 and 160 or char_length(trim(p_name)) not between 1 and 120 then
    raise exception 'INVALID_ROOM_METADATA';
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into public.multiplayer_rooms(join_code, campaign_id, name, host_user_id)
      values (v_code, trim(p_campaign_id), left(trim(p_name), 120), auth.uid())
      returning * into v_room;
      exit;
    exception when unique_violation then
      -- Une collision de code est simplement retentée.
    end;
  end loop;

  insert into public.multiplayer_members(room_id, user_id, display_name, role)
  values (v_room.id, auth.uid(), trim(p_display_name), 'host');
  return next v_room;
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
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_role not in ('player', 'spectator') then
    raise exception 'INVALID_ROLE';
  end if;
  if char_length(trim(p_display_name)) not between 2 and 40 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;

  select * into v_room
  from public.multiplayer_rooms room
  where room.join_code = upper(trim(p_join_code))
    and room.status <> 'closed';
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  insert into public.multiplayer_members(room_id, user_id, display_name, role)
  values (v_room.id, auth.uid(), trim(p_display_name), p_role)
  on conflict (room_id, user_id) do update
    set display_name = excluded.display_name,
        role = case
          when public.multiplayer_members.role = 'host' then 'host'
          else excluded.role
        end,
        character_id = case
          when excluded.role = 'spectator' then null
          else public.multiplayer_members.character_id
        end;
  return next v_room;
end;
$$;

create or replace function public.leave_multiplayer_room(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_multiplayer_host(p_room_id) then
    update public.multiplayer_rooms
    set status = 'closed', updated_at = now()
    where id = p_room_id;
  else
    delete from public.multiplayer_members
    where room_id = p_room_id and user_id = auth.uid();
  end if;
  return found;
end;
$$;

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
  if auth.uid() <> p_user_id and not public.is_multiplayer_host(p_room_id) then
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

drop function if exists public.submit_multiplayer_turn(uuid, text, jsonb);
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
  if not found or v_member.role <> 'player' or v_member.character_id is null then
    raise exception 'PLAYER_CHARACTER_REQUIRED';
  end if;
  if not exists (
    select 1 from public.multiplayer_rooms
    where id = p_room_id and status <> 'closed'
  ) then
    raise exception 'ROOM_CLOSED';
  end if;
  if jsonb_typeof(p_actions) <> 'array' or jsonb_array_length(p_actions) > 2 or pg_column_size(p_actions) > 65536 then
    raise exception 'INVALID_ACTIONS';
  end if;
  if p_kind not in ('narrative', 'playerCheck') then
    raise exception 'INVALID_TURN_KIND';
  end if;
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
  )
  values (
    p_room_id,
    auth.uid(),
    v_member.character_id,
    p_kind,
    nullif(trim(p_check_request_id), ''),
    left(trim(coalesce(p_content, '')), 4000),
    p_actions
  )
  returning * into v_turn;
  return next v_turn;
exception when unique_violation then
  raise exception 'TURN_ALREADY_PENDING';
end;
$$;

create or replace function public.set_multiplayer_turn_status(
  p_turn_id uuid,
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
  select room_id into v_room_id from public.multiplayer_turns where id = p_turn_id;
  if v_room_id is null or not public.is_multiplayer_host(v_room_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_status = 'processing' then
    update public.multiplayer_turns
    set status = 'processing', error = null
    where id = p_turn_id and status = 'pending';
  elsif p_status in ('completed', 'rejected') then
    update public.multiplayer_turns
    set status = p_status,
        error = left(p_error, 500),
        completed_at = now()
    where id = p_turn_id and status in ('pending', 'processing');
  else
    raise exception 'INVALID_TURN_STATUS';
  end if;
  return found;
end;
$$;

revoke all on function public.create_multiplayer_room(text, text, text) from public;
revoke all on function public.join_multiplayer_room(text, text, text) from public;
revoke all on function public.leave_multiplayer_room(uuid) from public;
revoke all on function public.assign_multiplayer_character(uuid, uuid, text) from public;
revoke all on function public.submit_multiplayer_turn(uuid, text, jsonb, text, text) from public;
revoke all on function public.set_multiplayer_turn_status(uuid, text, text) from public;
grant execute on function public.create_multiplayer_room(text, text, text) to authenticated;
grant execute on function public.join_multiplayer_room(text, text, text) to authenticated;
grant execute on function public.leave_multiplayer_room(uuid) to authenticated;
grant execute on function public.assign_multiplayer_character(uuid, uuid, text) to authenticated;
grant execute on function public.submit_multiplayer_turn(uuid, text, jsonb, text, text) to authenticated;
grant execute on function public.set_multiplayer_turn_status(uuid, text, text) to authenticated;

drop policy if exists multiplayer_realtime_read on realtime.messages;
create policy multiplayer_realtime_read
  on realtime.messages for select to authenticated
  using (
    case
      when realtime.topic() ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_multiplayer_member(split_part(realtime.topic(), ':', 2)::uuid)
      else false
    end
  );

drop policy if exists multiplayer_realtime_write on realtime.messages;
create policy multiplayer_realtime_write
  on realtime.messages for insert to authenticated
  with check (
    case
      when realtime.topic() ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_multiplayer_member(split_part(realtime.topic(), ':', 2)::uuid)
      else false
    end
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'multiplayer_rooms'
  ) then
    alter publication supabase_realtime add table public.multiplayer_rooms;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'multiplayer_members'
  ) then
    alter publication supabase_realtime add table public.multiplayer_members;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'multiplayer_turns'
  ) then
    alter publication supabase_realtime add table public.multiplayer_turns;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'multiplayer_projections'
  ) then
    alter publication supabase_realtime add table public.multiplayer_projections;
  end if;
end;
$$;
