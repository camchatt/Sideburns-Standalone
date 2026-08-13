# Development

## Agent implementation workflow

Cursor agents should follow this loop for implementation work (see also root `AGENTS.md` and `.cursor/rules/*.mdc`):

1. **Orient** - Read root `AGENTS.md`, applicable project rules, and any nested `AGENTS.md` under `src/features`, `src/data`, or `src/routes`.
2. **Inspect** - Check `git status` and the existing feature/provider/docs before editing. Prefer extending stubs over inventing parallel patterns.
3. **Scope** - State assumptions and the smallest coherent change. Stay within the assigned phase (IndexedDB -> PWA -> packs -> maps -> GPS -> offline CRUD -> sync -> Bluetooth). Do not implement later phases as side effects.
4. **Change** - Types and Zod schemas before behavior; business logic in `src/features/*`; thin routes; adapters for provider selection; no imports from the Artelier directory on disk; no UI->Supabase calls.
5. **Test** - Add or update focused tests for the behavior changed (migrations, outbox atomicity, offline startup, provider selection, GPS states, etc., as relevant).
6. **Verify** - For normal implementation: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Claim a check passed only if it ran successfully.
7. **Document** - Update `docs/architecture.md`, `docs/offline-strategy.md`, or `docs/data-model.md` when boundaries, cache versions, or entities change.
8. **Report** - Files changed, checks run/failures, and remaining risks. Do not commit or push unless asked.

Preserve the foundation baseline (`66aa777`). Prefer `VITE_DATA_PROVIDER=sample` for prototype work. Do not upgrade/remove dependencies or run destructive git commands unless explicitly requested.

## Supported Node / npm

| Tool | Version |
|------|---------|
| Node.js | 20.x or 22.x (`package.json` `engines`: `>=20.19.0 <23`; `.nvmrc` → `20`) |
| npm | 10.x+ (`engines.npm`: `>=10.0.0`) |

## Installation

```powershell
npm install
```

## Environment setup

Copy `.env.example` to `.env` and adjust. Mode matrices (sample / preview / production), HTTPS expectations, and static-host SPA fallback: [`docs/deployment.md`](./deployment.md).

Sample-data mode (default for prototype):

```text
VITE_APP_ENV=development
VITE_DATA_PROVIDER=sample
VITE_ENABLE_PROTOTYPE_CONTROLS=true
VITE_MAP_SOURCE=sample
VITE_ENABLE_BLUETOOTH_EXPERIMENT=false
```

Supabase keys are optional when `VITE_DATA_PROVIDER=sample`.

Never commit real credentials. Never put service-role keys in `VITE_*` variables. Production builds with `VITE_DATA_PROVIDER=supabase` fail validation without a valid SIDEBURNS HTTPS URL + publishable/anon key (`src/lib/validation/env.ts`).

Dedicated SIDEBURNS backend design (migrations, RLS, auth tradeoffs, local CLI): [`docs/supabase-backend.md`](./supabase-backend.md). Client sync protocol: [`docs/sync.md`](./sync.md). Production / release checklists: [`docs/deployment.md`](./deployment.md), [`docs/release-checklist.md`](./release-checklist.md). Privacy / deletion design: [`docs/privacy-and-deletion.md`](./privacy-and-deletion.md). Do not apply remote migrations or deploy without explicit approval. Do not use Artelier’s Supabase project.

## Development server

```powershell
npm run dev
```

Default: Vite on port `8080`.

## Testing GPS away from Black Rock City

Use real device GPS to validate permission, accuracy, unavailable, and stale-reading behavior. Browser geolocation requires `localhost` or HTTPS. If permission is denied immediately, re-enable location for the site and in Windows **Settings > Privacy & security > Location**, then use **Retry location** in SIDEBURNS.

For playa-specific distance ranking and proximity completion while testing elsewhere, run a non-production build with `VITE_ENABLE_PROTOTYPE_CONTROLS=true`, open **Test location**, and select **Simulate Black Rock City**. The simulated position is session-only and is always labeled **Simulated**. Select **Clear simulation** to resume real device GPS. Production validation rejects enabled prototype controls.

## Type checking

## Sidequester parity testing

Use the year controls on the map to compare packaged inventories. The **2025** year includes the Projects layer (Burning Man art placements) plus 21 reconstructed beacons/sidequests. Art is year-scoped to 2025 only. **Add a beacon** saves a validated local record and selected playa location before deferred sync; only beacons created on the current device expose the confirmed remove action.

Preview builds use the online satellite basemap by default and expose a **Test area** selector when prototype controls are enabled. **Black Rock City** shows playa overlays and offers explicit simulated GPS; **Winthrop, MA** clears simulation, uses real foreground device GPS, hides playa overlays, and provides a bounded real-world map for local beacon testing.

## Type checking

```powershell
npx tsc -p tsconfig.app.json --noEmit
```

## Linting

```powershell
npm run lint
```

## Testing

```powershell
npm test
npm run test:watch
```

Playwright (optional E2E; start config may still reference older assumptions, verify before relying on it):

```powershell
npx playwright test
```

## Production build

```powershell
npm run build
```

Field-readiness audit of `dist/` (manifest, icons, SW, branding, no service-role patterns):

```powershell
npm run audit:field-readiness
```

Hardware install / airplane-mode matrix: `docs/offline-strategy.md`.

## Environment variable naming

All browser-exposed config uses the `VITE_` prefix. Validated in `src/lib/validation/env.ts` (also at Vite load; production misconfig fails the build).

| Variable | Purpose |
|----------|---------|
| `VITE_APP_ENV` | `development` \| `prototype` \| `production` |
| `VITE_DATA_PROVIDER` | `sample` \| `supabase` |
| `VITE_SUPABASE_URL` | Optional; required for supabase mode. Production requires `https` SIDEBURNS URL (no localhost) |
| `VITE_SUPABASE_ANON_KEY` | Optional publishable key (alias-friendly); required for supabase mode |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Optional publishable key (legacy env alias) |
| `VITE_ENABLE_BLUETOOTH_EXPERIMENT` | Gate experimental BLE UI |
| `VITE_ENABLE_PROTOTYPE_CONTROLS` | Dev/prototype panels; **must be false/unset in production** |
| `VITE_MAP_SOURCE` | `sample` \| `packaged` \| `remote` |

Forbidden: `VITE_SUPABASE_SERVICE_ROLE_KEY` or any service-role JWT in publishable slots.

## Running with sample data

1. Set `VITE_DATA_PROVIDER=sample` (or leave unset; default is sample).
2. `npm run dev`
3. Shell shows provider indicator `sample`.
4. Explore route reads fictional sidequests from the sample provider.

The map-first home also displays those fictional records when live credentials are absent. To read an optional public Burning Man placement view, set `VITE_DATA_PROVIDER=supabase` together with a browser-safe Supabase URL and publishable/anon key. Successful placement responses are validated and cached locally; never copy service-role credentials into this app.

## Introducing a new provider

1. Define or extend the typed interface in the feature module.
2. Add Zod schemas for any external payloads.
3. Implement the provider under `features/*/services` or `data/adapters`.
4. Register selection in `src/data/adapters` / `src/app/providers.tsx`.
5. Keep sample provider working.
6. Add tests for selection + validation.
7. Update `docs/architecture.md` if the boundary changes.
