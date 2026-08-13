# SIDEBURNS release checklist

Use before any **authorized** production cut. Complements [`docs/deployment.md`](./deployment.md). This release is an **installable PWA**, not a native app-store binary.

Do not apply hosted database changes or public deploys without explicit approval.

## 1. Tooling and build

- [ ] Node 20.x or 22.x, npm 10.x+ (see `package.json` `engines`, `.nvmrc`)
- [ ] Clean install: `npm ci` (or `npm install` when lockfile policy allows)
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run audit:field-readiness`
- [ ] Env mode matches intent (`VITE_APP_ENV=production` for prod builds)
- [ ] No service-role material in env or `dist/`

## 2. Database migrations (Supabase)

Skip if this release stays on `VITE_DATA_PROVIDER=sample` with no remote sync.

- [ ] Migrations under `supabase/migrations/` reviewed (init + RLS)
- [ ] Contract tests still green: `src/lib/supabase/migrations.contract.test.ts`
- [ ] Hosted project is SIDEBURNS-only (not Artelier)
- [ ] Explicit approval recorded to link project / `db push` / CI migrate
- [ ] Apply forward-only; no destructive resets on shared envs
- [ ] Seed / publish of `event_packs` decided (catalog empty until published)
- [ ] Rollback plan: compensating migration preferred over `db reset` remotely  
  Detail: [`docs/supabase-backend.md`](./supabase-backend.md)

## 3. RLS verification

- [ ] Second authenticated user cannot `SELECT`/`INSERT`/`UPDATE`/`DELETE` another user’s `profiles`, `user_*`, or `sync_operation_receipts`
- [ ] `anon` can only read published, non-deleted `event_packs`
- [ ] `event_packs` writes remain service-role / dashboard only
- [ ] `apply_sync_operation` rejects cross-owner payloads and returns stable receipts on retry
- [ ] Soft-deleted rows (`deleted_at`) stay invisible to normal client reads as designed

## 4. Pack compatibility

- [ ] `PLAYA_PACK_FORMAT_VERSION` / `SIDEBURNS_MAP_FORMAT_VERSION` intentional (`src/lib/pwa/versioning.ts`)
- [ ] Demo / event pack manifests validate (`playaPackManifestSchema`, map package schema)
- [ ] Incomplete downloads remain `incomplete` and never become the active dataset
- [ ] Activate/remove on Offline readiness still works after upgrade
- [ ] Checksums and catalog entries match hosted `/packs/**` (or CDN) paths
- [ ] Map `map_ref` / PMTiles assets resolve offline after pack install

## 5. Cache versions

- [ ] `APP_SHELL_CACHE_VERSION` bumped deliberately when shell precache strategy changes
- [ ] Shell cache prefixes remain distinct from `sideburn-map-*` / pack caches
- [ ] Service worker update prompts; accepting an update does **not** wipe IndexedDB / outbox
- [ ] Upgrade smoke: prior installed shell → new deploy → prompt → reload → local saves intact
- [ ] SW and Workbox scripts served with `no-cache` (host headers in `netlify.toml` / `vercel.json`)

## 6. Offline smoke tests

Automated coverage is necessary but not sufficient. Before a field burn:

- [ ] Online first visit precaches app shell
- [ ] Airplane-mode cold start opens shell routes without network
- [ ] Explore / Saved / Create / Nearby / Map usable on sample or installed pack data
- [ ] Offline pack download interrupted → status `incomplete`, not active
- [ ] Map session: packaged or sample basemap without tiles network when expected
- [ ] Local sidequest create → begin → complete → reload persistence
- [ ] Sync outbox retains failed/conflict ops when remote unavailable
- [ ] Storage persistence denial is warning-only in readiness UI

Matrix: [`docs/offline-strategy.md`](./offline-strategy.md).

## 7. Mobile installation (PWA)

- [ ] Android Chrome: Install / Add to Home Screen → standalone display
- [ ] iOS Safari: Add to Home Screen → icon + standalone chrome
- [ ] Manifest name `SIDEBURNS`, `display: standalone`, icons present
- [ ] Deep link `/offline-readiness` works on HTTPS origin (SPA fallback)
- [ ] Foreground GPS opt-in works only after explicit action; deny still allows browse
- [ ] Update banner / prompt path verified after a shell version bump
- [ ] Do **not** claim App Store or Play listing for this release

## 8. Privacy and deletion readiness

- [ ] Privacy outline reviewed: [`docs/privacy-and-deletion.md`](./privacy-and-deletion.md)
- [ ] Public privacy policy URL planned (hosting/legal) before collecting optional accounts at scale
- [ ] Deletion workflow design accepted; operator runbook owners assigned
- [ ] Supabase Auth Site URL / redirects match the HTTPS PWA origin

## 9. Sign-off

- [ ] Deployment authorized by product owner
- [ ] Hosting provider env vars set
- [ ] Supabase dashboard items done or explicitly deferred (sample-only release)
- [ ] Post-deploy smoke on production HTTPS origin completed
