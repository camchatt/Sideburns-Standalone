# SIDEBURNS brand icons

Install / favicon / PWA icons are derived from the canonical mark at repo-root `Logo.png`.

## Current assets

| Asset | Role |
|-------|------|
| `Logo.png` (repo root) | Canonical source artwork |
| `public/images/sideburn-logo.png` | UI mark (shell, welcome) |
| `public/images/sideburn-favicon.png` | Favicon (64×64) |
| `public/icons/icon-192.png` | PWA any (192) |
| `public/icons/icon-512.png` | PWA any (512) |
| `public/icons/icon-192-maskable.png` | Maskable (192) — safe-zone padding |
| `public/icons/icon-512-maskable.png` | Maskable (512) — safe-zone padding |
| `public/icons/apple-touch-icon.png` | iOS home-screen (180) |

Regenerate from `Logo.png`:

```powershell
powershell -File scripts/generate-pwa-icons.ps1
```

After regenerating icons, bump `APP_SHELL_CACHE_VERSION` in `src/lib/pwa/versioning.ts` so installed clients pick up the new shell assets.
