import { mapPackageCacheName } from "@/lib/pwa/versioning";
import { assertChecksumSha256 } from "@/features/playa-pack/utils/checksum";
import type { MapPackageAsset } from "@/features/map/schemas/mapPackageSchema";

/**
 * Stores large map tile blobs in Cache Storage under `sideburn-map-*` names.
 * Kept separate from the app-shell Workbox precache (see docs/offline-strategy.md).
 */
export type MapPackageAssetStore = {
  cacheNameFor(mapPackageId: string, contentVersion: string): string;
  putAsset(input: {
    mapPackageId: string;
    contentVersion: string;
    path: string;
    data: ArrayBuffer;
    expectedChecksumSha256: string;
  }): Promise<void>;
  getAssetBlob(input: {
    mapPackageId: string;
    contentVersion: string;
    path: string;
  }): Promise<Blob | null>;
  hasAsset(input: {
    mapPackageId: string;
    contentVersion: string;
    path: string;
  }): Promise<boolean>;
  ensureAssets(input: {
    mapPackageId: string;
    contentVersion: string;
    assets: MapPackageAsset[];
    loadFromPack: (path: string) => Promise<ArrayBuffer | null>;
  }): Promise<void>;
  revokeObjectUrls(urls: string[]): void;
  createObjectUrl(blob: Blob): string;
};

function assetRequestUrl(path: string): string {
  // Synthetic origin-relative URL used only as a Cache Storage key.
  return `/__sideburn-map-asset__/${encodeURIComponent(path)}`;
}

export function createCacheStorageMapPackageStore(): MapPackageAssetStore {
  const objectUrls = new Set<string>();

  return {
    cacheNameFor(mapPackageId, contentVersion) {
      return mapPackageCacheName(mapPackageId, contentVersion);
    },

    async putAsset({ mapPackageId, contentVersion, path, data, expectedChecksumSha256 }) {
      await assertChecksumSha256(data, expectedChecksumSha256);
      if (typeof caches === "undefined") {
        throw new Error("Cache Storage unavailable for map assets");
      }
      const cache = await caches.open(mapPackageCacheName(mapPackageId, contentVersion));
      const response = new Response(data, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(data.byteLength),
          "X-Sideburn-Checksum-Sha256": expectedChecksumSha256.toLowerCase(),
        },
      });
      await cache.put(assetRequestUrl(path), response);
    },

    async getAssetBlob({ mapPackageId, contentVersion, path }) {
      if (typeof caches === "undefined") return null;
      const cache = await caches.open(mapPackageCacheName(mapPackageId, contentVersion));
      const match = await cache.match(assetRequestUrl(path));
      if (!match) return null;
      return match.blob();
    },

    async hasAsset(input) {
      const blob = await this.getAssetBlob(input);
      return blob != null && blob.size > 0;
    },

    async ensureAssets({ mapPackageId, contentVersion, assets, loadFromPack }) {
      for (const asset of assets) {
        if (asset.role !== "pmtiles") continue;
        const present = await this.hasAsset({ mapPackageId, contentVersion, path: asset.path });
        if (present) continue;
        const data = await loadFromPack(asset.path);
        if (!data) {
          throw new Error(`Missing map asset in pack storage: ${asset.path}`);
        }
        if (data.byteLength !== asset.byteSize) {
          throw new Error(
            `Map asset size mismatch for ${asset.path}: expected ${asset.byteSize}, got ${data.byteLength}`,
          );
        }
        await this.putAsset({
          mapPackageId,
          contentVersion,
          path: asset.path,
          data,
          expectedChecksumSha256: asset.checksumSha256,
        });
      }
    },

    createObjectUrl(blob) {
      const url = URL.createObjectURL(blob);
      objectUrls.add(url);
      return url;
    },

    revokeObjectUrls(urls) {
      for (const url of urls) {
        if (objectUrls.has(url)) {
          URL.revokeObjectURL(url);
          objectUrls.delete(url);
        }
      }
    },
  };
}

/** In-memory store for unit tests (no Cache Storage required). */
export function createMemoryMapPackageStore(): MapPackageAssetStore {
  const blobs = new Map<string, Blob>();
  const objectUrls = new Set<string>();

  const key = (mapPackageId: string, contentVersion: string, path: string) =>
    `${mapPackageCacheName(mapPackageId, contentVersion)}::${path}`;

  return {
    cacheNameFor: mapPackageCacheName,

    async putAsset({ mapPackageId, contentVersion, path, data, expectedChecksumSha256 }) {
      await assertChecksumSha256(data, expectedChecksumSha256);
      blobs.set(key(mapPackageId, contentVersion, path), new Blob([data]));
    },

    async getAssetBlob({ mapPackageId, contentVersion, path }) {
      return blobs.get(key(mapPackageId, contentVersion, path)) ?? null;
    },

    async hasAsset(input) {
      const blob = await this.getAssetBlob(input);
      return blob != null && blob.size > 0;
    },

    async ensureAssets({ mapPackageId, contentVersion, assets, loadFromPack }) {
      for (const asset of assets) {
        if (asset.role !== "pmtiles") continue;
        if (await this.hasAsset({ mapPackageId, contentVersion, path: asset.path })) continue;
        const data = await loadFromPack(asset.path);
        if (!data) throw new Error(`Missing map asset in pack storage: ${asset.path}`);
        await this.putAsset({
          mapPackageId,
          contentVersion,
          path: asset.path,
          data,
          expectedChecksumSha256: asset.checksumSha256,
        });
      }
    },

    createObjectUrl(blob) {
      const url = URL.createObjectURL(blob);
      objectUrls.add(url);
      return url;
    },

    revokeObjectUrls(urls) {
      for (const url of urls) {
        if (objectUrls.has(url)) {
          URL.revokeObjectURL(url);
          objectUrls.delete(url);
        }
      }
    },
  };
}
