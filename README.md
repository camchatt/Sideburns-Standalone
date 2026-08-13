# SIDEBURNS

Standalone offline-first field PWA for Burning Man sidequests.

```text
C:\Users\camch\OneDrive\Documents\Artelier_Playa
```

Public repository: [github.com/camchatt/Sideburn](https://github.com/camchatt/Sideburn).

SIDEBURNS is publicly and technically independent. Users must not encounter other product branding, accounts, or database dependencies.

## Requirements

- **Node.js** 20.x or 22.x (`engines` in `package.json`; `.nvmrc` → 20)
- **npm** 10.x+

## Quick start

```powershell
cd C:\Users\camch\OneDrive\Documents\Artelier_Playa
npm install
npm run dev
```

Default mode uses sample data (`VITE_DATA_PROVIDER=sample`). Supabase credentials are not required.

Production builds register a Workbox service worker (app-shell precache). Verify install/offline behavior with `npm run build` then `npm run preview`, or on a device against a deployed **HTTPS** origin (geolocation and service workers need a secure context outside localhost). See `docs/offline-strategy.md` and `docs/deployment.md`.

SIDEBURNS ships as an **installable PWA**. This release is not distributed through native app stores. Do not deploy until explicitly authorized.

## Docs

- `docs/architecture.md`
- `docs/offline-strategy.md`
- `docs/data-model.md`
- `docs/development.md`
- `docs/deployment.md` (Node/npm, env modes, HTTPS, SPA hosts, production checklist)
- `docs/release-checklist.md`
- `docs/privacy-and-deletion.md`
- `AGENTS.md` (contributor / agent guide)

Historical lineage notes (not user-facing product docs): `docs/migration-from-artelier.md`, `docs/source-audit.md`.
