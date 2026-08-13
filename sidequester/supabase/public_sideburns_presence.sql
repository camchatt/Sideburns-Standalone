-- Live friend GPS via short device share codes (no Supabase Auth).
-- Run in: Supabase Dashboard → project mxqrchnkjxgmdvswbptz → SQL Editor

create table if not exists public.sideburns_presence (
  device_id text primary key,
  share_code text not null unique,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now(),
  label text null
);

create index if not exists sideburns_presence_share_code_idx
  on public.sideburns_presence (share_code);

create index if not exists sideburns_presence_updated_at_idx
  on public.sideburns_presence (updated_at desc);

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete
  on table public.sideburns_presence
  to anon, authenticated;

alter table public.sideburns_presence enable row level security;

drop policy if exists "Public read sideburns_presence" on public.sideburns_presence;
drop policy if exists "Public upsert sideburns_presence" on public.sideburns_presence;
drop policy if exists "Public update sideburns_presence" on public.sideburns_presence;
drop policy if exists "Public delete sideburns_presence" on public.sideburns_presence;

create policy "Public read sideburns_presence"
  on public.sideburns_presence
  for select
  to anon, authenticated
  using (true);

create policy "Public insert sideburns_presence"
  on public.sideburns_presence
  for insert
  to anon, authenticated
  with check (true);

create policy "Public update sideburns_presence"
  on public.sideburns_presence
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "Public delete sideburns_presence"
  on public.sideburns_presence
  for delete
  to anon, authenticated
  using (true);
