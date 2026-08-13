# Offline strategy

Status: **application-shell caching**, **versioned playa-pack downloads**, **offline MapLibre basemaps behind MapProvider**, and **deferred sync outbox + SyncService** are implemented.

## Goals

- App opens without network after the shell has been cached once.
- Sample data works with no credentials; previously downloaded playa packs remain usable offline.
- Sidequest creates/edits persist locally first (IndexedDB).
- Sync runs when connectivity and auth/policy allow (later phase).
- Map packages can be large; PMTiles assets use range reads from Cache Storage (`sideburn-map-*`) and are never shell-precached. Pack JSON datasets use versioned manifests, checksums, and staging resume.

## Service worker caching

**Toolchain:** `vite-plugin-pwa` (Workbox `generateSW`) on Vite 5.

Configured in `vite.config.ts`:

- `registerType: "prompt"` — updates never force-reload a field session.
- `injectRegister: false` — registration goes through `ServiceWorkerBoundary` (`src/lib/pwa/serviceWorkerBoundary.ts`).
- `workbox.cacheId` = `APP_SHELL_CACHE_VERSION` (`sideburn-shell-0.2.0`) for **explicit versioned** Cache Storage names.
- `cleanupOutdatedCaches: true` — removes **old Workbox Cache Storage** entries only.
- `skipWaiting` / `clientsClaim` left off so the waiting worker activates only after the user chooses **Apply update**.
- `navigateFallback: "/index.html"` — direct route loads and refreshes work offline (SPA shell).
- `navigateFallbackDenylist` excludes `/api/`, `/maps/`, and `/packs/` (pack/map paths stay out of shell navigation fallback).
- `globIgnores: ["**/maps/**", "**/packs/**"]` — large map assets and playa-pack payloads are **not** part of the app-shell precache.
- Small sample JSON under `public/sample-data/` and local fonts under `public/fonts/` are included so sample mode stays useful offline.
- Runtime caching: `CacheFirst` for Google Fonts GET responses only. No Workbox runtime routes cache authenticated mutation responses (non-GET stays network-only by default).

### Cache classes

1. **App shell** — HTML, JS, CSS, fonts, icons, `offline.html`, sample JSON (precache + versioned `cacheId`).
2. **Runtime** — Google Fonts only (GET). Prefer local IndexedDB for app data.
3. **Pack assets** — fetched on demand into IndexedDB (`playaPackFiles`) with format version `PLAYA_PACK_FORMAT_VERSION`. Not shell-precached.
4. **Map assets** — PMTiles / large binaries promoted into Cache Storage names from `mapPackageCacheName()` (`sideburn-map-{id}-{version}`). Small map package JSON (`map_ref`) stays in pack IndexedDB. Shell updates must not delete those stores.

### IndexedDB preservation

Service-worker activate/update **must not** delete IndexedDB databases, object stores, or pending outbox rows. Workbox `cleanupOutdatedCaches` only touches Cache Storage with Workbox-managed names. Do not call `indexedDB.deleteDatabase` from the service worker.

## Application shell

The shell (`src/app`, layout, nav, route modules) loads from the precache after the first successful online visit. First meaningful paint does **not** require Supabase (`VITE_DATA_PROVIDER=sample` remains the prototype default). Startup does **not** require pack catalog connectivity — readiness reads local install state from IndexedDB first.

Update UX: `PwaUpdateBanner` in `FieldShell` — non-blocking; **Apply update** or **Not now**.

Offline fallback document: `public/offline.html` (precached) for cases where the shell document is unavailable. SPA navigations and deep-route refreshes still use Workbox `navigateFallback: "/index.html"` (not `offline.html`).

Install guidance: platform-aware copy on `/offline-readiness` (`InstallGuide`). Installation is never claimed to be automatic (iOS: Share → Add to Home Screen). When already running in `display-mode: standalone`, guidance keeps the detected OS (iOS/Android) and explains installed-mode next steps instead of forcing “desktop”.

## Manifest and icons

