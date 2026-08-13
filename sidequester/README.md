# Sidequester

Mobile-first playa map: drop beacons, filter layers, and build multi-stop quests.

Uses local `@artelier/playa-core` from `../packages/playa-core`.

## Dev

From the Sideburns repo root:

```bash
npm install
npm run dev
```

Opens at http://localhost:8090

Or from this folder: `npm run dev` (after a root `npm install`).

## Env

Copy `.env.example` → `.env.local`:

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` — Burning Man public projects
- `VITE_BEACONS_SUPABASE_URL` / `VITE_BEACONS_SUPABASE_PUBLISHABLE_KEY` — UGC beacon sync
- `VITE_INCLUDE_DEMO_BEACONS=false` — skip festival service demo pins

## Notes

- Beacons and quests persist in `localStorage` on this origin
- Multi-device pin sync requires the beacons Supabase keys above
- `base: "./"` so Capacitor can load assets from the local webview
