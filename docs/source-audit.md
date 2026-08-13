# Source audit (historical): prior codebase → SIDEBURNS foundation

> Historical engineering audit only. The product name is **SIDEBURNS**.

Audit date: 2026-08-03  
Source branch at fork: `Mobile-Compatibility` (`c7ec835`)  
Working branch at audit: `artelier-playa` (pre-SIDEBURNS rename)  
Package manager: **npm** (`package-lock.json`)

This document is based on inspection of the checked-out tree, not guesses.

## Written assessment (before structural changes)

Artelier is a large Vite + React SPA covering Registry, member workspace, Burning Man collection, admin import/staging, opportunities, messaging, and leftover ecommerce Edge Functions. Artelier Playa needs only a thin field shell: offline-capable UI, provider boundaries, sample data, and selective reuse of design tokens / shadcn UI / Zod / Vitest / Supabase client patterns.

**Strategy:** Keep only reusable foundations in this standalone repo under `src/`. Do not import Artelier product modules. Point the app entry at `src/app`. Do not run Artelier routes, admin flows, or ingest tools from this app. Do not modify the Artelier repository from Playa work.

## Current framework and versions

| Item | Value (from `package.json`) |
|------|-----------------------------|
| React | `^18.3.1` |
| React DOM | `^18.3.1` |
| TypeScript | `^5.8.3` |
| Vite | `^5.4.19` |
| `@vitejs/plugin-react-swc` | `^3.11.0` |
| React Router | `^6.30.1` |
| Tailwind CSS | `^3.4.17` |
| Zod | `^3.25.76` |
| Supabase JS | `^2.100.0` |
| Vitest | `^3.2.4` |
| Playwright | `^1.57.0` |
| Leaflet / react-leaflet | `^1.9.4` / `^4.2.1` |

App package name was `vite_react_shadcn_ts` (Lovable lineage). Playa renames to `artelier-playa`.

## Package manager

npm. Install with `npm install`. Lockfile: `package-lock.json`.

## Build system

- Dev: `vite` on port `8080` (`vite.config.ts`)
- Production build (source Artelier): `build:mcp` → `vite build` → `scripts/prerender.mjs`
- Alias: `@` → `src/`
- No Vite `base` / Router `basename`

Playa simplifies the default build to `vite build` (no MCP bundle, no Artelier prerender). Prerender/MCP scripts remain under `scripts/` / `legacy` context until explicitly removed.

## Routing system

React Router 6. Flat route table in `src/App.tsx` with absolute paths (`/artelier/...`, `/admin/...`, `/burningman/...`, `/account/registry/...`). Playa replaces this with `src/app/router.tsx` and field routes under `/`.

## State management

- Mostly local React state + direct Supabase calls
- `@tanstack/react-query` wrapped the app; little/no `useQuery` usage found under `src/`
- `zustand` was a dependency with little/no `src` usage

Playa should prefer feature hooks + repositories; React Query may be reintroduced later for remote sync only, not as the offline source of truth.

## Styling system

- Tailwind + `tailwindcss-animate` + `@tailwindcss/typography`
- CSS variables in `src/index.css` (moved toward `src/styles/globals.css`)
- Fonts: Bebas Neue, Lato, Inter, plus local Creattion / Stencilia
- shadcn/ui primitives under `src/components/ui/`
- Design tokens include `--kiwi-teal`, `--kiwi-warm`, shadcn semantic colors

## Supabase configuration

- Client: `src/integrations/supabase/client.ts` (generated pattern)
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (also `VITE_SUPABASE_PROJECT_ID` in `.env.example`)
- Types: `src/integrations/supabase/types.ts`
- Migrations and Edge Functions under `supabase/`
- Known project refs (documentation only): legacy `ysbeekxeryubwfrhfsjw`, Artelier target `nrdzeqfqhfzzcttgppdt`

**Rule retained:** never put service-role keys in Vite / browser code.

## Authentication structure

- No global AuthContext
- Admin: `/admin/login` + `user_roles` (`admin` / `root`)
- Contributor: `/account/registry/login`
- Gates: `AdminGate`, `RootGate`, account shells

Playa keeps an `features/auth` boundary for optional future session linking to Artelier; core field UX must work without signed-in remote auth.

## Environment variable usage

