import {
  APP_SHELL_CACHE_VERSION,
  PLAYA_PACK_FORMAT_VERSION,
  SIDEBURNS_MAP_FORMAT_VERSION,
  appShellCacheId,
  appShellFontCacheName,
  isAppShellCacheName,
  isReservedNonShellCacheName,
  mapPackageCacheName,
} from "@/lib/pwa/versioning";

describe("pwa versioning", () => {
  it("keeps explicit versioned shell cache names", () => {
    expect(APP_SHELL_CACHE_VERSION).toMatch(/^sideburn-shell-/);
    expect(appShellCacheId()).toBe(APP_SHELL_CACHE_VERSION);
    expect(appShellFontCacheName()).toBe(`${APP_SHELL_CACHE_VERSION}-fonts`);
  });

  it("separates shell cache names from pack/map prefixes", () => {
    expect(isAppShellCacheName(APP_SHELL_CACHE_VERSION)).toBe(true);
    expect(isAppShellCacheName(`${APP_SHELL_CACHE_VERSION}-fonts`)).toBe(true);
    expect(isAppShellCacheName(PLAYA_PACK_FORMAT_VERSION)).toBe(false);
    expect(isReservedNonShellCacheName("sideburn-map-v1")).toBe(true);
    expect(isReservedNonShellCacheName("sideburn-pack-chunks")).toBe(true);
    expect(isReservedNonShellCacheName(APP_SHELL_CACHE_VERSION)).toBe(false);
  });

  it("builds versioned non-shell map package cache names", () => {
    expect(SIDEBURNS_MAP_FORMAT_VERSION).toBe("sideburn-map-0.1.0");
    expect(mapPackageCacheName("bm-2026-demo-map", "2026.1.0")).toBe(
      "sideburn-map-bm-2026-demo-map-2026.1.0",
    );
    expect(isReservedNonShellCacheName(mapPackageCacheName("x", "1"))).toBe(true);
    expect(isAppShellCacheName(mapPackageCacheName("x", "1"))).toBe(false);
  });
});
