import type { SyncOperation, SyncOperationType } from "@/features/sync/types/sync";
import { buildSyncOperation } from "@/features/sync/repositories/indexedDbSyncRepository";
import { hashSyncPayload } from "@/features/sync/utils/payloadHash";
import {
  completionToRemoteApplyPayload,
  progressToRemoteApplyPayload,
  sidequestToRemoteApplyPayload,
} from "@/lib/supabase/mappers";
import type {
  QuestCompletion,
  Sidequest,
  SidequestProgress,
} from "@/features/sidequests/types/sidequest";
import { getPlayaDatabase } from "@/lib/storage/playaDatabase";

export async function buildSidequestOutboxOp(
  type: "sidequest.create" | "sidequest.update" | "sidequest.delete",
  sidequest: Sidequest,
): Promise<SyncOperation> {
  const payload =
    type === "sidequest.delete"
      ? { id: sidequest.id, deleted: true }
      : sidequestToRemoteApplyPayload(sidequest);
  const payloadHash = await hashSyncPayload(payload);
  return buildSyncOperation({
    type,
    entityId: sidequest.id,
    payload,
    payloadHash,
  });
}

export async function buildProgressOutboxOp(
  type: "progress.upsert" | "progress.delete",
  progress: SidequestProgress,
): Promise<SyncOperation> {
  const payload =
    type === "progress.delete"
      ? { id: progress.id, sidequest_id: progress.sidequestId, deleted: true }
      : progressToRemoteApplyPayload(progress);
  const payloadHash = await hashSyncPayload(payload);
  return buildSyncOperation({
    type,
    entityId: progress.id,
    payload,
    payloadHash,
  });
}

export async function buildCompletionOutboxOp(
  type: "completion.create" | "completion.delete",
  completion: QuestCompletion,
): Promise<SyncOperation> {
  const payload =
    type === "completion.delete"
      ? { id: completion.id, sidequest_id: completion.sidequestId, deleted: true }
      : completionToRemoteApplyPayload(completion);
  const payloadHash = await hashSyncPayload(payload);
  return buildSyncOperation({
    type,
    entityId: completion.id,
    payload,
    payloadHash,
  });
}

type OutboxStoreName =
  | "sidequests"
  | "sidequestProgress"
  | "questCompletions"
  | "syncOutbox";

/**
 * Write entity row(s) and outbox operation(s) in one IndexedDB transaction.
 * Local storage remains the source of truth even if remote sync never runs.
 */
export async function atomicEntityAndOutbox(input: {
  stores: OutboxStoreName[];
  write: (tx: {
    put: (store: OutboxStoreName, value: unknown) => Promise<void>;
    delete: (store: OutboxStoreName, key: string) => Promise<void>;
  }) => Promise<void>;
}): Promise<void> {
  const db = await getPlayaDatabase();
  const uniqueStores = [...new Set([...input.stores, "syncOutbox" as const])];
  const tx = db.transaction(uniqueStores, "readwrite");
  const api = {
    async put(store: OutboxStoreName, value: unknown) {
      await tx.objectStore(store).put(value as never);
    },
    async delete(store: OutboxStoreName, key: string) {
      await tx.objectStore(store).delete(key);
    },
  };
  await input.write(api);
  await tx.done;
}

export async function putWithOutbox(input: {
  store: Exclude<OutboxStoreName, "syncOutbox">;
  entity: unknown;
  operation: SyncOperation;
}): Promise<void> {
  await atomicEntityAndOutbox({
    stores: [input.store, "syncOutbox"],
    write: async (tx) => {
      await tx.put(input.store, input.entity);
      await tx.put("syncOutbox", input.operation);
    },
  });
}

export async function deleteWithOutbox(input: {
  store: Exclude<OutboxStoreName, "syncOutbox">;
  key: string;
  operation: SyncOperation;
}): Promise<void> {
  await atomicEntityAndOutbox({
    stores: [input.store, "syncOutbox"],
    write: async (tx) => {
      await tx.delete(input.store, input.key);
      await tx.put("syncOutbox", input.operation);
    },
  });
}

export type { SyncOperationType };
