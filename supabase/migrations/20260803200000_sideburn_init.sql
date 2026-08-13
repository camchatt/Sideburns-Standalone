-- SIDEBURNS dedicated backend (independent of Artelier).
-- Smallest syncable schema: profiles, public pack catalog metadata,
-- private user sidequests / progress / completions, and idempotent sync receipts.
--
-- Do NOT apply to a remote project without explicit approval.
-- Pack file blobs and PMTiles stay outside Postgres (CDN / IndexedDB / Cache Storage).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_not_deleted(deleted_at timestamptz)
returns boolean
language sql
immutable
as $$
  select deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
-- profiles (auth.users extension; private to owner)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_anonymous boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, is_anonymous)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', null),
    coalesce((new.raw_app_meta_data ->> 'provider') = 'anonymous', new.email is null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- event_packs (PUBLIC catalog metadata only — not user-generated content)
-- Blobs are never stored here. Clients download via catalog_url / static hosts.
-- ---------------------------------------------------------------------------

create table public.event_packs (
  pack_id text primary key,
  name text not null,
  event_year integer,
  format_version text not null,
  content_version text not null,
  catalog_url text,
  total_byte_size bigint check (total_byte_size is null or total_byte_size >= 0),
  map_package_id text,
  is_published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create trigger event_packs_set_updated_at
before update on public.event_packs
for each row
execute function public.set_updated_at();

create index event_packs_published_updated_idx
  on public.event_packs (updated_at desc)
  where deleted_at is null and is_published = true;

create index event_packs_event_year_idx
  on public.event_packs (event_year desc nulls last)
  where deleted_at is null and is_published = true;

-- ---------------------------------------------------------------------------
-- user_sidequests (PRIVATE user-authored records)
-- Client stable ids (e.g. sq_local_<uuid>) are primary keys for idempotent upsert.
-- Official/pack sidequests are NOT stored in this table.
-- ---------------------------------------------------------------------------

create table public.user_sidequests (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text not null default '',
  latitude double precision not null check (latitude >= -90 and latitude <= 90),
  longitude double precision not null check (longitude >= -180 and longitude <= 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  altitude_meters double precision,
  radius_meters double precision not null check (radius_meters > 0),
  category text not null check (
    category in ('art', 'camp', 'performance', 'service', 'explore', 'other')
  ),
  availability text not null check (
    availability in ('always', 'daytime', 'nighttime', 'scheduled', 'unknown')
  ),
  difficulty text not null check (
    difficulty in ('easy', 'moderate', 'challenging', 'unknown')
  ),
  placement_kind text not null default 'exact' check (
    placement_kind in ('exact', 'approximate')
  ),
  completion_rule text not null default 'open' check (
    completion_rule in ('open', 'proximity')
  ),
  -- Optional association to a downloaded pack id; never a FK into pack blob stores.
  pack_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create trigger user_sidequests_set_updated_at
before update on public.user_sidequests
for each row
execute function public.set_updated_at();

create index user_sidequests_owner_updated_idx
  on public.user_sidequests (owner_id, updated_at desc);

create index user_sidequests_owner_alive_idx
  on public.user_sidequests (owner_id)
  where deleted_at is null;

create index user_sidequests_pack_id_idx
  on public.user_sidequests (pack_id)
  where pack_id is not null and deleted_at is null;

-- Nearby / bounding-box support for owner-scoped remote queries (GPS ranking stays local-first).
create index user_sidequests_owner_lat_lon_idx
  on public.user_sidequests (owner_id, latitude, longitude)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- user_sidequest_progress (PRIVATE; one alive row per owner + sidequest)
-- sidequest_id may reference a local user quest OR a pack/sample id string.
-- ---------------------------------------------------------------------------

create table public.user_sidequest_progress (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  sidequest_id text not null,
  phase text not null check (phase in ('saved', 'in_progress', 'completed')),
  saved_at timestamptz,
  begun_at timestamptz,
  completed_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create trigger user_sidequest_progress_set_updated_at
before update on public.user_sidequest_progress
for each row
execute function public.set_updated_at();

create unique index user_sidequest_progress_owner_sidequest_alive_uidx
  on public.user_sidequest_progress (owner_id, sidequest_id)
  where deleted_at is null;

create index user_sidequest_progress_owner_updated_idx
  on public.user_sidequest_progress (owner_id, updated_at desc);

create index user_sidequest_progress_sidequest_idx
  on public.user_sidequest_progress (sidequest_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- user_quest_completions (PRIVATE; one alive row per owner + sidequest)
-- ---------------------------------------------------------------------------

create table public.user_quest_completions (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  sidequest_id text not null,
  completed_at timestamptz not null,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create trigger user_quest_completions_set_updated_at
before update on public.user_quest_completions
for each row
execute function public.set_updated_at();

create unique index user_quest_completions_owner_sidequest_alive_uidx
  on public.user_quest_completions (owner_id, sidequest_id)
  where deleted_at is null;

create index user_quest_completions_owner_updated_idx
  on public.user_quest_completions (owner_id, updated_at desc);

create index user_quest_completions_sidequest_idx
  on public.user_quest_completions (sidequest_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- sync_operation_receipts (PRIVATE idempotency ledger)
-- Local SyncOperation.id is the client_operation_id. Retries must no-op safely.
-- ---------------------------------------------------------------------------

create table public.sync_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_operation_id text not null,
  operation_type text not null check (
    operation_type in (
      'sidequest.create',
      'sidequest.update',
      'sidequest.delete',
      'progress.upsert',
      'progress.delete',
      'completion.create',
      'completion.delete'
    )
  ),
  entity_id text not null,
  entity_table text not null check (
    entity_table in (
      'user_sidequests',
      'user_sidequest_progress',
      'user_quest_completions'
    )
  ),
  payload_hash text,
  applied_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sync_operation_receipts_owner_client_op_uidx
    unique (owner_id, client_operation_id)
);

create trigger sync_operation_receipts_set_updated_at
before update on public.sync_operation_receipts
for each row
execute function public.set_updated_at();

create index sync_operation_receipts_owner_applied_idx
  on public.sync_operation_receipts (owner_id, applied_at desc);

create index sync_operation_receipts_entity_idx
  on public.sync_operation_receipts (owner_id, entity_table, entity_id);

-- ---------------------------------------------------------------------------
-- Idempotent apply RPC (server acknowledgement for outbox retries)
-- ---------------------------------------------------------------------------

create or replace function public.apply_sync_operation(
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
  soft_deleted_at timestamptz := timezone('utc', now());
begin
  if actor is null then
    raise exception 'not authenticated';
  end if;

  if p_client_operation_id is null or length(trim(p_client_operation_id)) = 0 then
    raise exception 'client_operation_id required';
  end if;

  select *
  into existing
  from public.sync_operation_receipts
  where owner_id = actor
    and client_operation_id = p_client_operation_id;

  if found then
    return existing;
  end if;

  if p_entity_table = 'user_sidequests' then
    if exists (
      select 1 from public.user_sidequests s
      where s.id = p_entity_id and s.owner_id <> actor
    ) then
      raise exception 'forbidden: sidequest owned by another user';
    end if;

    if p_operation_type in ('sidequest.create', 'sidequest.update') then
      insert into public.user_sidequests as us (
        id, owner_id, title, description,
        latitude, longitude, accuracy_meters, altitude_meters, radius_meters,
        category, availability, difficulty, placement_kind, completion_rule,
        pack_id, created_at, updated_at, deleted_at
      )
      values (
        p_entity_id,
        actor,
        p_payload ->> 'title',
        coalesce(p_payload ->> 'description', ''),
        (p_payload ->> 'latitude')::double precision,
        (p_payload ->> 'longitude')::double precision,
        nullif(p_payload ->> 'accuracy_meters', '')::double precision,
        nullif(p_payload ->> 'altitude_meters', '')::double precision,
        (p_payload ->> 'radius_meters')::double precision,
        p_payload ->> 'category',
        p_payload ->> 'availability',
        p_payload ->> 'difficulty',
        coalesce(p_payload ->> 'placement_kind', 'exact'),
        coalesce(p_payload ->> 'completion_rule', 'open'),
        nullif(p_payload ->> 'pack_id', ''),
        coalesce((p_payload ->> 'created_at')::timestamptz, timezone('utc', now())),
        coalesce((p_payload ->> 'updated_at')::timestamptz, timezone('utc', now())),
        null
      )
      on conflict (id) do update
      set
        title = excluded.title,
        description = excluded.description,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        accuracy_meters = excluded.accuracy_meters,
        altitude_meters = excluded.altitude_meters,
        radius_meters = excluded.radius_meters,
        category = excluded.category,
        availability = excluded.availability,
        difficulty = excluded.difficulty,
        placement_kind = excluded.placement_kind,
        completion_rule = excluded.completion_rule,
        pack_id = excluded.pack_id,
        updated_at = excluded.updated_at,
        deleted_at = null
      where us.owner_id = actor;
    elsif p_operation_type = 'sidequest.delete' then
      update public.user_sidequests
      set deleted_at = soft_deleted_at,
          updated_at = soft_deleted_at
      where id = p_entity_id
        and owner_id = actor
        and deleted_at is null;
    else
      raise exception 'unsupported operation for user_sidequests: %', p_operation_type;
    end if;

  elsif p_entity_table = 'user_sidequest_progress' then
    if exists (
      select 1 from public.user_sidequest_progress p
      where p.id = p_entity_id and p.owner_id <> actor
    ) then
      raise exception 'forbidden: progress owned by another user';
    end if;

    if p_operation_type = 'progress.upsert' then
      insert into public.user_sidequest_progress as up (
        id, owner_id, sidequest_id, phase,
        saved_at, begun_at, completed_at, notes,
        created_at, updated_at, deleted_at
      )
      values (
        p_entity_id,
        actor,
        p_payload ->> 'sidequest_id',
        p_payload ->> 'phase',
        nullif(p_payload ->> 'saved_at', '')::timestamptz,
        nullif(p_payload ->> 'begun_at', '')::timestamptz,
        nullif(p_payload ->> 'completed_at', '')::timestamptz,
        nullif(p_payload ->> 'notes', ''),
        coalesce((p_payload ->> 'created_at')::timestamptz, timezone('utc', now())),
        coalesce((p_payload ->> 'updated_at')::timestamptz, timezone('utc', now())),
        null
      )
      on conflict (id) do update
      set
        sidequest_id = excluded.sidequest_id,
        phase = excluded.phase,
        saved_at = excluded.saved_at,
        begun_at = excluded.begun_at,
        completed_at = excluded.completed_at,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        deleted_at = null
      where up.owner_id = actor;
    elsif p_operation_type = 'progress.delete' then
      update public.user_sidequest_progress
      set deleted_at = soft_deleted_at,
          updated_at = soft_deleted_at
      where id = p_entity_id
        and owner_id = actor
        and deleted_at is null;
    else
      raise exception 'unsupported operation for user_sidequest_progress: %', p_operation_type;
    end if;

  elsif p_entity_table = 'user_quest_completions' then
    if exists (
      select 1 from public.user_quest_completions c
      where c.id = p_entity_id and c.owner_id <> actor
    ) then
      raise exception 'forbidden: completion owned by another user';
    end if;

    if p_operation_type = 'completion.create' then
      insert into public.user_quest_completions as uc (
        id, owner_id, sidequest_id, completed_at, notes,
        created_at, updated_at, deleted_at
      )
      values (
        p_entity_id,
        actor,
        p_payload ->> 'sidequest_id',
        (p_payload ->> 'completed_at')::timestamptz,
        nullif(p_payload ->> 'notes', ''),
        coalesce((p_payload ->> 'created_at')::timestamptz, timezone('utc', now())),
        coalesce((p_payload ->> 'updated_at')::timestamptz, timezone('utc', now())),
        null
      )
      on conflict (id) do update
      set
        sidequest_id = excluded.sidequest_id,
        completed_at = excluded.completed_at,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        deleted_at = null
      where uc.owner_id = actor;
    elsif p_operation_type = 'completion.delete' then
      update public.user_quest_completions
      set deleted_at = soft_deleted_at,
          updated_at = soft_deleted_at
      where id = p_entity_id
        and owner_id = actor
        and deleted_at is null;
    else
      raise exception 'unsupported operation for user_quest_completions: %', p_operation_type;
    end if;
  else
    raise exception 'unsupported entity_table: %', p_entity_table;
  end if;

  insert into public.sync_operation_receipts (
    owner_id,
    client_operation_id,
    operation_type,
    entity_id,
    entity_table,
    payload_hash
  )
  values (
    actor,
    p_client_operation_id,
    p_operation_type,
    p_entity_id,
    p_entity_table,
    p_payload_hash
  )
  returning * into receipt;

  return receipt;
exception
  when unique_violation then
    -- Concurrent retry of the same client_operation_id: return the winner.
    select *
    into receipt
    from public.sync_operation_receipts
    where owner_id = actor
      and client_operation_id = p_client_operation_id;
    if found then
      return receipt;
    end if;
    -- Otherwise this is an entity uniqueness conflict (e.g. progress per sidequest).
    raise;
end;
$$;

revoke all on function public.apply_sync_operation(text, text, text, text, jsonb, text)
  from public;
grant execute on function public.apply_sync_operation(text, text, text, text, jsonb, text)
  to authenticated;
