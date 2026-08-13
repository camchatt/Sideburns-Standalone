import {
  createStableClientId,
  parseSidequestProgress,
  type SidequestProgress,
  type SidequestProgressPhase,
} from "@/features/sidequests/types/sidequest";
import { getPlayaDatabase } from "@/lib/storage/playaDatabase";
import { withLocalPersistence } from "@/features/sidequests/utils/localPersistence";
import {
  buildProgressOutboxOp,
  deleteWithOutbox,
  putWithOutbox,
} from "@/features/sync/utils/atomicEnqueue";

export interface SidequestProgressRepository {
  list(): Promise<SidequestProgress[]>;
  getForSidequest(sidequestId: string): Promise<SidequestProgress | null>;
  put(progress: SidequestProgress, options?: { enqueue?: boolean }): Promise<SidequestProgress>;
  remove(sidequestId: string, options?: { enqueue?: boolean }): Promise<void>;
}

export function createIndexedDbSidequestProgressRepository(): SidequestProgressRepository {
  return {
    async list() {
      return withLocalPersistence("list progress", async () => {
        const db = await getPlayaDatabase();
        return (await db.getAll("sidequestProgress")).map((row) => parseSidequestProgress(row));
      });
    },
    async getForSidequest(sidequestId) {
      return withLocalPersistence("read progress", async () => {
        const db = await getPlayaDatabase();
        const row = await db.getFromIndex("sidequestProgress", "sidequestId", sidequestId);
        return row ? parseSidequestProgress(row) : null;
      });
    },
    async put(progress, options) {
      return withLocalPersistence("save progress", async () => {
        const parsed = parseSidequestProgress(progress);
        if (options?.enqueue !== false) {
          const operation = await buildProgressOutboxOp("progress.upsert", parsed);
          await putWithOutbox({ store: "sidequestProgress", entity: parsed, operation });
          return parsed;
        }
        const db = await getPlayaDatabase();
        await db.put("sidequestProgress", parsed);
        return parsed;
      });
    },
    async remove(sidequestId, options) {
      return withLocalPersistence("remove progress", async () => {
        const db = await getPlayaDatabase();
        const existing = await db.getFromIndex("sidequestProgress", "sidequestId", sidequestId);
        if (!existing) return;
        const parsed = parseSidequestProgress(existing);
        if (options?.enqueue !== false) {
          const operation = await buildProgressOutboxOp("progress.delete", parsed);
          await deleteWithOutbox({ store: "sidequestProgress", key: parsed.id, operation });
          return;
        }
        await db.delete("sidequestProgress", existing.id);
      });
    },
  };
}

export function buildProgressRecord(input: {
  existing?: SidequestProgress | null;
  sidequestId: string;
  phase: SidequestProgressPhase;
  notes?: string | null;
  now?: string;
}): SidequestProgress {
  const now = input.now ?? new Date().toISOString();
  const existing = input.existing;
  const notes =
    input.notes !== undefined ? (input.notes?.trim() ? input.notes.trim() : null) : (existing?.notes ?? null);

  return parseSidequestProgress({
    id: existing?.id ?? createStableClientId("qp"),
    sidequestId: input.sidequestId,
    phase: input.phase,
    savedAt:
      input.phase === "saved" || input.phase === "in_progress" || input.phase === "completed"
        ? (existing?.savedAt ?? now)
        : (existing?.savedAt ?? null),
    begunAt:
      input.phase === "in_progress" || input.phase === "completed"
        ? (existing?.begunAt ?? now)
        : (existing?.begunAt ?? null),
    completedAt: input.phase === "completed" ? (existing?.completedAt ?? now) : null,
    notes,
    syncStatus: "pending",
    updatedAt: now,
  });
}
