# Routes

Scoped guidance for `src/routes/*`. Root `AGENTS.md` and `.cursor/rules/` still apply.

## Thin pages

Route modules compose layout, feature hooks, and feature components. They should not:

- Call Supabase or other remote clients
- Own IndexedDB / cache / outbox logic
- Embed map-engine APIs or proximity math
- Duplicate provider selection

Prefer: load data via feature hooks → render feature UI → handle navigation and simple page-level empty/error chrome.

## UX states

For user-facing routes, consider empty, loading, error, offline, and unsupported (e.g. geolocation denied) states.

## Refresh

Prefer patterns that survive direct URL load / hard refresh for each route (router already mounts pages under `FieldShell`). Add tests when route data loading becomes non-trivial.
