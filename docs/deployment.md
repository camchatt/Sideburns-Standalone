# SIDEBURNS deployment

**Do not deploy until explicitly authorized.**

SIDEBURNS ships as an **installable Progressive Web App (PWA)** from a static HTTPS origin. This release is **not** distributed through the Apple App Store or Google Play. A later Capacitor (or similar) native wrapper is optional and not implemented here.

Primary hosting target in-repo: **static Vite `dist/`** with SPA rewrite configs for **Netlify** (`netlify.toml` + `public/_redirects`) and **Vercel** (`vercel.json`). Cloudflare Pages can use the same `_redirects` file. Choose one host; do not assume multi-host CI is wired yet.

## Supported Node / npm

| Tool | Supported | Notes |
|------|-----------|-------|
| Node.js | **20.x** (Active/Maintenance LTS) or **22.x** (Current LTS) | Declared in `package.json` `engines` as `>=20.19.0 <23` and `.nvmrc` → `20` |
| npm | **10.x+** | Declared as `engines.npm` `>=10.0.0` (ships with Node 20+) |

Use `nvm use` / `fnm use` with `.nvmrc`, or set the host’s Node version to **20** (see `netlify.toml` `NODE_VERSION`). Do not rely on Node 18; Vite 5 and current tooling expect modern LTS.

Verify locally:

```powershell
node -v   # expect v20.x or v22.x
npm -v    # expect 10.x+
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run audit:field-readiness
```

## Environment modes

Validated by `src/lib/validation/env.ts` (also at Vite config load / production build). Browser-exposed vars use the `VITE_` prefix only. **Never** set `VITE_SUPABASE_SERVICE_ROLE_KEY` or put a service-role JWT in any `VITE_*` slot — validation rejects them and they must never enter the bundle.

| Mode | Typical `VITE_APP_ENV` | `VITE_DATA_PROVIDER` | Credentials | Use |
|------|------------------------|----------------------|-------------|-----|
| **Sample / local prototype** | `development` or `prototype` | `sample` (default) | None | Default field prototyping; fully offline |
| **Preview (static preview / staging)** | `prototype` or `production` | `sample` **or** `supabase` | If supabase: SIDEBURNS URL + anon/publishable only | `npm run preview` or a staging HTTPS host |
| **Production** | `production` | `sample` (content-only) **or** `supabase` (sync backend) | If supabase: **required** hosted SIDEBURNS HTTPS URL + anon/publishable key | Authorized public origin only |

### Sample mode

```text
VITE_APP_ENV=development
VITE_DATA_PROVIDER=sample
VITE_MAP_SOURCE=sample
VITE_ENABLE_PROTOTYPE_CONTROLS=true
VITE_ENABLE_BLUETOOTH_EXPERIMENT=false
```

No Supabase project required. Catalog stays local/sample.

### Preview mode

```text
VITE_APP_ENV=prototype
VITE_DATA_PROVIDER=sample
VITE_MAP_SOURCE=packaged
VITE_ENABLE_PROTOTYPE_CONTROLS=true
VITE_ENABLE_BLUETOOTH_EXPERIMENT=false
```

Optional sync exercise against **local** Supabase CLI (not production):

```text
VITE_DATA_PROVIDER=supabase
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon from supabase status>
```

Loopback `http://` is allowed only when `VITE_APP_ENV` is **not** `production`.

### Production mode

Committed defaults live in `.env.production` (sample provider, no secrets). Host/CI may override.

```text
VITE_APP_ENV=production
VITE_DATA_PROVIDER=sample
VITE_MAP_SOURCE=remote
VITE_ENABLE_PROTOTYPE_CONTROLS=false
VITE_ENABLE_BLUETOOTH_EXPERIMENT=false
```

`VITE_MAP_SOURCE=remote` uses temporary Esri World Imagery CDN tiles (CORS) when no offline pack is active. Do **not** rely on Vercel `/tiles/*` external rewrites — those failed in production (500/timeout). Prefer `packaged` once event packs ship real MapLibre/PMTiles basemaps.

Set the same `VITE_*` keys on the **Production** environment in the host dashboard (Preview-only vars are not applied to `vercel --prod` builds).

With deferred sync enabled (after hosted SIDEBURNS project approval):

```text
VITE_APP_ENV=production
VITE_DATA_PROVIDER=supabase
VITE_SUPABASE_URL=https://<SIDEBURNS-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable/anon key only>
VITE_MAP_SOURCE=packaged
VITE_ENABLE_PROTOTYPE_CONTROLS=false
VITE_ENABLE_BLUETOOTH_EXPERIMENT=false
```

Production rules enforced by env validation:

- `VITE_DATA_PROVIDER=supabase` without a valid SIDEBURNS URL + publishable/anon key **fails clearly** (build throws when `mode`/`VITE_APP_ENV` is production).
- Production Supabase URL must be **https** and must **not** be localhost.
- `VITE_ENABLE_PROTOTYPE_CONTROLS` must be false/unset in production.
- Service-role keys are always rejected.

Honesty reminder: `VITE_DATA_PROVIDER=supabase` enables the **sync backend**; Explore/Nearby catalog remains local-first (`catalogSource` / `syncBackend` on the data bundle). Do not claim live Supabase catalog reads unless that ships later.