Source Artelier (`.env.example`):

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SITE_URL`

Playa adds provider/feature flags (see `.env.example`). Sample-data mode must run without Supabase credentials.

## Existing PWA support

None found. No `vite-plugin-pwa`, no service worker registration under `src/`, no web app manifest in `public/` for installability. SEO prerender exists for Artelier marketing/registry pages; that is not PWA offline support.

**Recommendation:** add `vite-plugin-pwa` (Workbox) when implementing caching. Until then, keep manifest + SW module boundaries as stubs.

## Existing mapping support

- `leaflet` + `react-leaflet` used by Burning Man `PlayaMap` and nearby-events map
- Online tile usage patterns; not packaged offline basemaps / PMTiles

Reusable conceptually for map presentation; must sit behind a `MapProvider` so PMTiles / packaged maps can replace tiles later.

## Reusable Artelier components / systems

| Keep / adapt | Why |
|--------------|-----|
| `src/components/ui/*` | shadcn primitives |
| `src/lib/utils.ts` (`cn`) | class merging |
| CSS tokens / fonts | visual identity |
| Zod + `@hookform/resolvers` | boundary validation |
| Vitest + Testing Library + Playwright config | test foundation |
| ESLint + TypeScript + Vite configs | toolchain |
| Supabase JS client pattern | optional remote provider |
| Leaflet experience (patterns only) | map presentation ideas |

## Components / systems that should not enter Playa product surface

- Registry admin, staging, publishing, import, revisions
- Discovery ingest (`artelier-ingest`, feed approve/publish)
- Ecommerce / Shopify / wholesale / NFC / ErgoKiwi chat leftovers
- Creative CV / resume export
- Full member feed, opportunities RSS, messaging product UI
- Organization management beyond optional future registry link
- Burning Man archive ingestion CLI / admin import modes
- MCP Artelier member/admin tool surface as a product dependency

## Irrelevant routes / features (source App)

All `/artelier/*` (except conceptual BM field inspiration), `/admin/*`, `/account/registry/*`, `/burningman/*` archive browsing, unsubscribe/OAuth consent as Artelier product flows.

## Coupling risks

1. UI components calling Supabase directly (common in Artelier pages)
2. Shared Supabase project assumptions with main Artelier
3. BM collection visibility vs Registry publish rules confused with Playa sync
4. Prerender / SEO pipeline assuming Artelier route table
5. Service-role scripts under `scripts/` accidentally used from Playa ops
6. Cursor MCP server pointed at legacy Supabase project
7. Copying registry entity models instead of Playa sidequest domain types

## Recommended extraction strategy

1. Document (this file + `migration-from-artelier.md`).
2. Keep Playa `src/app`, `src/features`, `src/routes`, provider interfaces, sample data.
3. Maintain this directory as an independent Git repository (`Artelier_Playa`).
4. Add a Playa-specific remote backend only when deliberately designed; do not inherit Artelier `supabase/` trees.
5. Keep `package.json` scripts limited to Playa (`dev`, `build`, `lint`, `typecheck`, `test`).
6. Pull additional shared primitives from Artelier only via explicit one-way copy when required.

## Files that must not be modified until reviewed

- Live `.env` / `.env.migration` (secrets)
- Any remote Supabase project configuration
- The Artelier repository working tree, branches, stash, and remotes
- Artelier production deploy configs
- Any Artelier destructive ops scripts
- Scraper contract artifacts (unless Playa explicitly versions its own pack format)

## Dependency review

### Retain (foundation)

`react`, `react-dom`, `react-router-dom`, `zod`, `@hookform/resolvers`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, most `@radix-ui/*` used by shadcn, `tailwindcss`, `vite`, `typescript`, `vitest`, `@testing-library/*`, `eslint` stack, `@supabase/supabase-js` (optional remote), `date-fns` (likely useful).

### Remove (later cleanup pass; not required to delete packages in this foundation commit)

Artelier-only weight: `docx` (CV export), `papaparse` (CSV import), `recharts`, `@lovable.dev/mcp-js`, `lovable-tagger` (dev), possibly `embla-carousel-*` if unused by shell, ecommerce-adjacent scripts (not npm deps).

### Requires later review

`@tanstack/react-query`, `zustand`, `framer-motion`, `next-themes`, `vaul`, `cmdk`, `input-otp`, `react-day-picker`, `react-resizable-panels`, `dompurify`.

### Likely needed later: offline mapping

`leaflet` / `react-leaflet` (already present), or MapLibre + `pmtiles` / `protomaps` for packaged basemaps.

### Likely needed later: IndexedDB

`idb` or `dexie` (not installed yet; prefer thin wrapper behind repositories).

### Likely needed later: PWA

`vite-plugin-pwa` (Workbox). Do not install until caching strategy is implemented.

### Not for core path

Web Bluetooth polyfills or native-only BLE stacks. Feature-detect only; never require for GPS experience.
