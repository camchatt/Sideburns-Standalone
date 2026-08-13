import { describe, expect, it } from "vitest";
import { createPackagedMapProvider } from "@/features/map/providers/packagedMapProvider";
import { createMemoryMapPackageStore } from "@/features/map/repositories/mapPackageAssetStore";
import { parseMapPackage, validateMapPackageForUse } from "@/features/map/schemas/mapPackageSchema";
import type { MapPackageDocument } from "@/features/map/schemas/mapPackageSchema";
import type { LocalPlayaPackRecord, PlayaPackManifest } from "@/features/playa-pack/types/playaPack";
import { sha256Hex } from "@/features/playa-pack/utils/checksum";
import { PLAYA_PACK_FORMAT_VERSION, SIDEBURNS_MAP_FORMAT_VERSION } from "@/lib/pwa/versioning";

async function encodeJson(value: unknown): Promise<{ buffer: ArrayBuffer; checksum: string; byteSize: number }> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const buffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
  return { buffer, checksum: await sha256Hex(buffer), byteSize: encoded.byteLength };
}

function baseMapPackage(overrides?: Record<string, unknown>): MapPackageDocument {
  const raw = {
    id: "bm-2026-demo-map",
    label: "Demo offline map",
    formatVersion: SIDEBURNS_MAP_FORMAT_VERSION,
    contentVersion: "2026.1.0",
    engine: "maplibre",
    assets: [],
    style: {
      version: 8,
      sources: {},
      layers: [{ id: "background", type: "background", paint: { "background-color": "#2a241c" } }],
    },
    ...overrides,
  };
  if (typeof overrides?.formatVersion === "string" && overrides.formatVersion !== SIDEBURNS_MAP_FORMAT_VERSION) {
    return parseMapPackage(raw);
  }
  return validateMapPackageForUse(raw);
}

async function buildActivePack(options?: {
  mapPackage?: ReturnType<typeof baseMapPackage> | null;
  corruptChecksum?: boolean;
  unsupportedFormat?: boolean;
  status?: LocalPlayaPackRecord["status"];
  omitMapRef?: boolean;
}) {
  const mapPackage =
    options?.mapPackage === null
      ? null
      : baseMapPackage(
          options?.unsupportedFormat ? { formatVersion: "sideburn-map-9.9.9" } : undefined,
        );

  const files: PlayaPackManifest["files"] = [];
  const fileBytes = new Map<string, ArrayBuffer>();

  if (mapPackage && !options?.omitMapRef) {
    const encoded = await encodeJson(mapPackage);
    files.push({
      path: "map-package.json",
      role: "map_ref",
      byteSize: encoded.byteSize,
      checksumSha256: options?.corruptChecksum ? "0".repeat(64) : encoded.checksum,
    });
    fileBytes.set("map-package.json", encoded.buffer);
  }

  const manifest: PlayaPackManifest = {
    packId: "pack_map_test",
    name: "Map Test Pack",
    eventYear: 2026,
    formatVersion: PLAYA_PACK_FORMAT_VERSION,
    contentVersion: "2026.1.0",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    files:
      files.length > 0
        ? files
        : [
            {
              path: "sidequests.json",
              role: "sidequests",
              byteSize: 2,
              checksumSha256: "a".repeat(64),
            },
          ],
    totalByteSize: files.length > 0 ? files.reduce((sum, file) => sum + file.byteSize, 0) : 2,
    mapPackageId: mapPackage?.id ?? null,
  };

  const record: LocalPlayaPackRecord = {
    packId: manifest.packId,
    name: manifest.name,
    eventYear: manifest.eventYear,
    formatVersion: manifest.formatVersion,
    contentVersion: manifest.contentVersion,
    status: options?.status ?? "active",
    manifest,
    bytesReceived: manifest.totalByteSize,
    bytesTotal: manifest.totalByteSize,
    lastError: null,
    downloadedAt: "2026-06-01T00:00:00.000Z",
    activatedAt: "2026-06-01T00:00:00.000Z",
    lastUpdatedAt: "2026-06-01T00:00:00.000Z",
    storagePersisted: true,
  };

  return { record, fileBytes, mapPackage };
}

