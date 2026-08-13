import { getPlayaDatabase } from "@/lib/storage/playaDatabase";
import {
  finalPackPathFromStaging,
  isStagingPackPath,
  packFileKey,
  type ActivePlayaPackPointer,
  type LocalPlayaPackFileRecord,
  type LocalPlayaPackRecord,
  type PlayaPackInstallStatus,
} from "@/features/playa-pack/types/playaPack";
import type { Sidequest } from "@/features/sidequests/types/sidequest";
import { parseSidequest } from "@/features/sidequests/types/sidequest";

export type PlayaPackRepository = {
  listPacks(): Promise<LocalPlayaPackRecord[]>;
  getPack(packId: string): Promise<LocalPlayaPackRecord | null>;
  putPack(record: LocalPlayaPackRecord): Promise<LocalPlayaPackRecord>;
  deletePackMeta(packId: string): Promise<void>;

  listFiles(packId: string): Promise<LocalPlayaPackFileRecord[]>;
  getFile(packId: string, path: string): Promise<LocalPlayaPackFileRecord | null>;
  putFile(record: LocalPlayaPackFileRecord): Promise<void>;
  deleteFilesForPack(packId: string): Promise<void>;
  deleteStagingFiles(packId: string): Promise<void>;
  /**
   * Promote staging blobs to final paths and drop previous final blobs for the pack.
   * Used only after checksum validation succeeds.
   */
  promoteStagingFiles(packId: string): Promise<void>;

  getActivePointer(): Promise<ActivePlayaPackPointer | null>;
  /**
   * Atomically activate a validated pack: swap active pointer, demote previous,
   * replace packSidequests for the new pack. Never touches user `sidequests`.
   */
  activatePack(input: {
    pack: LocalPlayaPackRecord;
    sidequests: Sidequest[];
    activatedAt?: string;
  }): Promise<ActivePlayaPackPointer>;
  clearActivePointer(): Promise<void>;

  listPackSidequests(packId?: string): Promise<Sidequest[]>;
  deletePackSidequests(packId: string): Promise<void>;

  /**
   * Remove pack blobs + meta + packSidequests. Leaves user `sidequests` intact.
   * If the pack was active, clears the active pointer.
   */
  removePack(packId: string): Promise<void>;

  setPackStatus(
    packId: string,
    status: PlayaPackInstallStatus,
    patch?: Partial<LocalPlayaPackRecord>,
  ): Promise<LocalPlayaPackRecord | null>;
};

