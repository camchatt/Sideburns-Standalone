import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDB, deleteDB } from "idb";
import {
  closePlayaDatabaseForTests,
  getPlayaDatabase,
  PLAYA_DATABASE_NAME,
  PLAYA_DATABASE_VERSION,
} from "@/lib/storage/playaDatabase";
import { createIndexedDbPlayaPackRepository } from "@/features/playa-pack/repositories/indexedDbPlayaPackRepository";
import { createPlayaPackService } from "@/features/playa-pack/services/playaPackService";
import type {
  PlayaPackCatalogEntry,
  PlayaPackCatalogProvider,
  PlayaPackManifest,
} from "@/features/playa-pack/types/playaPack";
import { sha256Hex } from "@/features/playa-pack/utils/checksum";
import { PLAYA_PACK_FORMAT_VERSION } from "@/lib/pwa/versioning";
import { createIndexedDbSidequestRepository } from "@/features/sidequests/repositories/indexedDbSidequestRepository";
import type { Sidequest } from "@/features/sidequests/types/sidequest";

async function encodeJson(value: unknown): Promise<{ buffer: ArrayBuffer; checksum: string; byteSize: number }> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const buffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
  return {
    buffer,
    checksum: await sha256Hex(buffer),
    byteSize: encoded.byteLength,
  };
}

async function buildFixture(options?: { corruptSidequestsChecksum?: boolean }) {
  const sidequestsPayload = {
    packId: "pack_test_a",
    contentVersion: "2026.1.0",
    sidequests: [
      {
        id: "sq_pack_a_1",
        title: "Pack A One",
        description: "Official pack quest",
        location: { latitude: 40.78, longitude: -119.2 },
        radiusMeters: 30,
        category: "art",
        availability: "always",
        difficulty: "easy",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        syncStatus: "synced",
        packId: "pack_test_a",
        origin: "pack",
        completionRule: "open",
        contentOrigin: "infrastructure",
      },
    ] satisfies Sidequest[],
  };
  const eventPayload = {
    packId: "pack_test_a",
    contentVersion: "2026.1.0",
    eventName: "Test Event",
    eventYear: 2026,
  };

  const sidequests = await encodeJson(sidequestsPayload);
  const event = await encodeJson(eventPayload);

  const manifest: PlayaPackManifest = {
    packId: "pack_test_a",
    name: "Test Pack A",
    eventYear: 2026,
    formatVersion: PLAYA_PACK_FORMAT_VERSION,
    contentVersion: "2026.1.0",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    files: [
      {
        path: "sidequests.json",
        role: "sidequests",
        byteSize: sidequests.byteSize,
        checksumSha256: options?.corruptSidequestsChecksum
          ? "0".repeat(64)
          : sidequests.checksum,
      },
      {
        path: "event.json",
        role: "event",
        byteSize: event.byteSize,
        checksumSha256: event.checksum,
      },
    ],
    totalByteSize: sidequests.byteSize + event.byteSize,
    mapPackageId: null,
  };

  const catalogEntry: PlayaPackCatalogEntry = {
    packId: manifest.packId,
    name: manifest.name,
    eventYear: manifest.eventYear,
    contentVersion: manifest.contentVersion,
    formatVersion: manifest.formatVersion,
    estimatedByteSize: manifest.totalByteSize,
    manifestUrl: "/packs/test-a/manifest.json",
  };

  const files = new Map<string, ArrayBuffer>([
    ["sidequests.json", sidequests.buffer],
    ["event.json", event.buffer],
  ]);

  return { manifest, catalogEntry, files, sidequestsPayload };
}