- `public/manifest.webmanifest` — `display: standalone`, theme/background colors, 192/512 any + maskable icons, brand logo PNG.
- iOS meta in `index.html`: `apple-mobile-web-app-*`, `apple-touch-icon`, `viewport-fit=cover`.
- Icons and favicon are derived from repo-root `Logo.png` (`scripts/generate-pwa-icons.ps1`). Bump `APP_SHELL_CACHE_VERSION` after icon changes.

## IndexedDB

Current implementation: database version **6**.

Stores: map-record snapshot, device-local like/save interactions, user sidequests, quest completions, sidequest progress (save / begin / complete), playa-pack metadata, pack file blobs, active-pack pointer, official `packSidequests`, and persistent sync outbox (`syncOutbox`).

Access only through repositories (`src/features/*/repositories`, `src/lib/storage`). Version 5 added `sidequestProgress` (backfill from completions). Version 6 added `syncOutbox` for deferred Supabase apply.

## Playa pack downloads

Feature module: `src/features/playa-pack`.

- Catalog: `public/packs/catalog.json` (HTTP provider; optional while offline).
- Demo pack: `public/packs/bm-2026-demo/` (`manifest.json`, `sidequests.json`, `event.json`).
- Flow: request `navigator.storage.persist()` → download files into `__staging__/` paths → checksum each file → promote staging → mark `ready` → atomically activate.
- UI: `PlayaPackPanel` on `/offline-readiness` shows progress, installed content version, sizes, last update, failure text, retry, and remove.
- Explore / sidequest providers use active `packSidequests` when present; otherwise bundled sample seed. User `sidequests` rows always merge on top and survive pack replace/delete.

## Map package storage

- Format version: `SIDEBURNS_MAP_FORMAT_VERSION` (`sideburn-map-0.1.0`) in `src/lib/pwa/versioning.ts`.
- Playa-pack manifests may set `mapPackageId` and include a `map_ref` file (`map-package.json`) describing a MapLibre style and optional PMTiles assets.
- `MapProvider.resolveSession()` loads the **active** pack’s map only (incomplete / failed packs never activate and never become basemaps).
- Session resolution also receives the active test-area intent: Black Rock City may use the active offline pack, while Winthrop deliberately uses the connected satellite basemap and a plain offline-unavailable fallback.
- Session statuses (distinct in UI): `sample`, `installed_offline`, `online_fallback`, `missing_pack`, `corrupted_pack`, `unsupported_format`.
- PMTiles binaries are copied into Cache Storage (`sideburn-map-*`) and read via Blob range sources — not kept as a single JS heap ArrayBuffer for tile serving.
- The primary map offers a one-tap offline preparation card only for catalog packs whose validated map descriptor declares PMTiles assets that are present in the pack manifest with matching sizes and checksums. Tileless demo styles are never advertised as offline satellite maps.
- Presentation uses MapLibre inside `src/features/map/components/PlayaMap.tsx`; routes never import `maplibre-gl` / `pmtiles`.
- Sample / vector fallback styles work with no network. Temporary online raster tiles use absolute Esri CDN URLs (World Imagery + place labels) for `online_fallback` — hosted SPA deploys must not depend on same-origin `/tiles` proxies.
- Demo pack `public/packs/bm-2026-demo/` ships a lightweight offline MapLibre style (`map-package.json`). Real event packs may add PMTiles assets under the same schema.
- Sample basemap descriptors live under `public/maps/` — **excluded** from shell precache.

## Sample sidequest storage

Bundled JSON under `public/sample-data/` and/or `src/data/sample/` powers prototype mode (`VITE_DATA_PROVIDER=sample`).

## Offline creation and lifecycle

1. Validate input with Zod schemas (`origin`, `completionRule`, progress phases).
2. Write local repository / lifecycle service immediately (create → `sidequests`; save/begin/complete → `sidequestProgress` + optional `questCompletions`).
3. Related progress + completion writes use one IndexedDB transaction when completing or undoing.
4. Enqueue `SyncOperation` with status `pending` in the same IndexedDB transaction when possible.
5. Update UI from local read models only after local writes succeed.
6. Connectivity must never clear create-form drafts; storage failures show recovery messaging (`LocalPersistenceError`).
7. Attempt remote sync opportunistically later; never block create/complete on network.
8. Proximity-gated completion (`completionRule: proximity`) requires a usable GPS fix inside `radiusMeters`; open quests complete without GPS.

