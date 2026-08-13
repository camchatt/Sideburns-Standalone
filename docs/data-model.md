# Data model (preliminary)

No irreversible SIDEBURNS-specific database migrations ship casually. This document describes **domain** entities and intended relationships.

## Core entities

### Sidequest

User-created field beacons reuse this local-first entity and may carry an optional validated `beaconKind` (`food`, `medical`, `bike`, `restroom`, or `massage`), presenter, reward, live-pin flag, and test-area id. Records without a beacon kind remain completable sidequests. Hard delete of local beacons remains restricted to `origin: local` rows in the repository; the map detail UI only shows **Remove beacon** when `creatorId` matches the device’s anonymous local identity. Legacy local rows without `creatorId` do not show Remove (ownership is not assumed). Sample or pack content uses a reversible local dismissal in the interaction overlay without modifying pack data.

In hosted prototype mode, user-created beacons synchronize to `shared_beacons`. Active rows are public-readable so other testers see them; updates and soft-deletion remain restricted to the anonymous or linked account that created the record. Profiles, progress, and completions remain private. Local `creatorId` / `creatorDisplayName` are stamped on create for on-device attribution; remote SQL columns for those fields are not required for this release (presenter continues to sync).

User- or pack-authored place-based activity.

| Field | Notes |
|-------|-------|
| `id` | Stable string id (`sq_local_<uuid>` for device creates; pack/sample ids otherwise) |
| `title` | Required |
| `description` | Optional |
| `location` | `Coordinates` |
| `radiusMeters` | Trigger / nearby / proximity-completion radius |
| `category` | `QuestCategory` |
| `availability` | `QuestAvailability` |
| `difficulty` | `QuestDifficulty` |
| `createdAt` / `updatedAt` | ISO timestamps |
| `syncStatus` | Local sync marker (`local_only` \| `pending` \| `synced` \| `conflict`) |
| `packId` | Optional originating pack id (null for pure local creates) |
| `placementKind` | Optional `exact` \| `approximate` (default `exact`) |
| `origin` | Storage provenance for UI: `local` \| `pack` \| `sample` (never expose IndexedDB store names) |
| `contentOrigin` | Semantic authorship: `user` \| `infrastructure` (inferred from `origin` when missing; post age only for user Food/Sidequest) |
| `creatorId` / `creatorDisplayName` | Optional; stamped from anonymous `LocalUserIdentity` on create |
| `completionRule` | `open` (default; no GPS) \| `proximity` (usable fix inside `radiusMeters`) |

User-created sidequests persist in IndexedDB store `sidequests`. Official pack sidequests live in `packSidequests` and are replaced on pack activation/removal **without** touching user rows. UI distinguishes storage provenance via `origin` and semantic authorship via `contentOrigin`.

### LocalUserIdentity

Anonymous, passwordless local identity (IndexedDB `localUserIdentity`, schema v7). Stable `id` from `crypto.randomUUID()`, editable `displayName`, `createdAt` / `updatedAt`. Distinct from optional Supabase `AuthSession` used for sync.

### Coordinates

`latitude`, `longitude`, optional `accuracyMeters`, optional `altitudeMeters`.

### QuestCategory / QuestAvailability / QuestDifficulty

Closed enums in `src/features/sidequests/types`. Extend via schema + docs, not silent string drift.

### SidequestProgress

Device-local lifecycle for a participant against one sidequest.

| Field | Notes |
|-------|-------|
| `id` | Stable client id (`qp_local_<uuid>`) |
| `sidequestId` | Target sidequest |
| `phase` | `saved` \| `in_progress` \| `completed` |
| `savedAt` / `begunAt` / `completedAt` | ISO timestamps (nullable by phase) |
| `notes` | Optional local notes (max 500), usually set on complete |
| `syncStatus` | `pending` \| `synced` \| `conflict` |
| `updatedAt` | ISO timestamp |

IndexedDB store `sidequestProgress` enforces one progress row per `sidequestId`. Orchestration: `SidequestLifecycleService` (`src/features/sidequests/services/sidequestLifecycleService.ts`).

### QuestCompletion

Completion artifact for a sidequest (`id` = `qc_local_<uuid>`, `sidequestId`, `completedAt`, optional `notes`, `syncStatus`). IndexedDB stores at most one completion per sidequest. Completing writes **progress + completion atomically** in one IndexedDB transaction; undo removes the completion and rolls progress back to `in_progress` or `saved`.