describe("packagedMapProvider", () => {
  it("uses Winthrop online tiles even when a playa pack is active", async () => {
    const { record, fileBytes } = await buildActivePack();
    const provider = createPackagedMapProvider({
      assetStore: createMemoryMapPackageStore(),
      packs: {
        getActivePack: async () => record,
        getPackFile: async (_packId, path) => fileBytes.get(path) ?? null,
      },
    });

    const session = await provider.resolveSession({ area: "winthrop", online: true });
    expect(session.status).toBe("online_fallback");
    expect(session.mode).toBe("remote_raster");
    expect(session.resource.type).toBe("remote-raster");
  });

  it("gives Winthrop a friendly unavailable state while offline", async () => {
    const { record } = await buildActivePack();
    const provider = createPackagedMapProvider({
      assetStore: createMemoryMapPackageStore(),
      packs: { getActivePack: async () => record, getPackFile: async () => null },
    });

    const session = await provider.resolveSession({ area: "winthrop", online: false });
    expect(session.status).toBe("missing_pack");
    expect(session.mode).toBe("vector_fallback");
    expect(session.message).toBe("Map unavailable offline. Reconnect to view Winthrop.");
  });

  it("loads an installed offline map from an active pack without network", async () => {
    const { record, fileBytes } = await buildActivePack();
    const provider = createPackagedMapProvider({
      preferSampleWhenNoPack: true,
      assetStore: createMemoryMapPackageStore(),
      loadSamplePackage: async () => baseMapPackage({ id: "sample-playa-basemap" }),
      packs: {
        getActivePack: async () => record,
        listInstalledPacks: async () => [record],
        getPackFile: async (_packId, path) => fileBytes.get(path) ?? null,
      },
    });

    const session = await provider.resolveSession({ online: false });
    expect(session.status).toBe("installed_offline");
    expect(session.mode).toBe("offline_style");
    expect(session.resource.type).toBe("maplibre-style");
    expect(session.descriptor.id).toBe("bm-2026-demo-map");
  });

  it("does not treat incomplete packs as an installed offline map", async () => {
    const { record, fileBytes } = await buildActivePack({ status: "incomplete" });
    const incomplete = { ...record, status: "incomplete" as const, activatedAt: null };
    const provider = createPackagedMapProvider({
      preferSampleWhenNoPack: true,
      assetStore: createMemoryMapPackageStore(),
      loadSamplePackage: async () => baseMapPackage({ id: "sample-playa-basemap" }),
      packs: {
        // Mirrors PlayaPackService.getActivePack — incomplete never returned as active.
        getActivePack: async () => null,
        listInstalledPacks: async () => [incomplete],
        getPackFile: async (_packId, path) => fileBytes.get(path) ?? null,
      },
    });

    const session = await provider.resolveSession({ online: false });
    expect(session.status).not.toBe("installed_offline");
    expect(session.status).toBe("sample");
  });

  it("reports missing_pack offline when no pack map and sample preference is off", async () => {
    const provider = createPackagedMapProvider({
      preferSampleWhenNoPack: false,
      assetStore: createMemoryMapPackageStore(),
      packs: {
        getActivePack: async () => null,
        getPackFile: async () => null,
      },
    });

    const session = await provider.resolveSession({ online: false });
    expect(session.status).toBe("missing_pack");
    expect(session.mode).toBe("vector_fallback");
  });

  it("uses temporary online fallback when online and no pack map is installed", async () => {
    const provider = createPackagedMapProvider({
      preferSampleWhenNoPack: false,
      assetStore: createMemoryMapPackageStore(),
      packs: {
        getActivePack: async () => null,
        getPackFile: async () => null,
      },
    });

    const session = await provider.resolveSession({ online: true });
    expect(session.status).toBe("online_fallback");
    expect(session.mode).toBe("remote_raster");
    expect(session.resource.type).toBe("remote-raster");
  });

  it("surfaces corrupted_pack when map_ref checksum fails (offline)", async () => {
    const { record, fileBytes } = await buildActivePack({ corruptChecksum: true });
    const provider = createPackagedMapProvider({
      preferSampleWhenNoPack: false,
      assetStore: createMemoryMapPackageStore(),
      packs: {
        getActivePack: async () => record,
        getPackFile: async (_packId, path) => fileBytes.get(path) ?? null,
      },
    });

    const session = await provider.resolveSession({ online: false });
    expect(session.status).toBe("corrupted_pack");
    expect(session.mode).toBe("vector_fallback");
  });

  it("surfaces unsupported_format for unknown map format versions (offline)", async () => {
    const { record, fileBytes } = await buildActivePack({ unsupportedFormat: true });
    const provider = createPackagedMapProvider({
      preferSampleWhenNoPack: false,
      assetStore: createMemoryMapPackageStore(),
      packs: {
        getActivePack: async () => record,
        getPackFile: async (_packId, path) => fileBytes.get(path) ?? null,
      },
    });

    const session = await provider.resolveSession({ online: false });
    expect(session.status).toBe("unsupported_format");
    expect(session.mode).toBe("vector_fallback");
  });

  it("falls back online when the pack map is corrupted but the device is online", async () => {
    const { record, fileBytes } = await buildActivePack({ corruptChecksum: true });
    const provider = createPackagedMapProvider({
      preferSampleWhenNoPack: false,
      assetStore: createMemoryMapPackageStore(),
      packs: {
        getActivePack: async () => record,
        getPackFile: async (_packId, path) => fileBytes.get(path) ?? null,
      },
    });

    const session = await provider.resolveSession({ online: true });
    expect(session.status).toBe("online_fallback");
    expect(session.mode).toBe("remote_raster");
  });
});
