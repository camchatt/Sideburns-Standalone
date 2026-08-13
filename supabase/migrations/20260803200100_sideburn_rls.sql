-- Row Level Security for SIDEBURNS user data and public pack catalog.
-- Every user-data table has RLS enabled. Clients use the publishable/anon key only;
-- service_role must never ship in VITE_* / browser bundles.

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.event_packs enable row level security;
alter table public.user_sidequests enable row level security;
alter table public.user_sidequest_progress enable row level security;
alter table public.user_quest_completions enable row level security;
alter table public.sync_operation_receipts enable row level security;

-- ---------------------------------------------------------------------------
-- profiles — private to owner
-- ---------------------------------------------------------------------------

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Inserts come from the security-definer auth trigger only.
-- No authenticated insert policy on purpose.

-- ---------------------------------------------------------------------------
-- event_packs — intentionally public/readable when published; no client writes
-- ---------------------------------------------------------------------------

create policy event_packs_select_published
  on public.event_packs
  for select
  to anon, authenticated
  using (is_published = true and deleted_at is null);

-- No insert/update/delete policies for anon/authenticated.
-- Catalog publishes use the dashboard / service role outside the browser.

-- ---------------------------------------------------------------------------
-- user_sidequests — owner-only CRUD (soft-delete via update)
-- ---------------------------------------------------------------------------

create policy user_sidequests_select_own
  on public.user_sidequests
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy user_sidequests_insert_own
  on public.user_sidequests
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy user_sidequests_update_own
  on public.user_sidequests
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy user_sidequests_delete_own
  on public.user_sidequests
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- user_sidequest_progress — owner-only
-- ---------------------------------------------------------------------------

create policy user_sidequest_progress_select_own
  on public.user_sidequest_progress
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy user_sidequest_progress_insert_own
  on public.user_sidequest_progress
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy user_sidequest_progress_update_own
  on public.user_sidequest_progress
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy user_sidequest_progress_delete_own
  on public.user_sidequest_progress
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- user_quest_completions — owner-only
-- ---------------------------------------------------------------------------

create policy user_quest_completions_select_own
  on public.user_quest_completions
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy user_quest_completions_insert_own
  on public.user_quest_completions
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy user_quest_completions_update_own
  on public.user_quest_completions
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy user_quest_completions_delete_own
  on public.user_quest_completions
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- sync_operation_receipts — owner can read/insert own; no client updates/deletes
-- Updates would break idempotency history. Soft application state lives on entities.
-- ---------------------------------------------------------------------------

create policy sync_operation_receipts_select_own
  on public.sync_operation_receipts
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy sync_operation_receipts_insert_own
  on public.sync_operation_receipts
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));