export function createIndexedDbPlayaPackRepository(): PlayaPackRepository {
  return {
    async listPacks() {
      const db = await getPlayaDatabase();
      return db.getAll("playaPackMeta");
    },

    async getPack(packId) {
      const db = await getPlayaDatabase();
      return (await db.get("playaPackMeta", packId)) ?? null;
    },

    async putPack(record) {
      const db = await getPlayaDatabase();
      await db.put("playaPackMeta", record);
      return record;
    },

    async deletePackMeta(packId) {
      const db = await getPlayaDatabase();
      await db.delete("playaPackMeta", packId);
    },

    async listFiles(packId) {
      const db = await getPlayaDatabase();
      return db.getAllFromIndex("playaPackFiles", "packId", packId);
    },

    async getFile(packId, path) {
      const db = await getPlayaDatabase();
      return (await db.get("playaPackFiles", packFileKey(packId, path))) ?? null;
    },

    async putFile(record) {
      const db = await getPlayaDatabase();
      await db.put("playaPackFiles", { ...record, id: packFileKey(record.packId, record.path) });
    },

    async deleteFilesForPack(packId) {
      const db = await getPlayaDatabase();
      const files = await db.getAllFromIndex("playaPackFiles", "packId", packId);
      const tx = db.transaction("playaPackFiles", "readwrite");
      await Promise.all([...files.map((file) => tx.store.delete(file.id)), tx.done]);
    },

    async deleteStagingFiles(packId) {
      const db = await getPlayaDatabase();
      const files = await db.getAllFromIndex("playaPackFiles", "packId", packId);
      const staging = files.filter((file) => isStagingPackPath(file.path));
      const tx = db.transaction("playaPackFiles", "readwrite");
      await Promise.all([...staging.map((file) => tx.store.delete(file.id)), tx.done]);
    },

    async promoteStagingFiles(packId) {
      const db = await getPlayaDatabase();
      const files = await db.getAllFromIndex("playaPackFiles", "packId", packId);
      const staging = files.filter((file) => isStagingPackPath(file.path));
      const finals = files.filter((file) => !isStagingPackPath(file.path));
      if (staging.length === 0) return;

      const tx = db.transaction("playaPackFiles", "readwrite");
      for (const file of finals) {
        await tx.store.delete(file.id);
      }
      for (const file of staging) {
        const finalPath = finalPackPathFromStaging(file.path);
        await tx.store.delete(file.id);
        await tx.store.put({
          ...file,
          id: packFileKey(packId, finalPath),
          path: finalPath,
        });
      }
      await tx.done;
    },

    async getActivePointer() {
      const db = await getPlayaDatabase();
      return (await db.get("playaPackActive", "current")) ?? null;
    },

    async activatePack(input) {
      const activatedAt = input.activatedAt ?? new Date().toISOString();
      const pointer: ActivePlayaPackPointer = {
        key: "current",
        packId: input.pack.packId,
        contentVersion: input.pack.contentVersion ?? input.pack.manifest?.contentVersion ?? "",
        activatedAt,
      };

      const db = await getPlayaDatabase();
      const tx = db.transaction(
        ["playaPackMeta", "playaPackActive", "packSidequests"],
        "readwrite",
      );

      const previous = await tx.objectStore("playaPackActive").get("current");
      if (previous && previous.packId !== input.pack.packId) {
        const prevMeta = await tx.objectStore("playaPackMeta").get(previous.packId);
        if (prevMeta) {
          await tx.objectStore("playaPackMeta").put({
            ...prevMeta,
            status: "ready",
            lastUpdatedAt: activatedAt,
          });
        }
      }

      const existingPackQuests = await tx.objectStore("packSidequests").getAll();
      for (const quest of existingPackQuests) {
        await tx.objectStore("packSidequests").delete(quest.id);
      }
      for (const quest of input.sidequests) {
        const parsed = parseSidequest({ ...quest, packId: input.pack.packId, origin: "pack" });
        await tx.objectStore("packSidequests").put(parsed);
      }

      await tx.objectStore("playaPackMeta").put({
        ...input.pack,
        status: "active",
        activatedAt,
        lastUpdatedAt: activatedAt,
        lastError: null,
      });
      await tx.objectStore("playaPackActive").put(pointer);
      await tx.done;
      return pointer;
    },

    async clearActivePointer() {
      const db = await getPlayaDatabase();
      await db.delete("playaPackActive", "current");
    },

    async listPackSidequests(packId) {
      const db = await getPlayaDatabase();
      if (packId) {
        const rows = await db.getAllFromIndex("packSidequests", "packId", packId);
        return rows.map((row) => parseSidequest(row));
      }
      return (await db.getAll("packSidequests")).map((row) => parseSidequest(row));
    },

    async deletePackSidequests(packId) {
      const db = await getPlayaDatabase();
      const rows = await db.getAllFromIndex("packSidequests", "packId", packId);
      const tx = db.transaction("packSidequests", "readwrite");
      await Promise.all([...rows.map((row) => tx.store.delete(row.id)), tx.done]);
    },

    async removePack(packId) {
      const db = await getPlayaDatabase();
      const active = await db.get("playaPackActive", "current");
      const files = await db.getAllFromIndex("playaPackFiles", "packId", packId);
      const packQuests = await db.getAllFromIndex("packSidequests", "packId", packId);

      const tx = db.transaction(
        ["playaPackMeta", "playaPackFiles", "playaPackActive", "packSidequests"],
        "readwrite",
      );
      await tx.objectStore("playaPackMeta").delete(packId);
      for (const file of files) await tx.objectStore("playaPackFiles").delete(file.id);
      for (const quest of packQuests) await tx.objectStore("packSidequests").delete(quest.id);
      if (active?.packId === packId) {
        await tx.objectStore("playaPackActive").delete("current");
      }
      await tx.done;
    },

    async setPackStatus(packId, status, patch = {}) {
      const db = await getPlayaDatabase();
      const existing = await db.get("playaPackMeta", packId);
      if (!existing) return null;
      const next: LocalPlayaPackRecord = {
        ...existing,
        ...patch,
        packId,
        status,
        lastUpdatedAt: patch.lastUpdatedAt ?? new Date().toISOString(),
      };
      await db.put("playaPackMeta", next);
      return next;
    },
  };
}