GPS is **not** required for completion unless `completionRule === "proximity"`. Proximity gates map denied / inaccurate / stale / unavailable / outside-radius into explicit block reasons (`evaluateCompletionGate`).

### LocationReading

Point-in-time GPS (or simulated) sample: coordinates, timestamp, permission state, accuracy, error, source.

Lifecycle / quality states (UI + proximity gating): `unsupported`, `insecure`, `prompt_required`, `denied`, `unavailable`, `acquiring`, `active`, `inaccurate`, `stale`, `simulated`. Thresholds: `LOCATION_MAX_USABLE_ACCURACY_METERS`, `LOCATION_STALE_READING_MS`.

### Sidequest placement

Optional `placementKind`: `exact` (default) or `approximate`. Approximate quests are listed on Nearby separately and are not distance-ranked as precise hits.

### Map record / field beacon

Map browse records use `recordKind: art | sidequest | beacon`. Standalone field beacons may set `markerKind: food | get_weird | do_good`; they render as categorized locations and never imply a completable sidequest. The sample provider includes a SIDEBURNS-owned **2025 art / Projects** inventory (public Burning Man placement shape, `eventYear: 2025` only), the 2025 beacon/sidequest demo inventory, and the fictional 2026 dataset. Art markers appear only when the map year filter is 2025.

### ProximityState

Derived relationship between a reading and a target (enter / exit / inside / unknown), with source `gps` | `simulated` | `bluetooth` (bluetooth unused in core).

### SyncOperation

Outbox row in IndexedDB `syncOutbox`: stable `id`, matching `idempotencyKey`, `type`, `entityId`, `entityTable`, `payload`, `payloadHash`, `status` (`pending` | `syncing` | `synced` | `failed` | `conflict`), `attemptCount`, `nextAttemptAt`, optional `conflict` snapshot, optional remote receipt fields. Remote operation types include sidequest/progress/completion mutations; `pack.download` is local-only. Protocol: [`docs/sync.md`](./sync.md). Server idempotency: [`docs/supabase-backend.md`](./supabase-backend.md).

### SyncStatus

Aggregate view for UI: counts by status, last successful sync, connectivity, `backend` (`none` | `supabase`), `authenticated`, and `pauseReason`.

### PlayaPack / PlayaPackManifest

Versioned offline event dataset. Zod schemas live in `src/features/playa-pack/types/playaPack.ts` (`playaPackManifestSchema`).

| Field | Notes |
|-------|-------|
| `packId` | Stable pack identity |
| `name` | Display name |
| `eventYear` | Event year or `null` |
| `formatVersion` | Must equal `PLAYA_PACK_FORMAT_VERSION` (`playa-pack-0.1.0`) |
| `contentVersion` | Dataset revision (e.g. `2026.1.0`) |
| `createdAt` / `updatedAt` | ISO timestamps |
| `files[]` | `path`, `role` (`sidequests` \| `event` \| `map_ref` \| `other`), `byteSize`, `checksumSha256` |
| `totalByteSize` | Sum of file byte sizes (validated) |
| `mapPackageId` | Optional MapLibre/PMTiles package id; paired with a `map_ref` file when the pack ships an offline basemap |

Install records (`LocalPlayaPackRecord`) track `status`: `incomplete` \| `ready` \| `active` \| `failed`, byte progress, errors, persistence hint, and timestamps.

### MapPackage (`map-package.json` / `map_ref`)

Versioned offline basemap descriptor. Zod schema: `src/features/map/schemas/mapPackageSchema.ts`. Format version must equal `SIDEBURNS_MAP_FORMAT_VERSION` (`sideburn-map-0.1.0`).

| Field | Notes |
|-------|-------|
| `id` | Stable map package id (matches playa-pack `mapPackageId`) |
| `formatVersion` | Must equal `SIDEBURNS_MAP_FORMAT_VERSION` |
| `contentVersion` | Basemap revision |
| `engine` | `maplibre` or `maplibre-pmtiles` |
| `style` | MapLibre style v8 (offline-capable; no remote glyphs required for demo) |
| `assets[]` | Optional PMTiles / style binaries with checksums; served from Cache Storage |

`MapProvider.resolveSession()` distinguishes `sample`, `installed_offline`, `online_fallback`, `missing_pack`, `corrupted_pack`, and `unsupported_format`. Incomplete packs never activate and never supply basemaps.

