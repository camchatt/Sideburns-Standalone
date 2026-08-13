# Feature modules

Scoped guidance for `src/features/*`. Root `AGENTS.md` and `.cursor/rules/` still apply.

## Layout

Each feature should keep domain work local:

```text
features/<name>/
  components/   # feature UI only
  hooks/
  providers/    # concrete *Provider implementations when feature-owned
  repositories/ # local / remote data access
  schemas/      # Zod
  services/     # orchestration / use-cases
  types/        # domain types (PascalCase)
  utils/        # pure helpers (proximity math, etc.)
```

Not every folder is required on day one - add folders when code appears. Prefer kebab-case feature folder names (`playa-pack`, `sidequests`).

## Rules

- Put significant business logic here, not in `src/routes/*` or shared layout.
- Export typed provider interfaces from `types/`; keep implementations swappable.
- Validate external and persisted payloads in `schemas/` before they reach UI.
- Do not import Supabase clients into `components/`.
- Do not import from the Artelier repo directory on disk.
- GPS vs Bluetooth proximity stay separate features/concerns (`location` / `proximity`); Bluetooth never blocks core flows.
- Map presentation details stay behind `map` providers/services so other features depend on domain types only.

## Current stubs vs product phases

Many folders are foundation stubs. Implement persistence, packs, maps, GPS product UX, offline CRUD, sync, and Bluetooth only when that phase is the assigned task - do not "finish" neighboring stubs as drive-by work.
