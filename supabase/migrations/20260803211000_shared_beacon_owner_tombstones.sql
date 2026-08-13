-- UPDATE also evaluates SELECT visibility. Let owners see their own tombstones so
-- soft deletion can complete, while anonymous/other users still see alive rows only.
create policy shared_beacons_select_own
  on public.shared_beacons for select to authenticated
  using (owner_id = (select auth.uid()));

-- Remove only temporary records created by the deployment smoke test.
update public.shared_beacons
set deleted_at = timezone('utc', now()), updated_at = timezone('utc', now())
where id in ('sq_local_smoke_shared_20260803', 'sq_local_smoke_debug_20260803');
