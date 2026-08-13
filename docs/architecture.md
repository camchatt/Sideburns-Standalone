# Architecture

## Why SIDEBURNS is standalone

**SIDEBURNS** is a field application: offline maps, GPS, sidequests, and deferred sync. It must open and remain useful without connectivity or remote credentials. Coupling SIDEBURNS to another product frontend would force connectivity assumptions, admin surface area, and release coupling that conflict with desert / offline use.

SIDEBURNS may optionally sync with Supabase later. Those are **providers**, not the application core. Users must not see other product branding, accounts, or registry URLs.

## Feature-based organization

```text
src/
  app/           # shell, router, providers, config
  routes/        # thin route pages
  features/      # domain modules (sidequests, map, location, ...)
  components/    # shared UI / layout / navigation / feedback
  data/          # sample data, adapters, shared repositories
  lib/           # branding, supabase client stub, storage, pwa, validation, logging
  styles/        # tokens + globals
```

Route components stay thin. Feature services and repositories own behavior.

Agent-oriented conventions: root `AGENTS.md`, `.cursor/rules/*.mdc`, and nested `AGENTS.md` under `src/features`, `src/data`, and `src/routes`. Workflow: `docs/development.md` → **Agent implementation workflow**.

## Local-first data flow

```text
UI
  ↓
Feature service
  ↓
Local repository (+ atomic outbox enqueue)
  ↓
IndexedDB (`artelier-playa` v6: map cache, interactions, sidequests, completions, progress, playa packs, syncOutbox)
  ↓
SyncService / SyncRepository
  ↓
RemoteSyncAdapter (`apply_sync_operation`)
  ↓
SIDEBURNS Supabase (optional)
```

While the user is in session, **local storage is the immediate source of truth**. Remote systems are updated through the sync layer after local writes succeed. Sidequest creates, progress (save/begin), and completions write to IndexedDB before any remote attempt. Details: [`docs/sync.md`](./sync.md).

## Local database naming

The IndexedDB database is still named **`artelier-playa`** (`LEGACY_INDEXED_DB_NAME` in `src/lib/branding.ts` / `PLAYA_DATABASE_NAME` in `src/lib/storage/playaDatabase.ts`).

**Do not rename casually.** A rename would orphan existing local sidequests, likes/saves, and completions on user devices.

Forward-safe migration plan (dedicated future change):

1. Open the legacy DB `artelier-playa` and read all stores.
2. Create `sideburn` at the current schema version and copy records.
3. Verify row counts / checksums; only then stop writing to the legacy name.
4. Keep the legacy DB readable for one release as fallback; document purge afterward.
5. Cover the migration with focused IndexedDB tests.

## Branding

Product name: **SIDEBURNS** (`src/lib/branding.ts`). Brand mark: `public/images/sideburn-logo.png` (source: repo-root `Logo.png`). Favicon and PWA icons live under `public/images/` and `public/icons/` — regenerate with `scripts/generate-pwa-icons.ps1`.

## Provider and repository boundaries

| Boundary | Role |
|----------|------|
| `SidequestProvider` | CRUD + nearby queries for sidequests |
| `SidequestLifecycleService` | Offline save / begin / complete / review; proximity completion gates; atomic progress + completion writes |
| `MapProvider` | Load versioned map packages / area-aware basemap sessions (`resolveSession`) for MapLibre presentation |
| `MapRecordProvider` | Supply validated, provider-neutral placement markers |
| `MapRecordCache` | Cache the last successful placement snapshot in IndexedDB |
| `LocalInteractionRepository` | Persist device-local likes and saves (including `listSaved`) |
| `LocationProvider` | GPS readings (`BrowserLocationProvider`), permissions, simulated location |
| `ProximityProvider` | Distance / trigger state (GPS now; Bluetooth later) |
| `SyncRepository` | Persistent IndexedDB outbox (`syncOutbox`) |
| `SyncService` | Opportunistic drain, ack, backoff, conflict preservation |
| `RemoteSyncAdapter` | Maps outbox → `apply_sync_operation` / receipts (no UI imports) |
| `EventDataProvider` | Packaged event / pack source (sample, installed pack overlay, future API) |
| `PlayaPackService` / `PlayaPackRepository` | Download, validate, activate, remove versioned offline packs |

