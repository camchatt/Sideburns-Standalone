# SIDEBURNS privacy outline and data deletion

This document is a **product/legal outline**, not a substitute for counsel-reviewed policy text. Publish a final privacy policy on the HTTPS PWA origin before inviting broad optional account use. SIDEBURNS is an **installable PWA**; it is not a native app-store product in this release.

Related: [`docs/deployment.md`](./deployment.md), [`docs/supabase-backend.md`](./supabase-backend.md), [`docs/sync.md`](./sync.md).

---

## Privacy policy outline

### 1. Who we are

- Product: **SIDEBURNS** — offline-first field companion for Burning Man sidequests.
- Independent of other products; no shared user-facing branding or accounts with third-party registries.
- Contact / operator identity: *to be filled before public launch*.

### 2. What the app does offline

- Core browse / map / nearby / create / complete flows work from **on-device** storage (IndexedDB, Cache Storage) and optional downloaded playa packs.
- Network is not required to open the app shell after an initial install/visit on a secure origin.

### 3. Foreground location

- Location is **opt-in** and **foreground-oriented**.
- Permission / `watchPosition` starts only after an explicit user action (e.g. Nearby “Use my location”, Map enable/follow, Create “Use my location”).
- Opening Map, Explore, or other routes does **not** by itself require GPS.
- Denied or unavailable location keeps browsing available; proximity-gated completion may be unavailable until a usable fix exists.
- Coordinates are processed **on-device** for distance ranking and proximity checks.
- SIDEBURNS does **not** claim background tracking on iOS/Android web installs.
- Future features must not upload continuous location trails without a separate, explicit disclosure and control.

### 4. Local storage on the device

Typical local categories:

| Category | Examples | Leaves device? |
|----------|----------|----------------|
| App shell cache | Service worker precache | No (CDN already public) |
| Playa packs / maps | Manifests, JSON, PMTiles blobs | Downloaded from host/CDN; stored locally |
| User sidequests / progress / completions | IndexedDB | Only if user enables sync + auth |
| Sync outbox | Pending operations | Only when sync applies to SIDEBURNS Supabase |
| Auth session | Supabase session in `localStorage` when used | Refresh with Supabase Auth |

Storage persistence (`navigator.storage.persist`) may be denied; the app treats that as non-fatal and warns in readiness UI.

### 5. Optional accounts

- Field use does **not** require an account when running in sample / local-first mode.
- Optional **anonymous** Supabase session may be offered to enable deferred sync / backup (product approval to enable on hosted project).
- Optional later **email magic-link** (or similar) may link an anonymous identity for recovery — requires inbox + connectivity at link time.
- Auth is handled by the dedicated SIDEBURNS Supabase project only (never Artelier credentials).

### 6. Synchronization

- Local writes happen **before** any remote attempt.
- When sync is enabled and the user is authenticated, entity payloads (sidequests, progress, completions) and operation receipts may be sent to SIDEBURNS Postgres via `apply_sync_operation`.
- Failed and conflicting operations are preserved locally until resolved; they are not silently discarded.
- Official event pack **content** is not modeled as private user rows; pack files stay on static hosting / CDN + local pack storage.
- Browser clients use the **publishable/anon** key only. Service-role keys never ship in the web app.

### 7. Analytics, ads, and third parties

- Default prototype: no third-party ad networks.
- If analytics are added later, list vendors, data categories, and opt-out here.
- Map/font CDNs (if any) may see IP requests when online; prefer self-hosted assets for field builds when practical.

### 8. Children

- Not directed at children under 13 (or applicable local age). Adjust before launch if required.

### 9. Retention

- Local data remains until the user clears site data, uninstalls the PWA, or uses in-app deletion (when shipped).
- Remote rows use soft-delete (`deleted_at`) where designed; hard purge follows the deletion workflow below.
- Define numeric retention for inactive accounts before launch (*TBD*).

### 10. User rights and contact

- Access, export, correction, and deletion requests: *operator contact TBD*.
- Jurisdiction / lead authority: *TBD*.

### 11. Policy updates

- Material changes posted on the HTTPS origin; date stamp required on the public policy page.

---

## Data-deletion / account-deletion workflow (design)

Status: **design only** — not fully implemented as self-serve UI. Operators need a runbook before enabling hosted accounts at scale.

### Goals

1. Let a user remove **device-local** SIDEBURNS data without needing network.
2. Let a user (or operator) erase **remote** SIDEBURNS account data when sync/auth was used.
3. Preserve forensic clarity: soft-delete first where useful, then hard purge on request / schedule.
4. Never require Artelier systems for SIDEBURNS erasure.

### A. Device-local deletion (user-controlled)

| Step | Action | Notes |
|------|--------|-------|
| A1 | In-app “Clear local SIDEBURNS data” (future UI) | Delete IndexedDB (`artelier-playa` name until dedicated rename), pack/map Cache Storage prefixes, and clear auth `localStorage` keys for this origin |
| A2 | OS / browser “Clear site data” / remove Home Screen app | Equivalent hard local wipe |
| A3 | Outbox | Local pending ops deleted with DB wipe; warn that uncleared remote copies may remain if previously synced |

Until in-app clear ships, document browser site-data clearing in support copy.

### B. Remote account deletion (synced users)

Prerequisite: dedicated SIDEBURNS Supabase project; service-role used **only** in a controlled operator/Edge context — never in `VITE_*`.

| Step | Action | Notes |
|------|--------|-------|
| B1 | Authenticate the requester | Session user or verified email ticket |
| B2 | Soft-delete owner rows | Set `deleted_at` on `user_sidequests`, `user_sidequest_progress`, `user_quest_completions`, related receipts as policy dictates |
| B3 | Hard purge (GDPR-style) | Delete owner rows from user tables + `sync_operation_receipts`; delete `profiles` row; delete `auth.users` via Admin API |
| B4 | Confirm | Operator sends confirmation; client signs out and prompts A1 local clear |
| B5 | Pack catalog | `event_packs` are not user PII; no per-user delete |

Suggested future RPC / Edge Function: `request_account_deletion` (authenticated) enqueue + admin job, or synchronous admin delete with explicit approval. Product must approve before implementation.

### C. Anonymous session without link

- If the user only had an anonymous auth user and clears the device, remote rows may become orphaned.
- Deletion request path: prove control of the anonymous session before wipe, **or** time-based purge of anonymous accounts with no activity (*retention TBD*).
- Encourage optional email link-up before desert travel if recovery/deletion support matters.

### D. Operator checklist (incident / request)

1. Verify identity and SIDEBURNS project ref.
2. Export optional snapshot if legally required, then delete.
3. Run B2→B3 with service-role in secure environment.
4. Revoke sessions.
5. Instruct user to clear site data (A2) on all devices.
6. Record ticket id + timestamp (no unnecessary PII in git).

### E. What is out of scope for v1 automation

- Cross-product deletion in non-SIDEBURNS systems
- Automatic deletion of CDN logs / host access logs (follow host retention)
- Native store account deletion APIs (no store distribution in this release)

### F. Implementation follow-ups (explicit later work)

- Settings UI: export local data, clear local data, request remote delete
- Edge Function or approved SQL runbook for hard purge
- Public privacy policy page route or static page on the PWA origin
- Retention job for abandoned anonymous users
