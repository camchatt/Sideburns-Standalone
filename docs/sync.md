# Deferred synchronization

Status: **client outbox + SyncService implemented**. Remote schema remains local/reviewable until hosted apply is explicitly approved (`docs/supabase-backend.md`).

## Principles

- IndexedDB is the immediate source of truth while the user is in session.
- Local entity writes and outbox enqueue share one IndexedDB transaction when possible.
- Every outbox row has a stable `id` and matching `idempotencyKey` (sent as `client_operation_id`).
- Mark `synced` only after an explicit remote receipt from `apply_sync_operation`.
- Never silently discard `failed` or `conflict` rows — preserve local (+ optional remote) payloads.
- Sync UI is visible and non-blocking (`/sync-status`, field status pill).
- Opportunistic drain on: app start, `window.online`, auth session available, and explicit user retry.
- Do **not** rely solely on the Background Sync API (inconsistent on iOS).
- Sample mode (`VITE_DATA_PROVIDER=sample`) stays fully usable with no credentials; remote apply is disabled.

## Provider selection honesty

| Field | Meaning |
|-------|---------|
| `dataProviderId` | Configured env selection (`sample` \| `supabase`) |
| `catalogSource` / `eventData.source` | Actual catalog provider (today: `sample` / local packs — never claim live Supabase rows) |
| `syncBackend` | `none` or `supabase` when credentials enable remote outbox apply |
| `remoteSyncEnabled` | True only when supabase mode + URL + publishable key |

`VITE_DATA_PROVIDER=supabase` enables the **sync backend**. Explore/Nearby/Create still read local sample/pack/IndexedDB data.

## Outbox shape

Store: IndexedDB `syncOutbox` (database version **6**).

Statuses: `pending` → `syncing` → `synced` | `failed` | `conflict`.

Remote operation types: `sidequest.*`, `progress.*`, `completion.*`.  
`pack.download` is local-only and must not call the RPC.

## Backoff and retries

- Retryable errors (network, 5xx, 429): `failed` + `nextAttemptAt` via bounded exponential backoff with full jitter (1s base, 5m cap).
- Non-retryable (auth, validation, forbidden): `failed` with `nextAttemptAt: null` — manual retry only.
- Conflicts: `conflict` with preserved `conflict.localPayload` / optional `remotePayload` — never auto-discarded.

## Auth

Optional anonymous Supabase session (`AuthProvider.signInAnonymously`) when sync backend is supabase. Signing out **preserves** the outbox; drain pauses until a session returns.

## Key modules

| Module | Role |
|--------|------|
| `src/features/sync/repositories/indexedDbSyncRepository.ts` | Persistent outbox |
| `src/features/sync/services/syncService.ts` | Drain, ack, backoff, triggers |
| `src/features/sync/providers/supabaseRemoteSyncAdapter.ts` | RPC adapter (DTO → domain receipt) |
| `src/features/sync/utils/atomicEnqueue.ts` | Entity + outbox transactions |
| `src/features/sync/components/SyncStatusPanel.tsx` | Non-blocking status UI |

## Deployment note

Client sync can run against a **local** Supabase stack. Hosted migration apply and production writes still require explicit approval — see `docs/supabase-backend.md`.
