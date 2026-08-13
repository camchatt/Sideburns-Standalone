import {
  createStableClientId,
  parseQuestCompletion,
  type QuestCompletion,
} from "@/features/sidequests/types/sidequest";
import { getPlayaDatabase } from "@/lib/storage/playaDatabase";
import { withLocalPersistence } from "@/features/sidequests/utils/localPersistence";
import {
  buildCompletionOutboxOp,
  deleteWithOutbox,
  putWithOutbox,
} from "@/features/sync/utils/atomicEnqueue";

export interface QuestCompletionRepository {
  list(): Promise<QuestCompletion[]>;
  getForSidequest(sidequestId: string): Promise<QuestCompletion | null>;
  complete(sidequestId: string, notes?: string): Promise<QuestCompletion>;
  remove(sidequestId: string): Promise<void>;
}

export function createIndexedDbQuestCompletionRepository(): QuestCompletionRepository {
  async function getForSidequest(sidequestId: string) {
    return withLocalPersistence("read completion", async () => {
      const db = await getPlayaDatabase();
      const row = await db.getFromIndex("questCompletions", "sidequestId", sidequestId);
      return row ? parseQuestCompletion(row) : null;
    });
  }

  return {
    async list() {
      return withLocalPersistence("list completions", async () => {
        const db = await getPlayaDatabase();
        return (await db.getAll("questCompletions")).map((row) => parseQuestCompletion(row));
      });
    },
    getForSidequest,
    async complete(sidequestId, notes) {
      return withLocalPersistence("save completion", async () => {
        const existing = await getForSidequest(sidequestId);
        if (existing) return existing;
        const completion = parseQuestCompletion({
          id: createStableClientId("qc"),
          sidequestId,
          completedAt: new Date().toISOString(),
          notes: notes?.trim() || null,
          syncStatus: "pending",
        });
        const operation = await buildCompletionOutboxOp("completion.create", completion);
        await putWithOutbox({ store: "questCompletions", entity: completion, operation });
        return completion;
      });
    },
    async remove(sidequestId) {
      return withLocalPersistence("remove completion", async () => {
        const db = await getPlayaDatabase();
        const existing = await db.getFromIndex("questCompletions", "sidequestId", sidequestId);
        if (!existing) return;
        const parsed = parseQuestCompletion(existing);
        const operation = await buildCompletionOutboxOp("completion.delete", parsed);
        await deleteWithOutbox({ store: "questCompletions", key: parsed.id, operation });
      });
    },
  };
}
