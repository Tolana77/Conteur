-- Transporte la langue et le canal sans exposer l'intention privée aux autres joueurs.
alter table public.multiplayer_turns
  add column if not exists communication_channel text not null default 'oral',
  add column if not exists communication_language_id text not null default 'commun';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'multiplayer_turns_communication_channel_check'
  ) then
    alter table public.multiplayer_turns
      add constraint multiplayer_turns_communication_channel_check
      check (communication_channel in ('oral', 'written'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'multiplayer_turns_communication_language_id_check'
  ) then
    alter table public.multiplayer_turns
      add constraint multiplayer_turns_communication_language_id_check
      check (communication_language_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$');
  end if;
end;
$$;

drop function if exists public.submit_multiplayer_turn(uuid, text, jsonb, text, text);
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

revoke all on function public.submit_multiplayer_turn(uuid, text, jsonb, text, text, text, text) from public;
grant execute on function public.submit_multiplayer_turn(uuid, text, jsonb, text, text, text, text) to authenticated;