## Deferred synchronization

See **[`docs/sync.md`](./sync.md)** for the full client protocol.

`SyncRepository` (IndexedDB `syncOutbox`) + `SyncService`:

- Queue operations with stable id / idempotency key
- List pending / due (backoff-aware)
- Retry with bounded exponential backoff + jitter
- Mark synchronized only after remote receipt ack
- Mark conflicts / failures with preserved payloads
- Opportunistic drain on online, auth available, and explicit retry (not Background Sync alone)

Remote apply is idempotent via `sync_operation_receipts.client_operation_id` and `apply_sync_operation`. Local storage remains source of truth until an explicit remote receipt arrives. Do not run hosted migrations without approval.

## Storage persistence requests

When downloading packs, call the Persistence API (`navigator.storage.persist()`) when available. Treat denial as non-fatal; warn in offline-readiness UI (`PlayaPackPanel` notes + persistent storage row).

## Cache and dataset versioning

Constants live in `src/lib/pwa/versioning.ts`:

- `APP_SHELL_CACHE_VERSION`
- `PLAYA_PACK_FORMAT_VERSION`
- `SIDEBURNS_MAP_FORMAT_VERSION`
- `SAMPLE_DATA_VERSION`

Helpers: `appShellCacheId`, `appShellFontCacheName`, `mapPackageCacheName`, `isAppShellCacheName`, `isReservedNonShellCacheName`.

Bumping shell cache version invalidates Workbox precache via `cacheId`. Pack format bumps require migration notes in `docs/data-model.md` and a coordinated manifest `formatVersion` change. Map format bumps require coordinated `map-package.json` `formatVersion` and `assertSupportedMapFormat`.

## Recovery: partial downloads

- Pack files download into staging keys with per-file completeness flags.
- Incomplete packs stay `incomplete` / `failed` in readiness status and are not activated for Explore.
- Retry reuses intact staging blobs whose checksums still match; remaining files re-download.
- A previously active pack stays active until a replacement finishes validation and activation.

## Recovery: failed synchronization

- Failed ops remain in the queue with error metadata.
- User can retry from Sync Status / prototype controls (dev).
- Do not drop failed ops silently.
- Do not mark local records as “authoritative remote” until sync succeeds.

## Automated field-readiness audit

After `npm run build`:

```bash
npm run audit:field-readiness
```

Checks production `dist/` for: SIDEBURNS manifest + standalone display, required icons, apple-touch meta, `offline.html` safe-area viewport, service worker / Workbox presence, no user-facing Artelier strings, and no service-role credential patterns. This does **not** replace hardware install / GPS / airplane-mode checks.

## Manual device matrix (required)

