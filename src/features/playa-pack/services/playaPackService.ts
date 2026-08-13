import type { PlayaPackRepository } from "@/features/playa-pack/repositories/indexedDbPlayaPackRepository";
import {
  decodeJsonArrayBuffer,
  parseSidequestsFromPackFile,
} from "@/features/playa-pack/schemas/playaPackManifestSchema";
import type {
  LocalPlayaPackFileRecord,
  LocalPlayaPackRecord,
  PlayaPack,
  PlayaPackCatalogEntry,
  PlayaPackCatalogProvider,
  PlayaPackDownloadProgress,
  PlayaPackManifest,
  OfflineMapOffer,
  PlayaPackReadinessView,
} from "@/features/playa-pack/types/playaPack";
import { parseMapPackage } from "@/features/map/schemas/mapPackageSchema";
import { packFileKey, stagingPackPath } from "@/features/playa-pack/types/playaPack";
import { assertChecksumSha256 } from "@/features/playa-pack/utils/checksum";
import {
  estimateStorage,
  queryPersistentStorage,
  requestPersistentStorage,
} from "@/features/playa-pack/utils/persistentStorage";
import type { Sidequest } from "@/features/sidequests/types/sidequest";

export type PlayaPackService = {
  getReadiness(): Promise<PlayaPackReadinessView>;
  listCatalog(): Promise<PlayaPackCatalogEntry[]>;
  listOfflineMapOffers(): Promise<OfflineMapOffer[]>;
  getActivePack(): Promise<LocalPlayaPackRecord | null>;
  getActiveSidequests(): Promise<Sidequest[]>;
  getActiveEventData(): Promise<unknown | null>;
  toPlayaPackSummary(record: LocalPlayaPackRecord, sidequestIds: string[]): PlayaPack;
  downloadAndActivate(
    packId: string,
    options?: {
      onProgress?: (progress: PlayaPackDownloadProgress) => void;
      /** Test seam: skip auto-activate after validation. */
      activate?: boolean;
    },
  ): Promise<LocalPlayaPackRecord>;
  retry(packId: string, onProgress?: (progress: PlayaPackDownloadProgress) => void): Promise<LocalPlayaPackRecord>;
  remove(packId: string): Promise<void>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function emptyRecord(entry: PlayaPackCatalogEntry, persisted: boolean | null): LocalPlayaPackRecord {
  return {
    packId: entry.packId,
    name: entry.name,
    eventYear: entry.eventYear,
    formatVersion: entry.formatVersion,
    contentVersion: null,
    status: "incomplete",
    manifest: null,
    bytesReceived: 0,
    bytesTotal: entry.estimatedByteSize,
    lastError: null,
    downloadedAt: null,
    activatedAt: null,
    lastUpdatedAt: nowIso(),
    storagePersisted: persisted,
  };
}

function progressFrom(
  record: LocalPlayaPackRecord,
  currentFile: string | null,
): PlayaPackDownloadProgress {
  const total = Math.max(record.bytesTotal, 1);
  return {
    packId: record.packId,
    bytesReceived: record.bytesReceived,
    bytesTotal: record.bytesTotal,
    fraction: Math.min(1, record.bytesReceived / total),
    currentFile,
    status: record.status,
  };
}

export function createPlayaPackService(input: {
  repository: PlayaPackRepository;
  catalog: PlayaPackCatalogProvider;
}): PlayaPackService {
  const { repository, catalog } = input;

  async function loadValidatedSidequests(
    packId: string,
    manifest: PlayaPackManifest,
    pathResolver: (path: string) => string = (path) => path,
  ): Promise<Sidequest[]> {
    const sidequestsFile = manifest.files.find((file) => file.role === "sidequests");
    if (!sidequestsFile) {
      throw new Error("Pack manifest is missing a sidequests file");
    }
    const stored = await repository.getFile(packId, pathResolver(sidequestsFile.path));
    if (!stored?.complete || !stored.data) {
      throw new Error("Sidequests file is incomplete; pack cannot activate");
    }
    await assertChecksumSha256(stored.data, sidequestsFile.checksumSha256);
    return parseSidequestsFromPackFile(stored.data);
  }

  async function validateFilesAt(
    packId: string,
    manifest: PlayaPackManifest,
    pathResolver: (path: string) => string,
  ): Promise<void> {
    for (const file of manifest.files) {
      const stored = await repository.getFile(packId, pathResolver(file.path));
      if (!stored?.complete || !stored.data) {
        throw new Error(`Pack file incomplete: ${file.path}`);
      }
      if (stored.receivedBytes !== file.byteSize || stored.data.byteLength !== file.byteSize) {
        throw new Error(`Pack file size mismatch: ${file.path}`);
      }
      await assertChecksumSha256(stored.data, file.checksumSha256);
    }
  }

  async function downloadPackFiles(
    entry: PlayaPackCatalogEntry,
    manifest: PlayaPackManifest,
    existing: LocalPlayaPackRecord | null,
    preserveActiveStatus: boolean,
    onProgress?: (progress: PlayaPackDownloadProgress) => void,
  ): Promise<LocalPlayaPackRecord> {
    const persist = await requestPersistentStorage();
    let record: LocalPlayaPackRecord = {
      ...(existing ?? emptyRecord(entry, persist.persisted)),
      name: manifest.name,
      eventYear: manifest.eventYear,
      formatVersion: manifest.formatVersion,
      // Keep prior contentVersion while staging so UI still shows installed version.
      contentVersion: preserveActiveStatus ? existing?.contentVersion ?? null : null,
      status: preserveActiveStatus ? "active" : "incomplete",
      manifest: preserveActiveStatus ? existing?.manifest ?? manifest : manifest,
      bytesTotal: manifest.totalByteSize,
      bytesReceived: 0,
      lastError: null,
      lastUpdatedAt: nowIso(),
      storagePersisted: persist.persisted,
    };
    // Store the inbound manifest on a transient field via lastUpdatedAt only until promote —
    // keep downloadingManifest separately by writing incomplete meta with pendingManifest.
    await repository.putPack({
      ...record,
      // While downloading a replacement, stash the new manifest on the record only after promote.
      // For first installs, attach immediately.
      manifest: preserveActiveStatus ? existing?.manifest ?? null : manifest,
    });

    // Always stage downloads so an active pack's final blobs stay valid until promote.
    const pendingManifest = manifest;
    onProgress?.(progressFrom({ ...record, status: "incomplete", bytesReceived: 0 }, null));

    let received = 0;
    for (const file of pendingManifest.files) {
      const stagedPath = stagingPackPath(file.path);
      const prior = await repository.getFile(manifest.packId, stagedPath);
      if (
        prior?.complete &&
        prior.data &&
        prior.receivedBytes === file.byteSize &&
        prior.expectedChecksumSha256.toLowerCase() === file.checksumSha256.toLowerCase()
      ) {
        try {
          await assertChecksumSha256(prior.data, file.checksumSha256);
          received += file.byteSize;
          record = { ...record, bytesReceived: received, lastUpdatedAt: nowIso() };
          await repository.putPack({
            ...record,
            status: preserveActiveStatus ? "active" : "incomplete",
            manifest: preserveActiveStatus ? existing?.manifest ?? null : pendingManifest,
          });
          onProgress?.(
            progressFrom(
              { ...record, status: "incomplete", bytesReceived: received },
              file.path,
            ),
          );
          continue;
        } catch {
          // Re-download corrupted staging bytes.
        }
      }

      const stub: LocalPlayaPackFileRecord = {
        id: packFileKey(manifest.packId, stagedPath),
        packId: manifest.packId,
        path: stagedPath,
        role: file.role,
        byteSize: file.byteSize,
        expectedChecksumSha256: file.checksumSha256,
        receivedBytes: 0,
        complete: false,
        data: null,
      };
      await repository.putFile(stub);

      const data = await catalog.fetchFile(entry.manifestUrl, file.path);
      if (data.byteLength !== file.byteSize) {
        throw new Error(
          `Downloaded size mismatch for ${file.path}: expected ${file.byteSize}, got ${data.byteLength}`,
        );
      }
      await assertChecksumSha256(data, file.checksumSha256);

      await repository.putFile({
        ...stub,
        receivedBytes: data.byteLength,
        complete: true,
        data,
      });

      received += data.byteLength;
      record = { ...record, bytesReceived: received, lastUpdatedAt: nowIso() };
      await repository.putPack({
        ...record,
        status: preserveActiveStatus ? "active" : "incomplete",
        manifest: preserveActiveStatus ? existing?.manifest ?? null : pendingManifest,
      });
      onProgress?.(
        progressFrom({ ...record, status: "incomplete", bytesReceived: received }, file.path),
      );
    }

    await validateFilesAt(manifest.packId, pendingManifest, stagingPackPath);
    await repository.promoteStagingFiles(manifest.packId);

    record = {
      ...record,
      status: "ready",
      manifest: pendingManifest,
      contentVersion: pendingManifest.contentVersion,
      bytesReceived: pendingManifest.totalByteSize,
      downloadedAt: nowIso(),
      lastError: null,
      lastUpdatedAt: nowIso(),
      storagePersisted: persist.persisted,
    };
    await repository.putPack(record);
    onProgress?.(progressFrom(record, null));
    return record;
  }

  async function activateReadyPack(record: LocalPlayaPackRecord): Promise<LocalPlayaPackRecord> {
    if (!record.manifest || record.status !== "ready") {
      throw new Error("Only validated ready packs can activate");
    }
    await validateFilesAt(record.packId, record.manifest, (path) => path);
    const sidequests = await loadValidatedSidequests(record.packId, record.manifest);
    await repository.activatePack({ pack: record, sidequests });
    const active = await repository.getPack(record.packId);
    if (!active || active.status !== "active") {
      throw new Error("Activation failed to mark pack active");
    }
    return active;
  }

  async function downloadAndActivate(
    packId: string,
    options?: {
      onProgress?: (progress: PlayaPackDownloadProgress) => void;
      activate?: boolean;
    },
  ): Promise<LocalPlayaPackRecord> {
    const shouldActivate = options?.activate !== false;
    const available = await catalog.listAvailable();
    const entry = available.find((item) => item.packId === packId);
    if (!entry) throw new Error(`Pack not found in catalog: ${packId}`);

    const existing = await repository.getPack(packId);
    const pointer = await repository.getActivePointer();
    const preserveActiveStatus = pointer?.packId === packId && existing?.status === "active";

    try {
      const manifest = await catalog.fetchManifest(entry.manifestUrl);
      if (manifest.packId !== packId) {
        throw new Error(`Manifest packId mismatch: ${manifest.packId}`);
      }
      const ready = await downloadPackFiles(
        entry,
        manifest,
        existing,
        preserveActiveStatus,
        options?.onProgress,
      );
      if (!shouldActivate) return ready;
      return activateReadyPack(ready);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pack download failed";
      const failed = await repository.getPack(packId);
      if (preserveActiveStatus && failed) {
        // Keep prior active pack usable; surface failure without demoting.
        await repository.setPackStatus(packId, "active", {
          lastError: message,
          contentVersion: existing?.contentVersion ?? failed.contentVersion,
          manifest: existing?.manifest ?? failed.manifest,
        });
      } else if (failed) {
        await repository.setPackStatus(packId, "failed", { lastError: message });
      } else {
        await repository.putPack({
          ...emptyRecord(entry, null),
          status: "failed",
          lastError: message,
        });
      }
      // Staging leftovers stay for resume; never activate incomplete/failed content.
      throw error instanceof Error ? error : new Error(message);
    }
  }

  return {
    async getReadiness(): Promise<PlayaPackReadinessView> {
      const notes: string[] = [];
      let catalogEntries: PlayaPackCatalogEntry[] = [];
      try {
        catalogEntries = await catalog.listAvailable();
      } catch {
        notes.push(
          "Pack catalog unavailable (offline or not yet downloaded). Local installs still listed.",
        );
      }

      const installed = await repository.listPacks();
      const activePointer = await repository.getActivePointer();
      const persist = await queryPersistentStorage();
      if (persist.supported && persist.persisted === false) {
        notes.push(
          "Persistent storage is not granted. Packs may be evicted under storage pressure; download requests persistence when available.",
        );
      } else if (!persist.supported) {
        notes.push("Persistent storage API unavailable on this browser.");
      }

      const estimate = await estimateStorage();
      return {
        catalog: catalogEntries,
        installed,
        activePackId: activePointer?.packId ?? null,
        storagePersisted: persist.persisted,
        storageEstimateBytes: estimate.usageBytes,
        storageQuotaBytes: estimate.quotaBytes,
        notes,
      };
    },

    async listCatalog() {
      return catalog.listAvailable();
    },

    async listOfflineMapOffers() {
      const entries = await catalog.listAvailable();
      const offers = await Promise.all(entries.map(async (entry): Promise<OfflineMapOffer | null> => {
        try {
          const manifest = await catalog.fetchManifest(entry.manifestUrl);
          const mapRef = manifest.files.find((file) => file.role === "map_ref");
          if (!manifest.mapPackageId || !mapRef) return null;
          const bytes = await catalog.fetchFile(entry.manifestUrl, mapRef.path);
          await assertChecksumSha256(bytes, mapRef.checksumSha256);
          const mapPackage = parseMapPackage(decodeJsonArrayBuffer(bytes));
          if (mapPackage.id !== manifest.mapPackageId) return null;
          const tileAssets = mapPackage.assets.filter((asset) => asset.role === "pmtiles");
          if (tileAssets.length === 0) return null;
          const allTilesArePackaged = tileAssets.every((asset) => manifest.files.some((file) =>
            file.path === asset.path && file.byteSize === asset.byteSize &&
            file.checksumSha256.toLowerCase() === asset.checksumSha256.toLowerCase()
          ));
          if (!allTilesArePackaged) return null;
          return {
            packId: manifest.packId,
            name: manifest.name,
            eventYear: manifest.eventYear,
            contentVersion: manifest.contentVersion,
            totalByteSize: manifest.totalByteSize,
          };
        } catch {
          return null;
        }
      }));
      return offers.filter((offer): offer is OfflineMapOffer => offer !== null);
    },

    async getActivePack() {
      const pointer = await repository.getActivePointer();
      if (!pointer) return null;
      const pack = await repository.getPack(pointer.packId);
      if (!pack || pack.status !== "active") return null;
      return pack;
    },

    async getActiveSidequests() {
      const pointer = await repository.getActivePointer();
      if (!pointer) return [];
      return repository.listPackSidequests(pointer.packId);
    },

    async getActiveEventData() {
      const pointer = await repository.getActivePointer();
      if (!pointer) return null;
      const pack = await repository.getPack(pointer.packId);
      if (!pack?.manifest || pack.status !== "active") return null;
      const eventFile = pack.manifest.files.find((file) => file.role === "event");
      if (!eventFile) return null;
      const stored = await repository.getFile(pack.packId, eventFile.path);
      if (!stored?.complete || !stored.data) return null;
      return decodeJsonArrayBuffer(stored.data);
    },

    toPlayaPackSummary(record, sidequestIds) {
      return {
        id: record.packId,
        name: record.name,
        eventYear: record.eventYear,
        formatVersion: record.formatVersion,
        contentVersion: record.contentVersion,
        sidequestIds,
        mapPackageId: record.manifest?.mapPackageId ?? null,
        createdAt: record.manifest?.createdAt ?? record.lastUpdatedAt,
        status: record.status,
      };
    },

    downloadAndActivate,

    async retry(packId, onProgress) {
      return downloadAndActivate(packId, { onProgress, activate: true });
    },

    async remove(packId) {
      await repository.removePack(packId);
    },
  };
}
