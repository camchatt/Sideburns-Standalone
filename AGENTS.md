# SIDEBURNS - Agent guide

Guidance for AI agents and contributors working in **SIDEBURNS**.

If repository behavior differs from this document, inspect the current implementation and report the discrepancy rather than blindly following stale documentation.

Cursor project rules live in `.cursor/rules/*.mdc`. Read this file first, then the applicable rules and any nested `AGENTS.md` near the code you touch. Implementation workflow detail: `docs/development.md` → **Agent implementation workflow**.

## Project identity

**SIDEBURNS** (`sideburn`) is a **standalone** offline-first field PWA for Burning Man sidequests.

```text
C:\Users\camch\OneDrive\Documents\Artelier_Playa
```

(Local folder name may still say `Artelier_Playa`; the product name is SIDEBURNS.)

Public repo: `https://github.com/camchatt/Sideburn`

SIDEBURNS is publicly and technically independent. Users must not encounter Artelier branding, URLs, terminology, accounts, database dependencies, or product references.

Never read from, import from, modify, or create a worktree connected to:

```text
C:\Users\camch\OneDrive\Documents\Artelier
```

Preservation baseline: commit `66aa777` (`chore: preserve initial Artelier Playa foundation`). Do not discard, overwrite, or broadly refactor that foundation unless the user explicitly requests it.

## Current stage

Architecture and prototype foundation exist:

- Feature-module layout under `src/features/*`
- Typed provider / repository boundaries
- Sample-data mode (`VITE_DATA_PROVIDER=sample`)
- Field application shell and routes branded SIDEBURNS
- Docs for offline, sync, data model, and development
- IndexedDB (name still `artelier-playa` for continuity — see architecture docs)
- Leaflet map with sample/live fallback, mapped vs approximate lists
- Browser GPS `LocationProvider` with opt-in foreground session, map live-follow, and Nearby distance ranking
- Offline-first sidequest lifecycle (discover / create / save / begin / complete / review; local IndexedDB; sync outbox enqueued atomically)
- PWA application-shell caching via `vite-plugin-pwa` / Workbox (prompt updates, install guidance, offline fallback)
- Versioned offline playa packs (manifest + checksums, IndexedDB staging/activate, offline-readiness UI)
- Offline MapLibre basemaps behind `MapProvider` (pack `map_ref` / optional PMTiles, sample + online fallbacks)
- Deferred Supabase sync client (IndexedDB outbox, SyncService, receipt ack, backoff) against the dedicated SIDEBURNS schema
- Dedicated SIDEBURNS Supabase **schema design** (local migrations + RLS + docs under `supabase/` and `docs/supabase-backend.md`; remote apply not executed)
- Production-readiness docs: Node/npm engines, env modes, HTTPS/SPA host configs, deployment + release checklists, privacy/deletion outlines (`docs/deployment.md`, `docs/release-checklist.md`, `docs/privacy-and-deletion.md`). **Do not deploy until explicitly authorized.** This release is an installable PWA only (no app-store claim; Capacitor wrapper documented as later option).

Not complete yet: hosted Supabase deployment (needs approval), public hosting go-live, account-linking UX, self-serve deletion UI, or Bluetooth experiments beyond stubs/flags.

## Intended implementation phases

Work these phases in order when building product capability. Do **not** implement a later phase as a side effect of an earlier one without explicit approval.

1. IndexedDB persistence (versioned schema + migrations)
2. PWA application shell and service worker ← **implemented** (app-shell precache, prompt updates, install guidance)
3. Offline playa packs and versioned datasets ← **implemented** (manifest, IndexedDB packs, activate/remove)
4. MapLibre / PMTiles integration behind `MapProvider` ← **implemented** (session statuses, pack map_ref, Cache Storage for PMTiles, MapLibre presentation)
5. GPS location and proximity behavior ← **implemented** (opt-in foreground session, lifecycle states, Nearby, map follow, proximity gating)
6. Offline sidequest creation and completion ← **implemented** (progress phases, proximity-gated complete, local review; outbox enqueue)
7. Deferred Supabase synchronization (explicit outbox) ← **client implemented**; hosted DB apply still needs approval
8. Optional experimental Bluetooth proximity (flagged, non-blocking)

Keep architectural work, dependency upgrades, and product features in **separate commits** when the user asks for commits.

## Product goal

Users will eventually: download an event data package; browse an offline map; see nearby sidequests; navigate with device GPS; create and complete sidequests offline; save locally first; sync when connectivity returns; receive proximity-based interactions; and use sample data without an official event API or Supabase credentials.

## Architecture (mandatory)

1. Keep significant business logic inside `src/features/*`.
2. Keep route components thin (`src/routes/*`).
3. UI components must never call Supabase (or any remote client) directly.
4. Access data through typed providers, repositories, and services.
5. External API and database response formats must not leak into UI components.
6. Validate at storage, API, import, environment, and sync boundaries with Zod.
7. Keep provider implementations replaceable; select them in adapters / app wiring.
8. Do not import from the Artelier directory on disk.
9. Do not copy unrelated registry, admin, ecommerce, ingestion, publishing, or resume product surface.
10. Prefer offline operation before online operation.