| Check | Automated | Safari · current iPhone | Chrome · current Android |
|-------|-----------|-------------------------|---------------------------|
| SIDEBURNS-only branding (no Artelier UI) | Yes (`branding` tests + `audit:field-readiness`) | Manual confirm home-screen title/icon | Manual confirm install sheet title/icon |
| Manifest + icons (192/512 any + maskable, apple-touch) | Yes | Confirm Add to Home Screen icon | Confirm Install / Add to Home screen icon |
| iPhone Add to Home Screen | Guidance copy only | **Required:** Share → Add to Home Screen; opens standalone | N/A |
| Android install | Guidance + `beforeinstallprompt` boundary | N/A | **Required:** Install app or Add to Home screen |
| Standalone `display-mode` | Manifest `standalone` | Confirm chrome-less UI from home screen | Confirm installed app window |
| Direct route refresh offline (`/create`, `/nearby`, `/sync-status`) | SW navigateFallback present | **Required** airplane / offline reload | **Required** airplane / offline reload |
| First online load → subsequent offline launch | Unit: offline-ready event | **Required** | **Required** |
| Service-worker update prompt (no auto-reload) | Unit: prompt boundary | **Required:** banner Apply / Not now | **Required** |
| Airplane-mode cold start (after prior visit) | Partial | **Required** | **Required** |
| Offline pack available after download | Unit: pack service | **Required:** demo pack online then offline | **Required** |
| Map without network (sample or installed pack) | Unit: map providers | **Required** | **Required** |
| GPS granted / denied / unavailable / inaccurate / stale | Unit: locationState + provider | **Required** permission flows | **Required** permission flows |
| Nearby ranking + proximity gate | Unit | Spot-check outdoors | Spot-check outdoors |
| Local sidequest create / complete + reload persistence | Unit: lifecycle | **Required** | **Required** |
| Storage persist denial warning-only | Unit | Spot-check if Safari prompts | Spot-check |
| Supabase / auth unavailable; queued sync preserved | Unit: syncService | Spot-check Sync status pause copy | Spot-check |
| Touch targets, safe areas, keyboard overlap | Shell/CSS + audit notes | **Required** notch / home indicator | **Required** gesture bar |
| a11y live status / focus / reduced motion | Partial (aria-live + CSS) | VoiceOver spot-check | TalkBack spot-check |
| Battery: GPS pauses when document hidden | Unit: ForegroundLocationProvider | Spot-check (leave app, confirm no continuous GPS UX claim) | Spot-check |
| No secrets / service-role in bundle | Yes (`env` tests + audit) | N/A | N/A |

Automated tests cover registration boundaries, versioning, install guidance, pack migration/checksum/activation, GPS visibility pause, sync pause/recovery, and offline-readiness rendering. Rows marked **Required** still need real hardware before a field burn.

## Foreground GPS (phase 5)

SIDEBURNS uses **foreground-only** location in the normal PWA. Do not claim reliable background tracking on Android or iOS web installs.

### Opt-in and privacy

- Permission / `watchPosition` starts only after an explicit user action (Nearby “Use my location”, Map “Enable foreground location” / Follow, or Create “Use my location”).
- Opening Map, Explore, or other routes never requires GPS.
- Denied permission keeps browsing available.
- Privacy copy states coordinates remain on-device unless a later explicit feature says otherwise.

### Lifecycle states

`unsupported` · `insecure` · `prompt_required` · `denied` · `unavailable` · `acquiring` · `active` · `inaccurate` · `stale` · `simulated`

Derived in `src/features/location/utils/locationState.ts`.

### Thresholds and watch options

Documented constants: `src/features/location/config.ts`

| Constant | Default | Role |
|----------|---------|------|
| `LOCATION_MAX_USABLE_ACCURACY_METERS` | 100 m | Worse accuracy → `inaccurate`; proximity skipped |
| `LOCATION_STALE_READING_MS` | 60 s | Older fix → `stale`; proximity skipped |
| `NEARBY_DEFAULT_RADIUS_METERS` | 2500 m | Nearby distance listing radius |
| `LOCATION_GEO_OPTIONS` | high accuracy, `maximumAge` 10 s, `timeout` 15 s | Shared `getCurrentPosition` / `watchPosition` options |

Battery: one shared `watchPosition` while any opted-in subscriber is active; `clearWatch` when the last subscriber stops. `ForegroundLocationProvider` also clears the watch while `document.hidden` and resumes when visible again (tab switch / home-screen background). High accuracy improves playa fixes at higher drain; `maximumAge` reuses recent fixes. Do not claim OS-level background tracking.

### Nearby and proximity

- Precise sidequests are ordered by Haversine distance (`distanceMeters`).
- Approximate / imprecise placements (`placementKind: "approximate"` or poor accuracy) are listed separately and do not drive proximity.
- `evaluateProximityFromReading` gates the GPS proximity provider on usable readings.

### Simulation

Prototype controls (`VITE_ENABLE_PROTOTYPE_CONTROLS`) can set a simulated position. Simulated is a distinct lifecycle state and must stay off product surfaces.
