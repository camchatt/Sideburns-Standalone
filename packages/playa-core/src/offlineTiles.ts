import { BRC_MAP_BOUNDS } from "./geo";

/** Cache API store for Black Rock City imagery tiles (phone / PWA offline). */
export const PLAYA_OFFLINE_CACHE = "artelier.playa-imagery.v1";

export const PLAYA_IMAGERY_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/** Zoom pack tuned for Sidequester / playa map (keeps size phone-friendly). */
export const PLAYA_OFFLINE_MIN_ZOOM = 12;
export const PLAYA_OFFLINE_MAX_ZOOM = 15;

export type PlayaOfflineProgress = {
  done: number;
  total: number;
  phase: "counting" | "downloading" | "done" | "error";
  message?: string;
};

export type PlayaOfflineStatus = {
  ready: boolean;
  tileCount: number;
  approxBytes: number | null;
};

function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z,
  );
}

export function playaImageryTileUrl(z: number, x: number, y: number): string {
  return PLAYA_IMAGERY_TILE_URL.replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

/** All imagery tile URLs covering BRC for the offline zoom pack. */
export function listPlayaOfflineTileUrls(
  minZoom = PLAYA_OFFLINE_MIN_ZOOM,
  maxZoom = PLAYA_OFFLINE_MAX_ZOOM,
): string[] {
  const urls: string[] = [];
  const { minLatitude, maxLatitude, minLongitude, maxLongitude } = BRC_MAP_BOUNDS;
  for (let z = minZoom; z <= maxZoom; z++) {
    const x0 = lngToTileX(minLongitude, z);
    const x1 = lngToTileX(maxLongitude, z);
    const y0 = latToTileY(maxLatitude, z); // north → smaller y
    const y1 = latToTileY(minLatitude, z);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        urls.push(playaImageryTileUrl(z, x, y));
      }
    }
  }
  return urls;
}

export async function getPlayaOfflineStatus(): Promise<PlayaOfflineStatus> {
  if (typeof caches === "undefined") {
    return { ready: false, tileCount: 0, approxBytes: null };
  }
  const cache = await caches.open(PLAYA_OFFLINE_CACHE);
  const keys = await cache.keys();
  const expected = listPlayaOfflineTileUrls().length;
  let approxBytes: number | null = null;
  // Sample a few responses for a rough size estimate
  if (keys.length > 0) {
    let sample = 0;
    let sampleBytes = 0;
    for (const req of keys.slice(0, 8)) {
      const res = await cache.match(req);
      if (!res) continue;
      const buf = await res.clone().arrayBuffer();
      sample += 1;
      sampleBytes += buf.byteLength;
    }
    if (sample > 0) {
      approxBytes = Math.round((sampleBytes / sample) * keys.length);
    }
  }
  return {
    ready: keys.length >= Math.floor(expected * 0.9),
    tileCount: keys.length,
    approxBytes,
  };
}

/**
 * Resolve a tile URL from the offline cache, else network (and cache on success).
 * Returns an object URL or the original URL string.
 */
export async function resolvePlayaTileSrc(url: string): Promise<string> {
  if (typeof caches !== "undefined") {
    const cache = await caches.open(PLAYA_OFFLINE_CACHE);
    const hit = await cache.match(url);
    if (hit) {
      const blob = await hit.blob();
      return URL.createObjectURL(blob);
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new Error("Tile unavailable offline");
    }
    try {
      const res = await fetch(url, { mode: "cors", credentials: "omit" });
      if (res.ok) {
        await cache.put(url, res.clone());
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      }
    } catch {
      // fall through to direct URL
    }
  }
  return url;
}

/**
 * Download the BRC imagery pack into Cache Storage for offline use on phones.
 */
export async function downloadPlayaOfflinePack(
  onProgress?: (p: PlayaOfflineProgress) => void,
  signal?: AbortSignal,
): Promise<PlayaOfflineStatus> {
  if (typeof caches === "undefined") {
    throw new Error("Offline cache is not supported in this browser.");
  }
  onProgress?.({ done: 0, total: 0, phase: "counting" });
  const urls = listPlayaOfflineTileUrls();
  const total = urls.length;
  onProgress?.({ done: 0, total, phase: "downloading" });

  const cache = await caches.open(PLAYA_OFFLINE_CACHE);
  let done = 0;
  const concurrency = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const i = cursor++;
      const url = urls[i];
      try {
        const existing = await cache.match(url);
        if (!existing) {
          const res = await fetch(url, {
            mode: "cors",
            credentials: "omit",
            signal,
          });
          if (res.ok) await cache.put(url, res.clone());
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        // skip failed tile; pack can still be mostly useful
      }
      done += 1;
      if (done % 4 === 0 || done === total) {
        onProgress?.({ done, total, phase: "downloading" });
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );

  const status = await getPlayaOfflineStatus();
  onProgress?.({
    done: total,
    total,
    phase: "done",
    message: status.ready
      ? "Playa imagery saved on this device."
      : "Saved with some gaps — try again on a stronger connection.",
  });
  return status;
}

export async function clearPlayaOfflinePack(): Promise<void> {
  if (typeof caches === "undefined") return;
  await caches.delete(PLAYA_OFFLINE_CACHE);
}

export function formatOfflineBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