### OfflineReadinessStatus

Checklist: shell cached, pack present, storage persisted, location permission, sync idle/errors. Pack UI on `/offline-readiness` also shows catalog, progress, versions, sizes, and retry/remove actions.

## IndexedDB schema (`artelier-playa`)

Current version: **6**.

| Store | Purpose |
|-------|---------|
| `mapRecordCache` | Last successful map-record snapshot |
| `interactions` | Device-local likes/saves |
| `sidequests` | User-created / locally edited sidequests |
| `questCompletions` | Local completions (unique per `sidequestId`) |
| `sidequestProgress` | Local save / begin / complete progress (unique per `sidequestId`) |
| `playaPackMeta` | Pack install metadata + status |
| `playaPackFiles` | Pack file blobs (staging + final); keyed `${packId}::${path}` |
| `playaPackActive` | Single `current` pointer to the active pack |
| `packSidequests` | Official sidequests for the active pack only |
| `syncOutbox` | Deferred sync operations (pending / failed / conflict preserved) |

### v5 migration

Creates `sidequestProgress` and backfills `phase: completed` rows from existing `questCompletions` inside the upgrade transaction.

### v6 migration

Creates `syncOutbox` with `status` and `nextAttemptAt` indexes. Does not delete pending user data.

### Pack lifecycle rules

1. Downloads write to `__staging__/` paths first.
2. Checksums must match before staging is promoted to final paths.
3. Partial / checksum-invalid packs stay `incomplete` or `failed` and **never** become `active`.
4. Activation is atomic: swap `playaPackActive`, demote previous pack to `ready`, replace `packSidequests`.
5. The previously active pack remains active until a replacement validates and activates.
6. Removing a pack deletes pack meta/files/`packSidequests` only — never `sidequests` user rows.
7. Bundled sample sidequests remain the Explore seed when no pack is active.

## Relationships

```text
PlayaPack 1──* Sidequest (via packSidequests when active; origin=pack)
Sample seed ──* Sidequest (origin=sample when no pack active)
Local creates ──* Sidequest (sidequests store; origin=local)
Sidequest 1──0..1 SidequestProgress
Sidequest 1──0..1 QuestCompletion
Sidequest 1──* SyncOperation (by entity id; phase 7)
LocationReading ──derives──> ProximityState(Sidequest)
LocationReading ──gates──> proximity completion
```

## Offline sidequest lifecycle

1. **Discover** — Map / Nearby / sample or active pack lists (no network required once seeded/cached).
2. **Create** — Zod-validate → IndexedDB `sidequests` → UI; draft kept in `sessionStorage` until save succeeds.
3. **Save** — `SidequestProgress.phase = saved`.
4. **Begin** — `phase = in_progress` (`begunAt` set).
5. **Complete** — optional notes + timestamp; proximity rule enforced when declared; atomic progress + completion write.
6. **Review** — `/saved` lists in-progress, saved, completed (with notes), and local creates.

Storage / quota failures surface as `LocalPersistenceError` with recovery hints; entered form data is not cleared on failure or connectivity flips.

## Remote mapping (SIDEBURNS Supabase)

Dedicated project schema (reviewable SQL under `supabase/migrations/`). Full setup, auth tradeoffs, CLI, and deployment checklist: **`docs/supabase-backend.md`**.

| Domain / local | Remote table | Boundary |
|----------------|--------------|----------|
| User-authored `Sidequest` | `user_sidequests` | Private; client id PK; soft-delete |
| Pack / sample sidequests | *(not remote rows)* | Stay in playa-pack files / sample seed |
| `SidequestProgress` | `user_sidequest_progress` | Private; one alive row per owner+sidequest |
| `QuestCompletion` | `user_quest_completions` | Private; one alive row per owner+sidequest |
| `SyncOperation` | `sync_operation_receipts` + `apply_sync_operation` | Idempotent by `(owner_id, client_operation_id)` |
| Pack catalog metadata | `event_packs` | Public read when published; no browser writes |
| Auth profile | `profiles` | Private; created from `auth.users` trigger |

Remote snake_case DTOs are validated in `src/lib/supabase/remoteSchemas.ts` and mapped to domain types in `src/lib/supabase/mappers.ts`. Service-role keys must never appear in `VITE_*`. Do not apply remote migrations without explicit approval.

Registry project/contributor ids, if linked later, are optional foreign references — not required for offline play.