UI must not know which concrete provider supplied data. Selection happens in `src/app/providers.tsx` / `src/data/adapters` based on validated env config. Catalog reads stay local-first; `VITE_DATA_PROVIDER=supabase` enables the sync backend without claiming Explore reads live Supabase rows (`catalogSource` / `syncBackend` on the data bundle).

## Local data and Supabase

- Supabase is an optional remote backend on a **dedicated SIDEBURNS project** (see `docs/supabase-backend.md`).
- The browser client may only use publishable (`VITE_SUPABASE_*`) keys; service-role keys are rejected by env validation.
- UI never imports the Supabase client for feature writes.
- Remote row shapes stay in `src/lib/supabase/remoteSchemas.ts` and are mapped to domain types before feature use.
- `SupabaseMapRecordProvider` may read a public Burning Man placements view through `src/lib/supabase`, then maps rows into SIDEBURNS-owned types. Remote DTO fields such as `artelier_project_slug` are adapter-only and must not become user-facing product URLs.
- Sync applies through `apply_sync_operation` + `sync_operation_receipts` via `SyncService` / `SupabaseRemoteSyncAdapter`. Migrations are local/reviewable until explicitly approved for remote apply.

## Geographic “playa” vs product name

Internal names like `PlayaMap`, `playaGeo`, `playa-pack`, and CSS classes `playa-*` refer to the Burning Man **playa** (the physical desert playa), not the old product name. Renaming those identifiers is optional and not required for branding.

## Distribution and future Capacitor wrapper

**This release is an installable PWA** served from a static HTTPS origin. Do not claim Apple App Store or Google Play distribution until a native packaging phase is explicitly approved.

The web app remains the source of truth. A later **Capacitor** (or similar) wrapper may package the same UI for optional store binaries and stronger OS location APIs. Keep business logic in `src/features/*` so a native shell does not fork domain code. Capacitor is **not implemented** in this repository yet — see `docs/deployment.md`.

## GPS vs Bluetooth proximity

- **GPS** is the primary, cross-platform proximity system (Android and iOS).
- **Bluetooth** is experimental, feature-detected, and never required for core discovery or creation.
- Do not assume background geolocation or iOS Web Bluetooth.
- Foreground location requires an explicit user opt-in before `watchPosition` / permission prompts.
- Distinct lifecycle states: `unsupported`, `insecure`, `prompt_required`, `denied`, `unavailable`, `acquiring`, `active`, `inaccurate`, `stale`, `simulated`.
- Thresholds and watch options live in `src/features/location/config.ts` (`LOCATION_MAX_USABLE_ACCURACY_METERS`, `LOCATION_STALE_READING_MS`, `LOCATION_GEO_OPTIONS`).
- Inaccurate or stale readings must not drive proximity events (`evaluateProximityFromReading`).
- Nearby (`/nearby`) ranks precise sidequests by distance and lists approximate placements separately.
- Map follow is user-toggled; pan/zoom while following releases follow so the camera does not fight the user.
- Simulated location is prototype-controls only; never claim iOS persistent background tracking.

## PWA direction

Application-shell installability is implemented with `vite-plugin-pwa` (Workbox) on Vite 5:

- Manifest: `public/manifest.webmanifest` (`display: standalone`)
- Registration boundary: `src/lib/pwa/serviceWorkerBoundary.ts` (prompt updates)
- Versioned shell cache id: `APP_SHELL_CACHE_VERSION` in `src/lib/pwa/versioning.ts`
- Install guidance: `/offline-readiness` + `InstallGuide`
- Shell caching stays separate from pack/map storage (`public/maps/**` and `public/packs/**` excluded)
- Offline basemaps: MapLibre (+ optional PMTiles) behind `MapProvider`; Cache Storage prefix `sideburn-map-*`

See `docs/offline-strategy.md` for cache classes, playa-pack download rules, map session statuses, IndexedDB preservation, and device QA checklist.
