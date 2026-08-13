/** Version tokens for shell caches vs pack / map formats. Bump deliberately. */
export const APP_SHELL_CACHE_VERSION = "sideburn-shell-0.3.1";
export const PLAYA_PACK_FORMAT_VERSION = "playa-pack-0.1.0";
export const SIDEBURNS_MAP_FORMAT_VERSION = "sideburn-map-0.1.0";
export const SAMPLE_DATA_VERSION = "sample-data-0.1.0";

/** Prefix Workbox uses for app-shell Cache Storage entries (not IndexedDB). */
export function appShellCacheId(): string {
  return APP_SHELL_CACHE_VERSION;
}

export function appShellFontCacheName(): string {
  return `${APP_SHELL_CACHE_VERSION}-fonts`;
}

/**
 * Cache Storage name prefixes owned by the app shell.
 * Pack / map caches must use different prefixes so shell updates never claim them.
 */
export const APP_SHELL_CACHE_PREFIXES = [APP_SHELL_CACHE_VERSION] as const;

/**
 * Pack / map Cache Storage prefixes — must stay distinct from the app shell.
 * Map tile blobs use `mapPackageCacheName(id, version)` → `sideburn-map-…`.
 */
export const NON_SHELL_CACHE_PREFIXES = [
  PLAYA_PACK_FORMAT_VERSION,
  "sideburn-map-",
  "sideburn-pack-",
] as const;

/** Versioned Cache Storage name for a packaged map asset set (not shell precache). */
export function mapPackageCacheName(mapPackageId: string, contentVersion: string): string {
  const safeId = mapPackageId.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const safeVersion = contentVersion.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `sideburn-map-${safeId}-${safeVersion}`;
}

export function isAppShellCacheName(cacheName: string): boolean {
  return APP_SHELL_CACHE_PREFIXES.some(
    (prefix) => cacheName === prefix || cacheName.startsWith(`${prefix}-`) || cacheName.includes(prefix),
  );
}

export function isReservedNonShellCacheName(cacheName: string): boolean {
  return NON_SHELL_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix) || cacheName.includes(prefix));
}
