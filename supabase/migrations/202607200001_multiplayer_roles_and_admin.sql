-- Sépare le rôle joué autour de la table des droits d'administration.
-- Migration rétrocompatible : host -> MJ admin, admin -> joueur admin.

alter table public.multiplayer_members
  add column if not exists is_admin boolean not null default false;

update public.multiplayer_members member
set is_admin = true
where member.role in ('host', 'admin')
   or exists (
     select 1 from public.multiplayer_rooms room
     where room.id = member.room_id and room.host_user_id = member.user_id
   );

alter table public.multiplayer_members
  drop constraint if exists multiplayer_members_role_check;

update public.multiplayer_members set role = 'gm' where role = 'host';
update public.multiplayer_members set role = 'player' where role = 'admin';

alter table public.multiplayer_members
  add constraint multiplayer_members_role_check
  check (role in ('player', 'gm', 'spectator'));

create unique index if not exists multiplayer_one_gm_per_room
  on public.multiplayer_members(room_id)
  where role = 'gm';

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
      and member.is_admin = true
  );
$$;

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
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(trim(p_display_name)) not between 2 and 40 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;
  if char_length(trim(p_campaign_id)) not between 1 and 160
    or char_length(trim(p_name)) not between 1 and 120 then
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

  insert into public.multiplayer_members(
    room_id, user_id, display_name, role, is_admin
  ) values (
    v_room.id, auth.uid(), trim(p_display_name), 'gm', true
  );
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
          when public.multiplayer_members.role = 'gm' then 'gm'
          else excluded.role
        end,
        character_id = case
          when excluded.role = 'spectator' and public.multiplayer_members.role <> 'gm' then null
          else public.multiplayer_members.character_id
        end;
  return next v_room;
end;
$$;

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
declare
  v_current_gm uuid;
begin
  if not public.is_multiplayer_admin(p_room_id) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_role not in ('player', 'gm', 'spectator') then
    raise exception 'INVALID_ROLE';
  end if;
  if not exists (
    select 1 from public.multiplayer_members
    where room_id = p_room_id and user_id = p_user_id
  ) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  select user_id into v_current_gm
  from public.multiplayer_members
  where room_id = p_room_id and role = 'gm';

  if p_role = 'gm' then
    if not exists (
      select 1 from public.multiplayer_members
      where room_id = p_room_id and user_id = p_user_id and is_admin = true
    ) then
      raise exception 'GM_MUST_BE_PREPARED_AS_ADMIN';
    end if;
    update public.multiplayer_members
    set role = 'player'
    where room_id = p_room_id and role = 'gm' and user_id <> p_user_id;

    update public.multiplayer_rooms
    set host_user_id = p_user_id, updated_at = now()
    where id = p_room_id;
  elsif v_current_gm = p_user_id then
    raise exception 'GM_TRANSFER_REQUIRED';
  end if;

  update public.multiplayer_members
  set role = p_role,
      character_id = case when p_role = 'player' then character_id else null end
  where room_id = p_room_id and user_id = p_user_id;
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
  if not public.is_multiplayer_host(p_room_id)
    and not public.is_multiplayer_admin(p_room_id) then
    raise exception 'PERMISSION_DENIED';
  end if;
  select role into v_target_role
  from public.multiplayer_members
  where room_id = p_room_id and user_id = p_user_id;
  if not found or v_target_role <> 'player' then
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

create or replace function public.set_multiplayer_member_admin(
  p_room_id uuid,
  p_user_id uuid,
  p_is_admin boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_multiplayer_admin(p_room_id) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not coalesce(p_is_admin, false)
    and exists (
      select 1 from public.multiplayer_members
      where room_id = p_room_id and user_id = p_user_id and is_admin = true
    )
    and (select count(*) from public.multiplayer_members where room_id = p_room_id and is_admin = true) <= 1 then
    raise exception 'LAST_ADMIN_REQUIRED';
  end if;

  update public.multiplayer_members
  set is_admin = coalesce(p_is_admin, false)
  where room_id = p_room_id and user_id = p_user_id;
  return found;
end;
$$;

drop function if exists public.submit_multiplayer_character_request(uuid, text, uuid, jsonb);
create function public.submit_multiplayer_character_request(
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
  if not found or v_member.role <> 'player' or v_member.character_id is not null then
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

drop function if exists public.submit_multiplayer_turn(uuid, text, jsonb, text, text, text, text);
create function public.submit_multiplayer_turn(
  p_room_id uuid,
  p_content text,
  p_actions jsonb default '[]'::jsonb,
  p_kind text default 'narrative',
  p_check_request_id text default null,
  p_communication_channel text default 'oral',
  p_communication_language_id text default 'commun'
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
    select 1 from public.multiplayer_rooms where id = p_room_id and status <> 'closed'
  ) then raise exception 'ROOM_CLOSED'; end if;
  if jsonb_typeof(p_actions) <> 'array'
    or jsonb_array_length(p_actions) > 2
    or pg_column_size(p_actions) > 65536 then
    raise exception 'INVALID_ACTIONS';
  end if;
  if p_kind not in ('narrative', 'playerCheck') then raise exception 'INVALID_TURN_KIND'; end if;
  if p_kind = 'playerCheck' and nullif(trim(p_check_request_id), '') is null then
    raise exception 'CHECK_REQUEST_REQUIRED';
  end if;
  if p_check_request_id is not null and char_length(p_check_request_id) > 160 then
    raise exception 'CHECK_REQUEST_TOO_LONG';
  end if;
  if p_kind = 'narrative'
    and char_length(trim(coalesce(p_content, ''))) = 0
    and jsonb_array_length(p_actions) = 0 then
    raise exception 'EMPTY_TURN';
  end if;
  if p_communication_channel not in ('oral', 'written') then
    raise exception 'INVALID_COMMUNICATION_CHANNEL';
  end if;
  if trim(coalesce(p_communication_language_id, '')) !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception 'INVALID_COMMUNICATION_LANGUAGE';
  end if;

  insert into public.multiplayer_turns(
    room_id, user_id, character_id, kind, check_request_id, content, actions,
    communication_channel, communication_language_id
  ) values (
    p_room_id, auth.uid(), v_member.character_id, p_kind,
    nullif(trim(p_check_request_id), ''), left(trim(coalesce(p_content, '')), 4000), p_actions,
    p_communication_channel, trim(p_communication_language_id)
  ) returning * into v_turn;
  return next v_turn;
exception when unique_violation then
  raise exception 'TURN_ALREADY_PENDING';
end;
$$;

revoke all on function public.set_multiplayer_member_admin(uuid, uuid, boolean) from public;
grant execute on function public.set_multiplayer_member_admin(uuid, uuid, boolean) to authenticated;
revoke all on function public.assign_multiplayer_character(uuid, uuid, text) from public;
grant execute on function public.assign_multiplayer_character(uuid, uuid, text) to authenticated;
revoke all on function public.set_multiplayer_member_role(uuid, uuid, text) from public;
grant execute on function public.set_multiplayer_member_role(uuid, uuid, text) to authenticated;
revoke all on function public.submit_multiplayer_character_request(uuid, text, uuid, jsonb) from public;
grant execute on function public.submit_multiplayer_character_request(uuid, text, uuid, jsonb) to authenticated;
revoke all on function public.submit_multiplayer_turn(uuid, text, jsonb, text, text, text, text) from public;
grant execute on function public.submit_multiplayer_turn(uuid, text, jsonb, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
