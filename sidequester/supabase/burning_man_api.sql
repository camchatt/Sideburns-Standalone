-- Burning Man Public API storage and embargo-safe public views.
-- Run this file in the Supabase SQL editor before deploying the importer.
--
-- Raw records are intentionally kept in a public-schema table because Supabase
-- Edge Functions can write to it without exposing an additional PostgREST
-- schema. RLS plus revoked grants keep it inaccessible to app clients.

create table if not exists public.burning_man_api_records (
  record_type text not null check (record_type in ('art', 'camp', 'event', 'mv')),
  event_year integer not null check (event_year > 2000),
  uid text not null,
  payload jsonb not null,
  source_retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (record_type, event_year, uid)
);

alter table public.burning_man_api_records enable row level security;
revoke all on table public.burning_man_api_records from anon, authenticated;

create index if not exists burning_man_api_records_year_type_idx
  on public.burning_man_api_records (event_year desc, record_type);

-- Null timestamps mean "not released". This deliberately fails closed.
create table if not exists public.burning_man_release_schedule (
  event_year integer primary key check (event_year > 2000),
  art_location_release_at timestamptz null,
  camp_location_release_at timestamptz null,
  notes text null,
  updated_at timestamptz not null default now()
);

-- `create table if not exists` does not update a pre-existing table. Keep the
-- setup script rerunnable when an earlier version of this table already exists.
alter table public.burning_man_release_schedule
  add column if not exists art_location_release_at timestamptz null,
  add column if not exists camp_location_release_at timestamptz null,
  add column if not exists notes text null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.burning_man_release_schedule enable row level security;
revoke all on table public.burning_man_release_schedule from anon, authenticated;

-- Only the two location fields identified by Burning Man are redacted. The raw
-- payload never leaves the protected base table before its applicable release.
create or replace view public.burning_man_api_public
with (security_barrier = true)
as
select
  r.record_type,
  r.event_year,
  r.uid,
  case
    when r.record_type = 'art'
      and r.event_year >= extract(year from now())::integer
      and (
        s.art_location_release_at is null
        or now() < s.art_location_release_at
      )
      then (r.payload - 'location' - 'location_string')
    when r.record_type = 'camp'
      and r.event_year >= extract(year from now())::integer
      and (
        s.camp_location_release_at is null
        or now() < s.camp_location_release_at
      )
      then (r.payload - 'location' - 'location_string')
    else r.payload
  end as payload,
  r.source_retrieved_at,
  case
    when r.event_year < extract(year from now())::integer then true
    when r.record_type = 'art' then
      s.art_location_release_at is not null and now() >= s.art_location_release_at
    when r.record_type = 'camp' then
      s.camp_location_release_at is not null and now() >= s.camp_location_release_at
    else true
  end as location_released
from public.burning_man_api_records r
left join public.burning_man_release_schedule s using (event_year);

revoke all on table public.burning_man_api_public from public;
grant select on table public.burning_man_api_public to anon, authenticated;

comment on view public.burning_man_api_public is
  'Official Burning Man API records with current-year art and camp locations removed until explicitly released.';

-- Set release times only after confirming them with Burning Man. Example:
-- insert into public.burning_man_release_schedule (
--   event_year, art_location_release_at, camp_location_release_at, notes
-- ) values (
--   2026,
--   'YYYY-MM-DD HH:MM:SS America/Los_Angeles',
--   'YYYY-MM-DD 00:01:00 America/Los_Angeles',
--   'Confirmed from official 2026 gate/build-week schedule'
-- ) on conflict (event_year) do update set
--   art_location_release_at = excluded.art_location_release_at,
--   camp_location_release_at = excluded.camp_location_release_at,
--   notes = excluded.notes,
--   updated_at = now();

