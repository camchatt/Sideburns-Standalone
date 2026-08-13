-- Public, user-authored prototype beacons. Personal quest progress remains private.

create table public.shared_beacons (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  altitude_meters double precision,
  radius_meters double precision not null default 30 check (radius_meters > 0),
  category text not null check (category in ('art','camp','performance','service','explore','other')),
  availability text not null default 'always' check (availability in ('always','daytime','nighttime','scheduled','unknown')),
  difficulty text not null default 'easy' check (difficulty in ('easy','moderate','challenging','unknown')),
  placement_kind text not null default 'exact' check (placement_kind in ('exact','approximate')),
  completion_rule text not null default 'open' check (completion_rule in ('open','proximity')),
  beacon_kind text check (beacon_kind is null or beacon_kind in ('food','get_weird','do_good')),
  presenter text check (presenter is null or length(presenter) <= 120),
  reward text check (reward is null or length(reward) <= 240),
  live_pin boolean not null default false,
  test_area_id text check (test_area_id is null or test_area_id in ('black-rock-city','winthrop')),
  pack_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create trigger shared_beacons_set_updated_at
before update on public.shared_beacons
for each row execute function public.set_updated_at();

create index shared_beacons_alive_updated_idx
  on public.shared_beacons (updated_at desc) where deleted_at is null;
create index shared_beacons_area_idx
  on public.shared_beacons (test_area_id, updated_at desc) where deleted_at is null;

alter table public.shared_beacons enable row level security;

create policy shared_beacons_select_public
  on public.shared_beacons for select to anon, authenticated
  using (deleted_at is null);
create policy shared_beacons_insert_own
  on public.shared_beacons for insert to authenticated
  with check (owner_id = (select auth.uid()) and deleted_at is null);
create policy shared_beacons_update_own
  on public.shared_beacons for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy shared_beacons_delete_own
  on public.shared_beacons for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.sync_operation_receipts
  drop constraint sync_operation_receipts_entity_table_check;
alter table public.sync_operation_receipts
  add constraint sync_operation_receipts_entity_table_check check (
    entity_table in ('shared_beacons','user_sidequests','user_sidequest_progress','user_quest_completions')
  );

create or replace function public.apply_shared_beacon_operation(
  p_client_operation_id text,
  p_operation_type text,
  p_entity_id text,
  p_entity_table text,
  p_payload jsonb,
  p_payload_hash text default null
)
returns public.sync_operation_receipts
language plpgsql
security invoker
set search_path = public
as $$
declare
  existing public.sync_operation_receipts;
  actor uuid := auth.uid();
  receipt public.sync_operation_receipts;
  applied timestamptz := timezone('utc', now());
begin
  if actor is null then raise exception 'not authenticated'; end if;
  if p_entity_table <> 'shared_beacons' then raise exception 'unsupported entity table: %', p_entity_table; end if;

  select * into existing from public.sync_operation_receipts
    where owner_id = actor and client_operation_id = p_client_operation_id;
  if found then return existing; end if;

  if exists (select 1 from public.shared_beacons where id = p_entity_id and owner_id <> actor) then
    raise exception 'forbidden: beacon owned by another user';
  end if;

  if p_operation_type in ('sidequest.create', 'sidequest.update') then
    insert into public.shared_beacons as sb (
      id, owner_id, title, description, latitude, longitude, accuracy_meters,
      altitude_meters, radius_meters, category, availability, difficulty,
      placement_kind, completion_rule, beacon_kind, presenter, reward, live_pin,
      test_area_id, pack_id, created_at, updated_at, deleted_at
    ) values (
      p_entity_id, actor, p_payload->>'title', coalesce(p_payload->>'description',''),
      (p_payload->>'latitude')::double precision, (p_payload->>'longitude')::double precision,
      nullif(p_payload->>'accuracy_meters','')::double precision,
      nullif(p_payload->>'altitude_meters','')::double precision,
      (p_payload->>'radius_meters')::double precision, p_payload->>'category',
      p_payload->>'availability', p_payload->>'difficulty',
      coalesce(p_payload->>'placement_kind','exact'), coalesce(p_payload->>'completion_rule','open'),
      nullif(p_payload->>'beacon_kind',''), nullif(p_payload->>'presenter',''),
      nullif(p_payload->>'reward',''), coalesce((p_payload->>'live_pin')::boolean,false),
      nullif(p_payload->>'test_area_id',''), nullif(p_payload->>'pack_id',''),
      coalesce((p_payload->>'created_at')::timestamptz, applied),
      coalesce((p_payload->>'updated_at')::timestamptz, applied), null
    ) on conflict (id) do update set
      title=excluded.title, description=excluded.description, latitude=excluded.latitude,
      longitude=excluded.longitude, accuracy_meters=excluded.accuracy_meters,
      altitude_meters=excluded.altitude_meters, radius_meters=excluded.radius_meters,
      category=excluded.category, availability=excluded.availability,
      difficulty=excluded.difficulty, placement_kind=excluded.placement_kind,
      completion_rule=excluded.completion_rule, beacon_kind=excluded.beacon_kind,
      presenter=excluded.presenter, reward=excluded.reward, live_pin=excluded.live_pin,
      test_area_id=excluded.test_area_id, pack_id=excluded.pack_id,
      updated_at=excluded.updated_at, deleted_at=null
    where sb.owner_id = actor;
  elsif p_operation_type = 'sidequest.delete' then
    update public.shared_beacons set deleted_at=applied, updated_at=applied
      where id=p_entity_id and owner_id=actor and deleted_at is null;
  else
    raise exception 'unsupported shared beacon operation: %', p_operation_type;
  end if;

  insert into public.sync_operation_receipts (
    owner_id, client_operation_id, operation_type, entity_id, entity_table, payload_hash, applied_at
  ) values (actor, p_client_operation_id, p_operation_type, p_entity_id, p_entity_table, p_payload_hash, applied)
  returning * into receipt;
  return receipt;
exception when unique_violation then
  select * into receipt from public.sync_operation_receipts
    where owner_id=actor and client_operation_id=p_client_operation_id;
  if found then return receipt; end if;
  raise;
end;
$$;

revoke all on function public.apply_shared_beacon_operation(text,text,text,text,jsonb,text) from public;
grant execute on function public.apply_shared_beacon_operation(text,text,text,text,jsonb,text) to authenticated;
