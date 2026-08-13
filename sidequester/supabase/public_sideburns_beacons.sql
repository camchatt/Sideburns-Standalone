-- Public UGC pins: no Supabase Auth / no login required.
-- App talks to this table with the publishable (anon) key only.
--
-- Run in: Supabase Dashboard → project mxqrchnkjxgmdvswbptz → SQL Editor → New query
-- Paste this whole file → Run.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete
  on table public.sideburns_beacons
  to anon, authenticated;

alter table public.sideburns_beacons enable row level security;

drop policy if exists "Public read sideburns_beacons" on public.sideburns_beacons;
drop policy if exists "Public insert sideburns_beacons" on public.sideburns_beacons;
drop policy if exists "Public update sideburns_beacons" on public.sideburns_beacons;
drop policy if exists "Public delete sideburns_beacons" on public.sideburns_beacons;
-- Older names from dashboard experiments
drop policy if exists "Enable read access for all users" on public.sideburns_beacons;
drop policy if exists "Enable insert for authenticated users only" on public.sideburns_beacons;
drop policy if exists "Enable insert for users based on user_id" on public.sideburns_beacons;
drop policy if exists "Enable update for users based on email" on public.sideburns_beacons;
drop policy if exists "Enable delete for users based on user_id" on public.sideburns_beacons;

create policy "Public read sideburns_beacons"
  on public.sideburns_beacons
  for select
  to anon, authenticated
  using (true);

create policy "Public insert sideburns_beacons"
  on public.sideburns_beacons
  for insert
  to anon, authenticated
  with check (true);

create policy "Public update sideburns_beacons"
  on public.sideburns_beacons
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- Anyone with the publishable key can delete (same as today's open table).
-- Owner-only delete is enforced in the app via created_by device id.
create policy "Public delete sideburns_beacons"
  on public.sideburns_beacons
  for delete
  to anon, authenticated
  using (true);
