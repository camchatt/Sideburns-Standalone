import type {
  LocalInteraction,
  LocalInteractionEntry,
  LocalInteractionRepository,
  MapRecordCache,
  MapRecordSnapshot,
} from "@/features/map/types/mapRecord";
import { getPlayaDatabase } from "@/lib/storage/playaDatabase";

export function createIndexedDbMapRecordCache(): MapRecordCache {
  return {
    async read() {
      const db = await getPlayaDatabase();
      return (await db.get("mapRecordCache", "current")) ?? null;
    },
    async write(snapshot: MapRecordSnapshot) {
      const db = await getPlayaDatabase();
      await db.put("mapRecordCache", snapshot, "current");
    },
  };
}

const EMPTY: LocalInteraction = { liked: false, saved: false, dismissed: false, updatedAt: "" };

export function createIndexedDbInteractionRepository(): LocalInteractionRepository {
  async function update(recordId: string, field: "liked" | "saved" | "dismissed") {
    const db = await getPlayaDatabase();
    const current = (await db.get("interactions", recordId)) ?? { ...EMPTY, recordId };
    const next = {
      ...current,
      recordId,
      [field]: !current[field],
      updatedAt: new Date().toISOString(),
    };
    await db.put("interactions", next);
    return { liked: next.liked, saved: next.saved, dismissed: next.dismissed ?? false, updatedAt: next.updatedAt };
  }

  return {
    async get(recordId) {
      const db = await getPlayaDatabase();
      const value = await db.get("interactions", recordId);
      return value ? { liked: value.liked, saved: value.saved, dismissed: value.dismissed ?? false, updatedAt: value.updatedAt } : EMPTY;
    },
    toggleLike: (recordId) => update(recordId, "liked"),
    toggleSaved: (recordId) => update(recordId, "saved"),
    toggleDismissed: (recordId) => update(recordId, "dismissed"),
    async listSaved(): Promise<LocalInteractionEntry[]> {
      const db = await getPlayaDatabase();
      const rows = await db.getAll("interactions");
      return rows
        .filter((row) => row.saved)
        .map((row) => ({
          recordId: row.recordId,
          liked: row.liked,
          saved: row.saved,
          updatedAt: row.updatedAt,
        }));
    },
    async listDismissed() {
      const db = await getPlayaDatabase();
      return (await db.getAll("interactions")).filter((row) => row.dismissed).map((row) => row.recordId);
    },
  };
}
