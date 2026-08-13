import type { LocationReading } from "@/features/location/types/location";
import type { SidequestProgressRepository } from "@/features/sidequests/repositories/indexedDbSidequestProgressRepository";
import { buildProgressRecord } from "@/features/sidequests/repositories/indexedDbSidequestProgressRepository";
import type {
  QuestCompletion,
  Sidequest,
  SidequestProgress,
  SidequestProvider,
} from "@/features/sidequests/types/sidequest";
import {
  createStableClientId,
  parseQuestCompletion,
  parseSidequestProgress,
} from "@/features/sidequests/types/sidequest";
import {
  CompletionGateError,
  evaluateCompletionGate,
  type CompletionGateResult,
} from "@/features/sidequests/utils/completionGate";
import { withLocalPersistence } from "@/features/sidequests/utils/localPersistence";
import { getPlayaDatabase } from "@/lib/storage/playaDatabase";
import {
  atomicEntityAndOutbox,
  buildCompletionOutboxOp,
  buildProgressOutboxOp,
} from "@/features/sync/utils/atomicEnqueue";

export type SidequestLifecycleSnapshot = {
  sidequest: Sidequest;
  progress: SidequestProgress | null;
  completion: QuestCompletion | null;
  gate: CompletionGateResult;
};

export type CompleteSidequestInput = {
  sidequestId: string;
  notes?: string | null;
  reading?: LocationReading | null;
};

export interface SidequestLifecycleService {
  getSnapshot(sidequestId: string, reading?: LocationReading | null): Promise<SidequestLifecycleSnapshot | null>;
  listProgress(): Promise<SidequestProgress[]>;
  listReview(): Promise<Array<{ sidequest: Sidequest; progress: SidequestProgress }>>;
  save(sidequestId: string): Promise<SidequestProgress>;
  unsave(sidequestId: string): Promise<void>;
  begin(sidequestId: string): Promise<SidequestProgress>;
  abandon(sidequestId: string): Promise<SidequestProgress | null>;
  complete(input: CompleteSidequestInput): Promise<{ progress: SidequestProgress; completion: QuestCompletion }>;
  undoComplete(sidequestId: string): Promise<SidequestProgress | null>;
}

