import { SIDEBURNS_MAP_FORMAT_VERSION } from "@/lib/pwa/versioning";
import { createPackagedMapProvider } from "@/features/map/providers/packagedMapProvider";
import { createCacheStorageMapPackageStore } from "@/features/map/repositories/mapPackageAssetStore";
import {
  validateMapPackageForUse,
  type MapPackageDocument,
} from "@/features/map/schemas/mapPackageSchema";
import type { MapDataHandle, MapProvider } from "@/features/map/types/map";
import {
  buildHandle,
  descriptorFromDocument,
  offlineStyleResource,
  remoteRasterResource,
  sampleDescriptor,
  vectorFallbackResource,
} from "@/features/map/services/mapSessionHelpers";
import type { PlayaPackService } from "@/features/playa-pack/services/playaPackService";
import type { PlayaPackRepository } from "@/features/playa-pack/repositories/indexedDbPlayaPackRepository";

const EMBEDDED_SAMPLE_STYLE: MapPackageDocument = {
  id: "sample-playa-basemap",
  label: "Sample playa basemap",
  formatVersion: SIDEBURNS_MAP_FORMAT_VERSION,
  contentVersion: "0.0.1",
  engine: "maplibre",
  bounds: { north: 40.807, south: 40.75, east: -119.17, west: -119.27 },
  center: [-119.205, 40.78],
  zoom: 13,
  minZoom: 11,
  maxZoom: 18,
  assets: [],
  style: {
    version: 8,
    name: "SIDEBURNS sample offline",
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#2a241c" },
      },
    ],
  },
};

/**
 * Lightweight sample MapProvider — always resolves the bundled offline style.
 * Used when `VITE_MAP_SOURCE=sample` or as a safe default without pack wiring.
 */
export function createSampleMapProvider(): MapProvider {
  const pkg = validateMapPackageForUse(EMBEDDED_SAMPLE_STYLE);

  const sampleHandle = (): MapDataHandle =>
    buildHandle({
      descriptor: descriptorFromDocument(pkg, "sample", "/maps/sample-basemap.json"),
      status: "sample",
      mode: "offline_style",
      resource: offlineStyleResource(pkg),
    });

  return {
    async listPackages() {
      return [sampleDescriptor()];
    },
    async loadPackage(id: string) {
      if (id !== pkg.id) throw new Error(`Unknown map package: ${id}`);
      return sampleHandle();
    },
    async getActivePackage() {
      return sampleDescriptor();
    },
    async resolveSession(options) {
      if (options?.area === "winthrop") {
        return options.online === false
          ? buildHandle({
              descriptor: sampleDescriptor(),
              status: "missing_pack",
              mode: "vector_fallback",
              resource: vectorFallbackResource("missing_pack"),
              message: "Map unavailable offline. Reconnect to view Winthrop.",
            })
          : buildHandle({
              descriptor: { ...sampleDescriptor(), kind: "remote", uri: "remote:esri-imagery" },
              status: "online_fallback",
              mode: "remote_raster",
              resource: remoteRasterResource(),
              message: "",
            });
      }
      return sampleHandle();
    },
  };
}

/**
 * Production wiring: pack-backed MapLibre/PMTiles with sample + online fallbacks.
 */
export function createAppMapProvider(input: {
  playaPacks: Pick<PlayaPackService, "getActivePack">;
  packRepository: Pick<PlayaPackRepository, "getFile" | "listPacks">;
  preferSampleWhenNoPack?: boolean;
}): MapProvider {
  return createPackagedMapProvider({
    preferSampleWhenNoPack: input.preferSampleWhenNoPack ?? true,
    assetStore: createCacheStorageMapPackageStore(),
    loadSamplePackage: async () => EMBEDDED_SAMPLE_STYLE,
    packs: {
      getActivePack: () => input.playaPacks.getActivePack(),
      listInstalledPacks: () => input.packRepository.listPacks(),
      async getPackFile(packId, path) {
        const file = await input.packRepository.getFile(packId, path);
        if (!file?.complete || !file.data) return null;
        return file.data;
      },
    },
  });
}