function createMockCatalog(
  entry: PlayaPackCatalogEntry,
  manifest: PlayaPackManifest,
  files: Map<string, ArrayBuffer>,
  options?: { failAfterFirstFile?: boolean },
): PlayaPackCatalogProvider {
  let downloads = 0;
  return {
    async listAvailable() {
      return [entry];
    },
    async fetchManifest() {
      return structuredClone(manifest);
    },
    async fetchFile(_base, relativePath) {
      downloads += 1;
      if (options?.failAfterFirstFile && downloads > 1) {
        throw new Error("Simulated network failure");
      }
      const data = files.get(relativePath);
      if (!data) throw new Error(`Missing fixture file ${relativePath}`);
      return data.slice(0);
    },
  };
}

describe("playa pack IndexedDB migration and lifecycle", () => {
  beforeEach(async () => {
    await closePlayaDatabaseForTests();
    await deleteDB(PLAYA_DATABASE_NAME);
    vi.unstubAllGlobals();
  });

  it("does not offer a tileless demo pack as an offline map", async () => {
    const fixture = await buildFixture();
    const mapPackage = await encodeJson({
      id: "demo-map",
      label: "Demo map",
      formatVersion: "sideburn-map-0.1.0",
      contentVersion: "2026.1.0",
      engine: "maplibre",
      assets: [],
      style: { version: 8, sources: {}, layers: [] },
    });
    fixture.manifest.mapPackageId = "demo-map";
    fixture.manifest.files.push({ path: "map-package.json", role: "map_ref", byteSize: mapPackage.byteSize, checksumSha256: mapPackage.checksum });
    fixture.manifest.totalByteSize += mapPackage.byteSize;
    fixture.files.set("map-package.json", mapPackage.buffer);
    const service = createPlayaPackService({
      repository: createIndexedDbPlayaPackRepository(),
      catalog: createMockCatalog(fixture.catalogEntry, fixture.manifest, fixture.files),
    });

    await expect(service.listOfflineMapOffers()).resolves.toEqual([]);
  });

  it("migrates from version 3 to 4 without dropping user sidequests", async () => {
    const legacy = await openDB(PLAYA_DATABASE_NAME, 3, {
      upgrade(database) {
        database.createObjectStore("mapRecordCache");
        database.createObjectStore("interactions", { keyPath: "recordId" });
        database.createObjectStore("sidequests", { keyPath: "id" });
        const completions = database.createObjectStore("questCompletions", { keyPath: "id" });
        completions.createIndex("sidequestId", "sidequestId", { unique: true });
      },
    });
    await legacy.put("sidequests", {
      id: "sq_local_keep_me",
      title: "Local keep",
      description: "user created",
      location: { latitude: 40.78, longitude: -119.2 },
      radiusMeters: 20,
      category: "other",
      availability: "always",
      difficulty: "easy",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      syncStatus: "pending",
      packId: null,
    });
    legacy.close();

    const db = await getPlayaDatabase();
    expect(db.version).toBe(PLAYA_DATABASE_VERSION);
    expect(PLAYA_DATABASE_VERSION).toBe(7);
    expect(db.objectStoreNames.contains("playaPackMeta")).toBe(true);
    expect(db.objectStoreNames.contains("playaPackFiles")).toBe(true);
    expect(db.objectStoreNames.contains("playaPackActive")).toBe(true);
    expect(db.objectStoreNames.contains("packSidequests")).toBe(true);
    expect(await db.get("sidequests", "sq_local_keep_me")).toMatchObject({
      id: "sq_local_keep_me",
      title: "Local keep",
    });
  });

  it("downloads, validates, and activates a pack atomically", async () => {
    const fixture = await buildFixture();
    const service = createPlayaPackService({
      repository: createIndexedDbPlayaPackRepository(),
      catalog: createMockCatalog(fixture.catalogEntry, fixture.manifest, fixture.files),
    });

    const active = await service.downloadAndActivate("pack_test_a");
    expect(active.status).toBe("active");
    expect(active.contentVersion).toBe("2026.1.0");

    const pointerPack = await service.getActivePack();
    expect(pointerPack?.packId).toBe("pack_test_a");
    const quests = await service.getActiveSidequests();
    expect(quests.map((quest) => quest.id)).toEqual(["sq_pack_a_1"]);
  });

  it("keeps a partial download incomplete and never active", async () => {
    const fixture = await buildFixture();
    const service = createPlayaPackService({
      repository: createIndexedDbPlayaPackRepository(),
      catalog: createMockCatalog(fixture.catalogEntry, fixture.manifest, fixture.files, {
        failAfterFirstFile: true,
      }),
    });

    await expect(service.downloadAndActivate("pack_test_a")).rejects.toThrow(/Simulated network failure/);

    const repository = createIndexedDbPlayaPackRepository();
    const record = await repository.getPack("pack_test_a");
    expect(record?.status).toBe("failed");
    expect(await repository.getActivePointer()).toBeNull();
    expect(await repository.listPackSidequests()).toEqual([]);

    const staging = (await repository.listFiles("pack_test_a")).filter((file) =>
      file.path.includes("__staging__"),
    );
    expect(staging.length).toBeGreaterThan(0);
  });

  it("rejects checksum-invalid packs without activation", async () => {
    const fixture = await buildFixture({ corruptSidequestsChecksum: true });
    const service = createPlayaPackService({
      repository: createIndexedDbPlayaPackRepository(),
      catalog: createMockCatalog(fixture.catalogEntry, fixture.manifest, fixture.files),
    });

    await expect(service.downloadAndActivate("pack_test_a")).rejects.toThrow(/Checksum mismatch/);
    const repository = createIndexedDbPlayaPackRepository();
    expect(await repository.getActivePointer()).toBeNull();
    expect((await repository.getPack("pack_test_a"))?.status).toBe("failed");
  });

  it("preserves the previously active pack while a replacement download fails", async () => {
    const first = await buildFixture();
    const repo = createIndexedDbPlayaPackRepository();
    const service = createPlayaPackService({
      repository: repo,
      catalog: createMockCatalog(first.catalogEntry, first.manifest, first.files),
    });
    await service.downloadAndActivate("pack_test_a");
    expect((await service.getActivePack())?.packId).toBe("pack_test_a");

    const secondSidequests = await encodeJson({
      packId: "pack_test_b",
      contentVersion: "2026.2.0",
      sidequests: [
        {
          id: "sq_pack_b_1",
          title: "Pack B",
          description: "replacement",
          location: { latitude: 40.79, longitude: -119.21 },
          radiusMeters: 25,
          category: "explore",
          availability: "daytime",
          difficulty: "moderate",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
          syncStatus: "synced",
          packId: "pack_test_b",
        },
      ],
    });
    const secondEvent = await encodeJson({
      packId: "pack_test_b",
      contentVersion: "2026.2.0",
      eventName: "Test Event B",
      eventYear: 2026,
    });
    const secondManifest: PlayaPackManifest = {
      packId: "pack_test_b",
      name: "Test Pack B",
      eventYear: 2026,
      formatVersion: PLAYA_PACK_FORMAT_VERSION,
      contentVersion: "2026.2.0",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      files: [
        {
          path: "sidequests.json",
          role: "sidequests",
          byteSize: secondSidequests.byteSize,
          checksumSha256: secondSidequests.checksum,
        },
        {
          path: "event.json",
          role: "event",
          byteSize: secondEvent.byteSize,
          checksumSha256: secondEvent.checksum,
        },
      ],
      totalByteSize: secondSidequests.byteSize + secondEvent.byteSize,
      mapPackageId: null,
    };
    const secondEntry: PlayaPackCatalogEntry = {
      packId: "pack_test_b",
      name: "Test Pack B",
      eventYear: 2026,
      contentVersion: "2026.2.0",
      formatVersion: PLAYA_PACK_FORMAT_VERSION,
      estimatedByteSize: secondManifest.totalByteSize,
      manifestUrl: "/packs/test-b/manifest.json",
    };

    const failingCatalog: PlayaPackCatalogProvider = {
      async listAvailable() {
        return [first.catalogEntry, secondEntry];
      },
      async fetchManifest(url) {
        if (url.includes("test-b")) return secondManifest;
        return first.manifest;
      },
      async fetchFile(url) {
        if (url.includes("test-b")) throw new Error("Replacement download failed");
        const path = url.includes("event") ? "event.json" : "sidequests.json";
        return first.files.get(path)!.slice(0);
      },
    };

    const replacing = createPlayaPackService({ repository: repo, catalog: failingCatalog });
    await expect(replacing.downloadAndActivate("pack_test_b")).rejects.toThrow(
      /Replacement download failed/,
    );

    expect((await replacing.getActivePack())?.packId).toBe("pack_test_a");
    expect((await replacing.getActiveSidequests()).map((quest) => quest.id)).toEqual(["sq_pack_a_1"]);
  });

  it("does not remove locally created sidequests when a pack is removed", async () => {
    const fixture = await buildFixture();
    const packRepo = createIndexedDbPlayaPackRepository();
    const service = createPlayaPackService({
      repository: packRepo,
      catalog: createMockCatalog(fixture.catalogEntry, fixture.manifest, fixture.files),
    });
    await service.downloadAndActivate("pack_test_a");

    const sidequests = createIndexedDbSidequestRepository();
    await sidequests.put({
      id: "sq_local_user_1",
      title: "My dust note",
      description: "local only",
      location: { latitude: 40.78, longitude: -119.2 },
      radiusMeters: 15,
      category: "other",
      availability: "always",
      difficulty: "easy",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      syncStatus: "pending",
      packId: null,
      origin: "local",
      completionRule: "open",
      contentOrigin: "user",
    });

    await service.remove("pack_test_a");
    expect(await packRepo.getActivePointer()).toBeNull();
    expect(await packRepo.listPackSidequests()).toEqual([]);
    expect(await sidequests.get("sq_local_user_1")).toMatchObject({ title: "My dust note" });
  });

  it("treats persistent storage denial as non-fatal and still activates", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      storage: {
        persist: vi.fn(async () => false),
        persisted: vi.fn(async () => false),
        estimate: vi.fn(async () => ({ usage: 1000, quota: 5_000_000 })),
      },
    });

    const fixture = await buildFixture();
    const service = createPlayaPackService({
      repository: createIndexedDbPlayaPackRepository(),
      catalog: createMockCatalog(fixture.catalogEntry, fixture.manifest, fixture.files),
    });

    const active = await service.downloadAndActivate("pack_test_a");
    expect(active.status).toBe("active");
    expect(active.storagePersisted).toBe(false);
    expect(navigator.storage.persist).toHaveBeenCalled();

    const readiness = await service.getReadiness();
    expect(readiness.storagePersisted).toBe(false);
    expect(readiness.notes.some((note) => /Persistent storage is not granted/i.test(note))).toBe(true);
    // Readiness must not re-prompt.
    expect(navigator.storage.persist).toHaveBeenCalledTimes(1);
  });

  it("resumes an incomplete staging download on retry", async () => {
    const fixture = await buildFixture();
    let failOnce = true;
    const catalog: PlayaPackCatalogProvider = {
      async listAvailable() {
        return [fixture.catalogEntry];
      },
      async fetchManifest() {
        return structuredClone(fixture.manifest);
      },
      async fetchFile(_base, relativePath) {
        if (failOnce && relativePath === "event.json") {
          failOnce = false;
          throw new Error("Interrupted");
        }
        return fixture.files.get(relativePath)!.slice(0);
      },
    };

    const service = createPlayaPackService({
      repository: createIndexedDbPlayaPackRepository(),
      catalog,
    });

    await expect(service.downloadAndActivate("pack_test_a")).rejects.toThrow(/Interrupted/);
    const recovered = await service.retry("pack_test_a");
    expect(recovered.status).toBe("active");
    expect(failOnce).toBe(false);
  });
});
