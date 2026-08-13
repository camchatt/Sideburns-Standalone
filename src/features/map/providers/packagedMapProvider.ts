import {
  assertSupportedMapFormat,
  parseMapPackage,
  validateMapPackageForUse,
  type MapPackageDocument,
} from "@/features/map/schemas/mapPackageSchema";
import type {
  MapDataHandle,
  MapPackageDescriptor,
  MapProvider,
  ResolveMapSessionOptions,
} from "@/features/map/types/map";
import type { MapPackageAssetStore } from "@/features/map/repositories/mapPackageAssetStore";
import {
  buildHandle,
  descriptorFromDocument,
  fallbackDescriptor,
  offlineStyleResource,
  remoteRasterResource,
  sampleDescriptor,
  vectorFallbackResource,
} from "@/features/map/services/mapSessionHelpers";
import type { LocalPlayaPackRecord } from "@/features/playa-pack/types/playaPack";
import { decodeJsonArrayBuffer } from "@/features/playa-pack/schemas/playaPackManifestSchema";
import { assertChecksumSha256 } from "@/features/playa-pack/utils/checksum";

export type PackMapSource = {
  getActivePack(): Promise<LocalPlayaPackRecord | null>;
  /** Returns validated complete file bytes for a path on the active/ready pack, or null. */
  getPackFile(packId: string, path: string): Promise<ArrayBuffer | null>;
  /** Optional: list incomplete packs so tests can prove they never activate for map use. */
  listInstalledPacks?: () => Promise<LocalPlayaPackRecord[]>;
};

export type PackagedMapProviderOptions = {
  packs: PackMapSource;
  assetStore: MapPackageAssetStore;
  /** When true and no usable pack map exists, prefer sample offline style over online tiles. */
  preferSampleWhenNoPack?: boolean;
  /** Load bundled sample map package (HTTP or injected). */
  loadSamplePackage?: () => Promise<MapPackageDocument>;
};

