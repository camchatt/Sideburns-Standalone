# Data adapters and sample sources

Scoped guidance for `src/data/*`. Root `AGENTS.md` and `.cursor/rules/` still apply.

## Role

- `adapters/` - select and construct provider bundles from validated env (`createDataProviders`).
- `sample/` - fictional demo datasets; must work with no Supabase credentials.
- `repositories/` - shared repository implementations when not feature-local.

## Rules

- UI and routes must not choose providers; wiring happens here and in `src/app/providers.tsx`.
- Keep sample providers working whenever adding a remote provider.
- Zod-validate anything crossing import / env / remote boundaries before domain use.
- External response formats stay in adapters; map to feature domain types.

## Provider selection honesty

`createDataProviders` exposes:

- `dataProviderId` — configured env (`sample` | `supabase`)
- `catalogSource` / `eventData.source` — what Explore actually reads (sample / packs; not silent “supabase”)
- `syncBackend` / `remoteSyncEnabled` — whether the deferred outbox may call SIDEBURNS Supabase

When `VITE_DATA_PROVIDER=supabase`, catalog reads remain local-first. Sync is what becomes remote-capable. See `docs/sync.md`.
