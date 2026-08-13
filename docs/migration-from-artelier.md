# Historical migration notes (SIDEBURNS lineage)

> **Product identity:** the application is **SIDEBURNS**. This document is historical engineering lineage only — not user-facing product copy.

## Standalone project location

```text
C:\Users\camch\OneDrive\Documents\Artelier_Playa
```

Public repository: `https://github.com/camchatt/Sideburn`

SIDEBURNS is independent of:

```text
C:\Users\camch\OneDrive\Documents\Artelier
```

It has its own Git history, package name (`sideburn`), docs, and environment configuration. It is not a worktree, subfolder, or branch-only checkout of another product.

## Source lineage

- Conceptually derived from an earlier Vite + React + shadcn codebase
- Foundation code was selectively copied into this directory
- The source product repository must remain untouched by SIDEBURNS development

## What was retained

- Vite + React + TypeScript toolchain
- Tailwind / CSS variable design tokens and fonts
- shadcn `src/components/ui/*`
- `cn` helper (`src/lib/utils.ts`)
- Zod + Vitest + Testing Library
- Optional Supabase JS client pattern (no secrets bundled)
- Interactive Leaflet map presentation, adapted behind SIDEBURNS-owned providers and repositories
- Field shell, feature providers, sample sidequests, and architecture docs

## What was not copied

- Foreign `.git` history / remotes
- `.env` secrets
- `node_modules` / `dist`
- `legacy/` product dump
- `supabase/` migrations and Edge Functions
- Registry admin, staging, publishing, import tooling
- Member feed, opportunities, messaging product UI
- Ecommerce leftovers
- Scraper contracts, BM CLI data trees, Lovable MCP tooling

## What remains shared conceptually

- Brand typography and accent tokens (to be replaced with final SIDEBURNS visual system over time)
- Optional future auth / profile linking (generic identity — not another product’s accounts in UI)

## What must not remain coupled

- Runtime imports from the Artelier directory on disk
- Shared deploy lockstep with another product
- Assuming official Burning Man APIs exist
- Treating another product’s registry publish rules as SIDEBURNS sync rules
- User-facing Artelier branding, URLs, or terminology

## Unresolved dependencies

1. Separate Supabase project vs isolated schema decision
2. Final offline map format (PMTiles vs other) — **MapLibre + optional PMTiles** behind `MapProvider` (`sideburn-map-0.1.0`); demo pack ships a lightweight offline style
3. Capacitor adoption timeline
4. Replacement of the temporary online Esri basemap with packaged MapLibre / PMTiles assets
5. IndexedDB rename from legacy `artelier-playa` → `sideburn` (copy-migrate; see `docs/architecture.md`)
6. SIDEBURNS logo / PWA icons (brand mark shipped)

## Map recovery notes

The map UX from an earlier July 29, 2026 reference commit is the visual reference for the map-first experience. Clock rings, Man marker, interactive placement markers, camera behavior, filters, record panel, and interaction icon language live in `src/features/map`.

SIDEBURNS mirrors mapped vs approximate list chrome and richer placement detail without registry credits or authenticated third-party interaction controls. Social Follow is out of product scope.

Browser GPS live-follow and offline sidequest create/complete are SIDEBURNS-owned (IndexedDB stores). Creates/completions stay local until deferred sync (phase 7). Live Supabase rows still require usable coordinates or clock/distance derivation; rows that cannot be placed stay excluded until an explicit unmapped payload field is added.