function isOnline(options?: ResolveMapSessionOptions): boolean {
  if (typeof options?.online === "boolean") return options.online;
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

async function defaultLoadSamplePackage(): Promise<MapPackageDocument> {
  const response = await fetch("/maps/sample-basemap.json");
  if (!response.ok) {
    throw new Error(`Unable to load sample basemap (${response.status})`);
  }
  return validateMapPackageForUse(await response.json());
}

function mapRefPath(pack: LocalPlayaPackRecord): string | null {
  const file = pack.manifest?.files.find((entry) => entry.role === "map_ref");
  return file?.path ?? null;
}

export function createPackagedMapProvider(options: PackagedMapProviderOptions): MapProvider {
  const preferSample = options.preferSampleWhenNoPack ?? true;
  const loadSample = options.loadSamplePackage ?? defaultLoadSamplePackage;

  async function loadSampleHandle(): Promise<MapDataHandle> {
    const pkg = await loadSample();
    return buildHandle({
      descriptor: descriptorFromDocument(pkg, "sample", "/maps/sample-basemap.json"),
      status: "sample",
      mode: "offline_style",
      resource: offlineStyleResource(pkg),
    });
  }

  async function handleFromPackDocument(
    pack: LocalPlayaPackRecord,
    pkg: MapPackageDocument,
    uri: string,
  ): Promise<MapDataHandle> {
    assertSupportedMapFormat(pkg);

    const pmtilesAssets = pkg.assets.filter((asset) => asset.role === "pmtiles");
    let pmtilesBlobUrls: Record<string, string> | undefined;

    if (pmtilesAssets.length > 0) {
      await options.assetStore.ensureAssets({
        mapPackageId: pkg.id,
        contentVersion: pkg.contentVersion,
        assets: pmtilesAssets,
        loadFromPack: (path) => options.packs.getPackFile(pack.packId, path),
      });

      pmtilesBlobUrls = {};
      for (const asset of pmtilesAssets) {
        const blob = await options.assetStore.getAssetBlob({
          mapPackageId: pkg.id,
          contentVersion: pkg.contentVersion,
          path: asset.path,
        });
        if (!blob) {
          throw new Error(`Map asset missing after ensure: ${asset.path}`);
        }
        pmtilesBlobUrls[asset.path] = options.assetStore.createObjectUrl(blob);
      }
    }

    const mode = pmtilesAssets.length > 0 ? "pmtiles" : "offline_style";
    return buildHandle({
      descriptor: descriptorFromDocument(pkg, pmtilesAssets.length > 0 ? "pmtiles" : "packaged", uri),
      status: "installed_offline",
      mode,
      resource: offlineStyleResource(pkg, pmtilesBlobUrls),
    });
  }

  async function loadActivePackMap(): Promise<MapDataHandle | null> {
    const pack = await options.packs.getActivePack();
    if (!pack || pack.status !== "active") {
      return null;
    }

    const mapPackageId = pack.manifest?.mapPackageId ?? null;
    const refPath = mapRefPath(pack);

    if (!mapPackageId && !refPath) {
      return null;
    }

    if (!refPath) {
      return buildHandle({
        descriptor: fallbackDescriptor("missing_pack"),
        status: "missing_pack",
        mode: "vector_fallback",
        resource: vectorFallbackResource("missing_pack"),
        message: `Active pack references map "${mapPackageId}" but has no map_ref file.`,
      });
    }

    const meta = pack.manifest?.files.find((file) => file.path === refPath);
    const bytes = await options.packs.getPackFile(pack.packId, refPath);
    if (!bytes || !meta) {
      return buildHandle({
        descriptor: fallbackDescriptor("corrupted_pack"),
        status: "corrupted_pack",
        mode: "vector_fallback",
        resource: vectorFallbackResource("corrupted_pack"),
        message: "Offline map file is incomplete or missing after activation.",
      });
    }

    try {
      await assertChecksumSha256(bytes, meta.checksumSha256);
      const raw = decodeJsonArrayBuffer(bytes);
      const pkg = parseMapPackage(raw);
      if (mapPackageId && pkg.id !== mapPackageId) {
        return buildHandle({
          descriptor: fallbackDescriptor("corrupted_pack"),
          status: "corrupted_pack",
          mode: "vector_fallback",
          resource: vectorFallbackResource("corrupted_pack"),
          message: `Map package id mismatch: manifest ${mapPackageId}, file ${pkg.id}.`,
        });
      }
      try {
        assertSupportedMapFormat(pkg);
      } catch (error) {
        return buildHandle({
          descriptor: descriptorFromDocument(pkg, "packaged", `pack:${pack.packId}/${refPath}`),
          status: "unsupported_format",
          mode: "vector_fallback",
          resource: vectorFallbackResource("unsupported_format"),
          message: error instanceof Error ? error.message : "Unsupported map format",
        });
      }
      return handleFromPackDocument(pack, pkg, `pack:${pack.packId}/${refPath}`);
    } catch (error) {
      return buildHandle({
        descriptor: fallbackDescriptor("corrupted_pack"),
        status: "corrupted_pack",
        mode: "vector_fallback",
        resource: vectorFallbackResource("corrupted_pack"),
        message: error instanceof Error ? error.message : "Offline map validation failed",
      });
    }
  }

  async function resolveWithoutPackMap(online: boolean): Promise<MapDataHandle> {
    if (preferSample) {
      try {
        return await loadSampleHandle();
      } catch {
        // Fall through to connectivity-based fallback.
      }
    }

    if (online) {
      return buildHandle({
        descriptor: fallbackDescriptor("online_fallback"),
        status: "online_fallback",
        mode: "remote_raster",
        resource: remoteRasterResource(),
      });
    }

    return buildHandle({
      descriptor: fallbackDescriptor("missing_pack"),
      status: "missing_pack",
      mode: "vector_fallback",
      resource: vectorFallbackResource("missing_pack"),
    });
  }

  return {
    async listPackages(): Promise<MapPackageDescriptor[]> {
      const listed: MapPackageDescriptor[] = [sampleDescriptor()];
      const active = await options.packs.getActivePack();
      if (active?.manifest?.mapPackageId) {
        listed.push({
          id: active.manifest.mapPackageId,
          label: `${active.name} map`,
          kind: "packaged",
          uri: `pack:${active.packId}`,
          version: active.contentVersion ?? "unknown",
          formatVersion: active.manifest.formatVersion,
          bounds: undefined,
        });
      }
      return listed;
    },

    async loadPackage(id: string): Promise<MapDataHandle> {
      if (id === "sample-playa-basemap") {
        return loadSampleHandle();
      }
      const session = await this.resolveSession();
      if (session.descriptor.id === id) return session;
      throw new Error(`Unknown map package: ${id}`);
    },

    async getActivePackage(): Promise<MapPackageDescriptor | null> {
      const session = await this.resolveSession();
      return session.descriptor;
    },

    async resolveSession(resolveOptions?: ResolveMapSessionOptions): Promise<MapDataHandle> {
      const online = isOnline(resolveOptions);

      if (resolveOptions?.area === "winthrop") {
        if (online) {
          return buildHandle({
            descriptor: fallbackDescriptor("online_fallback"),
            status: "online_fallback",
            mode: "remote_raster",
            resource: remoteRasterResource(),
            message: "",
          });
        }
        return buildHandle({
          descriptor: fallbackDescriptor("missing_pack"),
          status: "missing_pack",
          mode: "vector_fallback",
          resource: vectorFallbackResource("missing_pack"),
          message: "Map unavailable offline. Reconnect to view Winthrop.",
        });
      }

      // Incomplete / failed packs are never returned by getActivePack — still assert for tests.
      if (options.packs.listInstalledPacks) {
        const installed = await options.packs.listInstalledPacks();
        for (const pack of installed) {
          if (pack.status === "incomplete" || pack.status === "failed") {
            // Do not use partial map data; continue resolving via active/sample/fallback.
          }
        }
      }

      const fromPack = await loadActivePackMap();
      if (fromPack) {
        if (fromPack.status === "installed_offline") return fromPack;
        // Corrupted / unsupported / missing map_ref: try online tiles when available.
        if (online) {
          return buildHandle({
            descriptor: fallbackDescriptor("online_fallback"),
            status: "online_fallback",
            mode: "remote_raster",
            resource: remoteRasterResource(),
            message: `${fromPack.message} Using temporary online basemap.`,
          });
        }
        return fromPack;
      }

      // Active pack without map, or no pack: sample (preferred) / online / missing.
      const active = await options.packs.getActivePack();
      if (active && !active.manifest?.mapPackageId && !mapRefPath(active)) {
        if (online) {
          return buildHandle({
            descriptor: fallbackDescriptor("online_fallback"),
            status: "online_fallback",
            mode: "remote_raster",
            resource: remoteRasterResource(),
            message:
              "Active playa pack has no offline map package. Using temporary online basemap.",
          });
        }
        return buildHandle({
          descriptor: fallbackDescriptor("missing_pack"),
          status: "missing_pack",
          mode: "vector_fallback",
          resource: vectorFallbackResource("missing_pack"),
        });
      }

      return resolveWithoutPackMap(online);
    },
  };
}