Naming conventions, folder roles, and provider boundaries: see `docs/architecture.md` and nested `src/features/AGENTS.md` / `src/data/AGENTS.md` / `src/routes/AGENTS.md`.

### Naming conventions

| Kind | Convention | Example |
|------|------------|---------|
| React components | PascalCase files | `FieldShell.tsx` |
| Hooks | `use` + camelCase | `useLocationReading.ts` |
| Providers (interfaces) | `*Provider` | `SidequestProvider` |
| Provider implementations | descriptive + Provider | `SampleSidequestProvider` |
| Repositories | `*Repository` | `SyncRepository` |
| Domain / DB types | PascalCase in feature `types/` | `Sidequest` |
| Local DB record types | suffix `Record` or `Local*` | `LocalSidequestRecord` |
| Feature folders | kebab-case | `playa-pack/` |
| Routes | kebab-case under `src/routes/` | `offline-readiness/` |
| Env vars | `VITE_*` uppercase | `VITE_DATA_PROVIDER` |
| Tests | co-located `*.test.ts(x)` | `env.test.ts` |
| Schemas | Zod in feature `schemas/` | `sidequestSchema.ts` |

## Offline-first (mandatory)

- Local storage is the immediate source of truth.
- Create/update operations must save locally before remote synchronization.
- Connectivity must never be required to open the app.
- Failed and conflicting sync operations must be preserved; never silently discard pending ops.
- IndexedDB schema changes need explicit versions and tested migrations.
- Local entity writes and sync-outbox insertion should be atomic when possible.
- Data migrations must be forward-safe and recoverable.
- Sample-data mode must remain functional without Supabase credentials.

## PWA, maps, location, sync (summary)

Details live in `.cursor/rules/` and `docs/offline-strategy.md`. Non-negotiables:

- App-shell caching stays separate from large pack / map storage; version cache names and pack formats.
- Service-worker updates must not delete pending local user data.
- Never casually cache authenticated mutation responses.
- Partial pack downloads must not become active datasets.
- Map loading behind `MapProvider`; do not assume online tiles.
- GPS is the universal baseline; treat permission / unavailable / denied / inaccurate / stale / simulated as distinct states.
- Bluetooth stays optional, feature-detected, behind `VITE_ENABLE_BLUETOOTH_EXPERIMENT`, and must never block GPS or core flows. Do not assume Web Bluetooth on iOS.
- Sync uses an explicit outbox with stable IDs, idempotency, bounded backoff, and explicit remote acknowledgements.
- Never use service-role keys in browser code. No destructive DB migrations without explicit approval.

## Known foundation issues (encode; do not “fix quietly”)

Agents should treat these as documented debt unless the task explicitly targets them:

| Issue | Guidance |
|-------|----------|
| `npm audit` reports high/moderate vulnerabilities | Do not run `npm audit fix --force`. Upgrade deliberately in a dedicated change. |
| Some source/docs strings have encoding corruption | Fix only files you already touch, or when asked; do not mass-rewrite. |
| `VITE_DATA_PROVIDER=supabase` enables sync backend while catalog stays sample/local | Honest: expose `catalogSource` + `syncBackend` / `remoteSyncEnabled` on the data bundle. Do not claim Explore reads live Supabase rows. |
| React Router v7 future-flag warnings | Address in a dedicated router/config change, not as drive-by noise. |
| IndexedDB still named `artelier-playa` | Keep until a dedicated copy-migrate to `sideburn` ships; do not rename casually. |
| Large inherited UI dependencies | Remove or trim only in a dedicated, verified cleanup change. |

## Task workflow

Every agent should:

1. Read this file and applicable `.cursor/rules/*.mdc` / nested `AGENTS.md`.
2. Inspect existing implementation and `git status` before editing.
3. State assumptions and intended scope (smallest coherent change).
4. Add or update types/schemas before feature logic when boundaries change.
5. Add or update focused tests for the behavior changed.
6. Run proportionate verification (`lint`, `typecheck`, `test`, `build` for normal implementation work).
7. Update architecture / offline / data-model docs when boundaries change.
8. Report files changed, checks run (only claim success if they ran), failures, and remaining risks.

Do not implement IndexedDB renames, Bluetooth, or Supabase sync unless the user explicitly requests that phase. Do not commit or push unless explicitly asked.

## Definition of done

A change is not complete until:

- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass when the change affects application or shared tooling (skip only when the task is pure agent-guidance / docs with no validation impact - and say so).
- Empty, loading, error, offline, and unsupported states were considered for UX-facing work.
- No secrets committed; docs match architectural changes; existing functionality was not unintentionally removed.
- Agents must not claim a check passed unless it actually ran successfully.

## Safety notes

- Prefer `VITE_DATA_PROVIDER=sample` for local prototype work.
- Never commit `.env` with real keys, credentials, local DBs, generated builds, map downloads, or `node_modules`.
- Remote Supabase writes, migrations, and Edge Function deploys require explicit environment approval.
- Never reset, clean, rebase, force-push, or discard user/agent work without explicit approval.
- Inspect `git status` before making changes; preserve existing work; do not modify unrelated files.