Full variable table: `docs/development.md`. Backend design: `docs/supabase-backend.md`.

## HTTPS and secure contexts

Geolocation (`navigator.geolocation`) and service workers require a **secure context**. Outside `localhost` / loopback, that means **HTTPS**.

| Origin | Geolocation | Service worker / installability |
|--------|-------------|-------------------------------|
| `http://localhost:*` / `127.0.0.1` | Allowed | Allowed |
| `https://<production-host>` | Allowed (after user permission) | Required for PWA install + SW |
| `http://<public-host>` | **Blocked** / unreliable | **Blocked** |

Host checklist:

1. Terminate TLS at the CDN/host (managed cert is fine).
2. Redirect HTTP → HTTPS.
3. Serve the app only from the canonical HTTPS origin used in Supabase Auth redirect allow-lists.
4. Verify on a real phone: open HTTPS origin → install prompt / Add to Home Screen → GPS opt-in on Nearby or Map.

`npm run preview` is suitable for local secure-context checks on loopback only; it is not a substitute for an HTTPS staging deploy.

## SPA route fallback

React Router uses browser history paths (`/nearby`, `/offline-readiness`, …). The static host must serve `index.html` for unknown paths on **first navigation** (before Workbox `navigateFallback: "/index.html"` controls subsequent loads).

| Host | Config in repo | Behavior |
|------|----------------|----------|
| **Netlify** | `netlify.toml` `[[redirects]]` + `public/_redirects` | `/* → /index.html` **200**; real files (`/maps/*`, `/packs/*`, hashed assets) still served |
| **Vercel** | `vercel.json` `rewrites` | `/(.*) → /index.html` after filesystem match |
| **Cloudflare Pages** | `public/_redirects` | Same Netlify-style `/* /index.html 200` |
| **GitHub Pages** | *Not preconfigured* | Needs `404.html` = copy of `index.html` (or equivalent action); prefer Netlify/Vercel/Cloudflare for PWA headers |

After deploy, verify:

1. Cold load `https://<host>/`
2. Cold load `https://<host>/nearby` (must not 404 HTML from the CDN)
3. Hard refresh on a deep link
4. Airplane-mode revisit after one online visit (SW shell)

Workbox denylist keeps `/maps/` and `/packs/` off navigate fallback so large datasets are not treated as SPA routes.

## Production deployment checklist

Do **not** execute remote deploy or Supabase apply without explicit approval.

### Build & app

- [ ] Node/npm versions match Supported Node / npm above
- [ ] `.env` / host env uses SIDEBURNS credentials only (never Artelier)
- [ ] No `VITE_SUPABASE_SERVICE_ROLE_KEY`; publishable/anon only
- [ ] `VITE_APP_ENV=production` and prototype controls off
- [ ] `npm run lint` · `typecheck` · `test` · `build` · `audit:field-readiness` pass
- [ ] Field Status honesty: sample catalog vs supabase sync labels understood

### Static host (still must be configured in the provider UI)

- [ ] Connect GitHub repo `camchatt/Sideburn` (or chosen remote) to the host
- [ ] Set build command `npm run build`, publish dir `dist`, Node 20
- [ ] Set `VITE_*` secrets/env in the host dashboard (not in git)
- [ ] Enforce HTTPS + HTTP→HTTPS redirect
- [ ] Confirm SPA rewrite active (`/nearby` cold load)
- [ ] Confirm `Cache-Control: no-cache` on service worker assets (provided in host configs; verify in Network panel)
- [ ] Custom domain + DNS (if used) pointed at the host
- [ ] Optional: preview/staging site separate from production

### Supabase dashboard (still must be configured; needs approval)

- [ ] Dedicated SIDEBURNS project created (not Artelier)
- [ ] Migrations reviewed and **approved** before `db push` / CI migrate
- [ ] Auth: anonymous and/or magic link decisions applied
- [ ] Site URL + redirect allow-list include the HTTPS PWA origin
- [ ] RLS verified with a second test user
- [ ] Anon key copied to host env; service-role kept server-only / never in Vite
- [ ] Optional `event_packs` publish workflow decided

### Post-deploy smoke (human)

- [ ] Installable PWA on Android Chrome and iOS Safari “Add to Home Screen”
- [ ] Offline shell + sample/pack map after first visit
- [ ] Foreground location opt-in only; denied path still usable
- [ ] Sync paused without auth; outbox preserved (if supabase mode)

## Future Capacitor wrapper (not in this release)

The web app remains the source of truth. A later Capacitor shell may:

- Package the same `dist/` UI for store binaries if product later chooses native distribution
- Access stronger background/location APIs where the OS allows
- Keep domain logic in `src/features/*` so the native shell does not fork business rules

Do **not** implement Capacitor, store listings, or claim App Store / Play distribution until that phase is explicitly requested. Until then, communicate SIDEBURNS as an **installable PWA** only.

## Related docs

- Release gates: [`docs/release-checklist.md`](./release-checklist.md)
- Privacy + deletion design: [`docs/privacy-and-deletion.md`](./privacy-and-deletion.md)
- Offline / device QA: [`docs/offline-strategy.md`](./offline-strategy.md)
- Sync protocol: [`docs/sync.md`](./sync.md)
- Supabase schema / RLS: [`docs/supabase-backend.md`](./supabase-backend.md)