export function createSidequestLifecycleService(input: {
  sidequests: SidequestProvider;
  progress: SidequestProgressRepository;
}): SidequestLifecycleService {
  async function requireSidequest(sidequestId: string): Promise<Sidequest> {
    const sidequest = await input.sidequests.getById(sidequestId);
    if (!sidequest) throw new Error(`Sidequest not found: ${sidequestId}`);
    return sidequest;
  }

  return {
    async getSnapshot(sidequestId, reading = null) {
      const sidequest = await input.sidequests.getById(sidequestId);
      if (!sidequest) return null;
      const [progress, completion] = await Promise.all([
        input.progress.getForSidequest(sidequestId),
        withLocalPersistence("read completion", async () => {
          const db = await getPlayaDatabase();
          const row = await db.getFromIndex("questCompletions", "sidequestId", sidequestId);
          return row ? parseQuestCompletion(row) : null;
        }),
      ]);
      return {
        sidequest,
        progress,
        completion,
        gate: evaluateCompletionGate(sidequest, reading ?? null),
      };
    },

    listProgress() {
      return input.progress.list();
    },

    async listReview() {
      const [progressRows, sidequests] = await Promise.all([
        input.progress.list(),
        input.sidequests.getAll(),
      ]);
      const byId = new Map(sidequests.map((quest) => [quest.id, quest]));
      return progressRows
        .map((progress) => {
          const sidequest = byId.get(progress.sidequestId);
          return sidequest ? { sidequest, progress } : null;
        })
        .filter((row): row is { sidequest: Sidequest; progress: SidequestProgress } => row != null)
        .sort((a, b) => b.progress.updatedAt.localeCompare(a.progress.updatedAt));
    },

    async save(sidequestId) {
      await requireSidequest(sidequestId);
      const existing = await input.progress.getForSidequest(sidequestId);
      if (existing?.phase === "completed" || existing?.phase === "in_progress") {
        return existing;
      }
      const next = buildProgressRecord({ existing, sidequestId, phase: "saved" });
      return input.progress.put(next);
    },

    async unsave(sidequestId) {
      const existing = await input.progress.getForSidequest(sidequestId);
      if (!existing) return;
      if (existing.phase !== "saved") {
        throw new Error("Only saved (not begun) sidequests can be unsaved. Abandon or undo completion first.");
      }
      await input.progress.remove(sidequestId);
    },

    async begin(sidequestId) {
      await requireSidequest(sidequestId);
      const existing = await input.progress.getForSidequest(sidequestId);
      if (existing?.phase === "completed") return existing;
      if (existing?.phase === "in_progress") return existing;
      const next = buildProgressRecord({ existing, sidequestId, phase: "in_progress" });
      return input.progress.put(next);
    },

    async abandon(sidequestId) {
      const existing = await input.progress.getForSidequest(sidequestId);
      if (!existing || existing.phase === "completed") return existing;
      if (existing.phase === "saved") {
        await input.progress.remove(sidequestId);
        return null;
      }
      if (existing.savedAt && existing.savedAt !== existing.begunAt) {
        const next = buildProgressRecord({
          existing: { ...existing, begunAt: null, completedAt: null },
          sidequestId,
          phase: "saved",
          notes: existing.notes,
        });
        return input.progress.put(next);
      }
      await input.progress.remove(sidequestId);
      return null;
    },

    async complete({ sidequestId, notes, reading = null }) {
      const sidequest = await requireSidequest(sidequestId);
      const gate = evaluateCompletionGate(sidequest, reading);
      if (gate.allowed === false) {
        throw new CompletionGateError(gate);
      }

      return withLocalPersistence("complete sidequest", async () => {
        const db = await getPlayaDatabase();
        const existingProgress = await db.getFromIndex("sidequestProgress", "sidequestId", sidequestId);
        const existingCompletion = await db.getFromIndex("questCompletions", "sidequestId", sidequestId);

        if (existingCompletion && existingProgress) {
          return {
            progress: parseSidequestProgress(existingProgress),
            completion: parseQuestCompletion(existingCompletion),
          };
        }

        const now = new Date().toISOString();
        const trimmedNotes = notes?.trim() ? notes.trim() : null;
        const progress = buildProgressRecord({
          existing: existingProgress ? parseSidequestProgress(existingProgress) : null,
          sidequestId,
          phase: "completed",
          notes: trimmedNotes,
          now,
        });
        const completion = parseQuestCompletion({
          id: existingCompletion ? parseQuestCompletion(existingCompletion).id : createStableClientId("qc"),
          sidequestId,
          completedAt: existingCompletion
            ? parseQuestCompletion(existingCompletion).completedAt
            : now,
          notes: trimmedNotes ?? (existingCompletion ? parseQuestCompletion(existingCompletion).notes : null),
          syncStatus: "pending",
        });

        const progressOp = await buildProgressOutboxOp("progress.upsert", progress);
        const completionOp = await buildCompletionOutboxOp("completion.create", completion);

        // Atomic progress + completion + outbox writes.
        await atomicEntityAndOutbox({
          stores: ["sidequestProgress", "questCompletions", "syncOutbox"],
          write: async (tx) => {
            await tx.put("sidequestProgress", progress);
            await tx.put("questCompletions", completion);
            await tx.put("syncOutbox", progressOp);
            await tx.put("syncOutbox", completionOp);
          },
        });

        return { progress, completion };
      });
    },

    async undoComplete(sidequestId) {
      return withLocalPersistence("undo completion", async () => {
        const db = await getPlayaDatabase();
        const existingProgress = await db.getFromIndex("sidequestProgress", "sidequestId", sidequestId);
        const existingCompletion = await db.getFromIndex("questCompletions", "sidequestId", sidequestId);
        if (!existingProgress && !existingCompletion) return null;

        const parsed = existingProgress ? parseSidequestProgress(existingProgress) : null;
        const next = parsed
          ? buildProgressRecord({
              existing: { ...parsed, completedAt: null },
              sidequestId,
              phase: parsed.begunAt ? "in_progress" : "saved",
              notes: parsed.notes,
            })
          : null;

        const ops = [];
        if (existingCompletion) {
          ops.push(
            await buildCompletionOutboxOp(
              "completion.delete",
              parseQuestCompletion(existingCompletion),
            ),
          );
        }
        if (next) {
          ops.push(await buildProgressOutboxOp("progress.upsert", next));
        } else if (parsed) {
          ops.push(await buildProgressOutboxOp("progress.delete", parsed));
        }

        await atomicEntityAndOutbox({
          stores: ["sidequestProgress", "questCompletions", "syncOutbox"],
          write: async (tx) => {
            if (existingCompletion) {
              await tx.delete("questCompletions", existingCompletion.id);
            }
            if (next) {
              await tx.put("sidequestProgress", next);
            } else if (existingProgress) {
              await tx.delete("sidequestProgress", existingProgress.id);
            }
            for (const op of ops) {
              await tx.put("syncOutbox", op);
            }
          },
        });

        return next;
      });
    },
  };
}
