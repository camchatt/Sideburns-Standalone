# SIDEBURNS Supabase backend

Status: **hosted SIDEBURNS project migrations + auth config applied** (`mxqrchnkjxgmdvswbptz`). Client sync outbox implemented (`docs/sync.md`).

Dashboard: https://supabase.com/dashboard/project/mxqrchnkjxgmdvswbptz

Verified remote public tables with RLS: `profiles`, `event_packs`, `shared_beacons`, `user_sidequests`, `user_sidequest_progress`, `user_quest_completions`, `sync_operation_receipts`. Anonymous sign-ins enabled; magic-link signup enabled with email confirmations off for prototype.

**Local CLI note:** On this OneDrive checkout, `supabase link` writing `supabase/.temp` can fail. Use a temp workdir outside OneDrive:

```powershell
$repo = Join-Path $env:TEMP "sideburn-supabase-deploy\repo"
# ensure $repo/supabase contains this repo's supabase/ files, then:
npx supabase link --project-ref mxqrchnkjxgmdvswbptz --yes --workdir $repo
npx supabase db push --linked --yes --workdir $repo
```

App `.env` (local only, never commit):

```text
VITE_SUPABASE_URL=https://mxqrchnkjxgmdvswbptz.supabase.co
VITE_SUPABASE_ANON_KEY=<anon/publishable key from Project Settings → API>
```

Keep `VITE_DATA_PROVIDER=sample` until you intentionally exercise remote sync.

SIDEBURNS uses a **dedicated** Supabase project. Do not connect to Artelier’s Supabase. Do not reuse Artelier tables, credentials, storage buckets, Edge Functions, or database routines.

## Goals

- Smallest remote schema for profiles, user sidequests, progress/completions, and idempotent sync.
- Keep official/event pack **content** outside user tables (catalog metadata only in Postgres).
- Stable client ids (`sq_local_*`, `qp_local_*`, `qc_local_*`, outbox `sync_*`).
- Soft-delete / tombstones via `deleted_at`.
- RLS on every table; private rows owner-scoped; public pack catalog read-only.
- Browser uses publishable/anon key only (`VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`).

## Mapping from local IndexedDB

| Local (IndexedDB) | Remote (Postgres) | Notes |
|-------------------|-------------------|-------|
| `sidequests` (prototype beacons) | `shared_beacons` | Public-readable; creator-only update/delete; client id is PK. |
| `packSidequests` | *(not synced as rows)* | Official content stays in versioned pack files / CDN. |
| `sidequestProgress` | `user_sidequest_progress` | Unique alive `(owner_id, sidequest_id)`. |
| `questCompletions` | `user_quest_completions` | Unique alive `(owner_id, sidequest_id)`. |
| Local outbox `SyncOperation` | `sync_operation_receipts` + sync RPCs | Receipt keyed by `(owner_id, client_operation_id)`. |
| `playaPackMeta` / files | `event_packs` (metadata only) | Blobs remain in IndexedDB / Cache Storage / static hosts. |
| Device interactions / map cache | *(out of scope v1)* | Stay device-local. |

Domain types remain in `src/features/*`. Remote snake_case rows are validated in `src/lib/supabase/remoteSchemas.ts` and mapped in `src/lib/supabase/mappers.ts`. UI must not import row schemas.

## Authentication choices

### Product default (recommended)

1. **No account required for field use.** Sample mode and local IndexedDB work offline without Supabase.
2. **Optional anonymous Supabase session** when the user explicitly enables sync / cross-device backup.
3. **Optional later link** from anonymous → email magic-link or password for recovery.

This keeps connectivity optional for core play (create / save / begin / complete / map / nearby).

### Tradeoffs

| Mode | Pros | Cons | Field fit |
|------|------|------|-----------|
| **Anonymous auth** | Instant; no email; works once online briefly to mint a session; local-first remains valid | Session recovery if storage cleared is hard without linking | Best default for desert use |
| **Magic link email** | Familiar recovery; no password | Requires inbox + connectivity at sign-in time | Poor as *required* gate; OK as optional link-up in town |
| **Email + password** | Works offline after session exists | Signup/reset needs network; password UX friction | Acceptable optional upgrade |
| **Always-required account** | Simpler server assumptions | Blocks offline-first product goal | Reject for SIDEBURNS core |

Local CLI config enables anonymous sign-ins and magic link (`supabase/config.toml`). Enabling either on a **hosted** project is a product approval item (see checklist below).

## Sync protocol (idempotent)

1. App writes locally first (IndexedDB) and enqueues `SyncOperation` with stable `id` (= `client_operation_id`).
2. When online + authenticated, client calls `apply_sync_operation(...)` with operation type, entity id, table, payload, optional payload hash.
3. Server:
   - If `(owner_id, client_operation_id)` receipt exists → return existing receipt (**retry-safe**).
   - Else apply upsert/soft-delete under RLS, insert receipt, return it.
4. Client marks local outbox `synced` only after receipt acknowledgement.
5. Conflicts (unique alive progress/completion with mismatched ids, ownership violations) surface as failed/conflict outbox rows — never silent discard.

Supported remote operation types:

- `sidequest.create` / `sidequest.update` / `sidequest.delete`
- `progress.upsert` / `progress.delete`
- `completion.create` / `completion.delete`

`pack.download` stays **local-only** and must not call the RPC.

## Public vs private data

| Surface | Access |
|---------|--------|
| `event_packs` where `is_published` and not deleted | `SELECT` for `anon` + `authenticated` |
| `event_packs` writes | Service role / dashboard only (no browser policies) |
| `profiles`, `user_*`, `sync_operation_receipts` | Owner-only via `auth.uid()` |
| Official pack sidequest bodies | Not in Postgres v1 (pack files) |

Community-shared / globally readable **user** sidequests are **not** in this schema. That needs a separate product decision (visibility column + policies).

## Environment (browser-safe)

Validated by Zod in `src/lib/validation/env.ts`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_DATA_PROVIDER=supabase` requires URL + publishable key
- `VITE_SUPABASE_SERVICE_ROLE_KEY` is **forbidden** if present
- Publishable slots reject JWTs whose `role` is `service_role`

Never commit real keys. Never put service-role keys in `VITE_*`.

## Local Supabase CLI setup

Prerequisites: Docker Desktop, [Supabase CLI](https://supabase.com/docs/guides/cli).

```powershell
# From repo root
supabase start
supabase db reset   # applies migrations + seed.sql locally only
supabase status     # prints local URL + anon key for .env
```

Point a **local** `.env` (never commit):

```text
VITE_DATA_PROVIDER=sample
# Optional while developing adapters against local stack:
# VITE_SUPABASE_URL=http://127.0.0.1:54321
# VITE_SUPABASE_ANON_KEY=<anon key from supabase status>
```

Keep `VITE_DATA_PROVIDER=sample` for normal prototype work. When exercising sync against a local stack, set `VITE_DATA_PROVIDER=supabase` with local URL + anon key; catalog reads remain sample/local (`catalogSource`) while `syncBackend` becomes `supabase`.

Stop local stack:

```powershell
supabase stop
```

### Schema / policy tests in this toolchain

- Static migration contract: `src/lib/supabase/migrations.contract.test.ts` (Vitest).
- Remote DTO ↔ domain mappers: `src/lib/supabase/mappers.test.ts`.
- Env service-role rejection: `src/lib/validation/env.test.ts`.

Optional later (not required to ship these files): `supabase db test` / pgTAP against local Postgres after `supabase start`. Do not treat remote RLS as verified until that (or equivalent) runs with approval.

## Safe deployment checklist (hosted)

Do **not** run these against production/shared projects without explicit approval.

1. Create a **new** SIDEBURNS Supabase project (not Artelier).
2. Confirm project ref, URL, and anon key are SIDEBURNS-only.
3. Review migrations in `supabase/migrations/` (init + RLS).
4. Decide auth settings on the hosted project (anonymous, magic link, email confirmations).
5. `supabase link` only to the SIDEBURNS project after approval.
6. Apply migrations with an approved command (`supabase db push` or CI with protected secrets).
7. Verify RLS in Studio: second user cannot read/write first user’s rows; anon can only read published `event_packs`.
8. Configure app `.env` with URL + **anon** key only; confirm Field Status shows `supabase sync · catalog sample` (honest selection).
9. Confirm sync status UI can pause without auth, preserve outbox across sign-out, and require receipt ack (see `docs/sync.md`).
10. Confirm no service-role key exists in any `VITE_*` or committed file.

## Rollback considerations

- Prefer **forward** migrations (fix policies/functions; add columns) over destructive drops.
- Soft-deletes (`deleted_at`) allow undelete without dropping tables.
- Do **not** run `drop table` / `delete from auth.users` / storage wipes on remote without an explicit rollback plan and approval.
- If a bad migration reaches remote: ship a compensating migration; avoid `db reset` on shared environments.
- Local-only recovery: `supabase db reset` rebuilds from migrations (destroys local DB data only).

## Files

```text
supabase/config.toml
supabase/seed.sql
supabase/migrations/20260803200000_sideburn_init.sql
supabase/migrations/20260803200100_sideburn_rls.sql
src/lib/supabase/migrations.contract.test.ts
src/lib/supabase/remoteSchemas.ts
src/lib/supabase/mappers.ts
src/lib/supabase/client.ts
src/features/sync/*
docs/supabase-backend.md
docs/sync.md
```

## Decisions — product approval status

**Approved (2026-08-03)** for SIDEBURNS-dedicated hosted deploy when a new project exists:

1. Create / link a **new SIDEBURNS** Supabase project (never Artelier).
2. Apply migrations remotely after link (`db push` / approved CI).
3. Enable **anonymous auth** on the hosted project.
4. Enable **magic-link** with production site URL / redirect allow-list (optional email confirmations can stay off for prototype).
5. Keep `event_packs` empty until an explicit publish workflow (no casual seed publish).
6. **No** community-visible user sidequests in v1 (owner-private only).
7. **Conflict policy:** last-write-wins via `apply_sync_operation` upsert; client keeps conflict outbox rows for user-visible recovery.
8. **Account linking:** anonymous first; email/magic-link upgrade is optional later UX (not required for field use).
9. Retention / erasure: follow [`docs/privacy-and-deletion.md`](./privacy-and-deletion.md); self-serve purge UI still later.
10. **Map placements:** keep `burning_man_public_projects` as a separate optional read source for now — do **not** import Artelier schemas into the SIDEBURNS project casually.

**Blocked until you provide:** ~~a SIDEBURNS project ref~~ → applied to [`mxqrchnkjxgmdvswbptz`](https://supabase.com/dashboard/project/mxqrchnkjxgmdvswbptz) on 2026-08-03. Artelier MCP must not be used for this project.

## Out of scope for this design drop (historical)

The following were out of scope for the schema-only drop and are now partially landed in the client:

- ~~Implementing the live sync worker / IndexedDB outbox persistence.~~ → see `docs/sync.md`
- Remote execution of migrations (still requires approval).
- Bluetooth or Capacitor auth stores.
- Renaming IndexedDB `artelier-playa`.
