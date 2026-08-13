import type {
  SyncEnqueueInput,
  SyncOperation,
  SyncRepository,
  SyncStatus,
} from "@/features/sync/types/sync";
import { parseSyncOperation } from "@/features/sync/schemas/syncOperationSchema";
import { entityTableForOperation } from "@/features/sync/utils/entityTable";
import { getPlayaDatabase } from "@/lib/storage/playaDatabase";
import { withLocalPersistence } from "@/features/sidequests/utils/localPersistence";

function createId() {
  return `sync_${crypto.randomUUID()}`;
}

function connectivity(): SyncStatus["connectivity"] {
  return typeof navigator !== "undefined" && "onLine" in navigator
    ? navigator.onLine
      ? "online"
      : "offline"
    : "unknown";
}

export function buildSyncOperation(input: SyncEnqueueInput): SyncOperation {
  const now = new Date().toISOString();
  const id = input.id ?? createId();
  const idempotencyKey = input.idempotencyKey ?? id;
  return parseSyncOperation({
    id,
    idempotencyKey,
    type: input.type,
    entityId: input.entityId,
    entityTable: input.entityTable ?? entityTableForOperation(input.type),
    payload: input.payload,
    payloadHash: input.payloadHash ?? null,
    status: input.status ?? "pending",
    createdAt: now,
    updatedAt: now,
    attemptCount: 0,
    lastError: null,
    nextAttemptAt: null,
    conflict: null,
    remoteReceiptId: null,
    remoteAppliedAt: null,
  });
}

function summarize(
  all: SyncOperation[],
  options?: { backend?: SyncStatus["backend"]; authenticated?: boolean },
): SyncStatus {
  const backend = options?.backend ?? "none";
  const authenticated = options?.authenticated ?? false;
  let pauseReason: string | null = null;
  if (backend === "none") {
    pauseReason = "Sample / local-only mode — remote sync is disabled";
  } else if (!authenticated) {
    pauseReason = "Sign in (anonymous session) to upload pending operations";
  } else if (connectivity() === "offline") {
    pauseReason = "Offline — will retry when connection returns";
  }

  return {
    pendingCount: all.filter((op) => op.status === "pending").length,
    failedCount: all.filter((op) => op.status === "failed").length,
    conflictCount: all.filter((op) => op.status === "conflict").length,
    syncingCount: all.filter((op) => op.status === "syncing").length,
    lastSyncedAt:
      all
        .filter((op) => op.status === "synced")
        .map((op) => op.remoteAppliedAt ?? op.updatedAt)
        .sort()
        .at(-1) ?? null,
    connectivity: connectivity(),
    backend,
    authenticated,
    pauseReason,
  };
}

function isDue(op: SyncOperation, nowMs: number): boolean {
  if (op.status === "conflict" || op.status === "synced" || op.status === "syncing") return false;
  if (op.type === "pack.download") return false;
  if (op.status === "pending") {
    if (!op.nextAttemptAt) return true;
    return Date.parse(op.nextAttemptAt) <= nowMs;
  }
  if (op.status === "failed") {
    // Auto-retry only when backoff scheduled a next attempt. Manual retry clears this gate.
    if (!op.nextAttemptAt) return false;
    return Date.parse(op.nextAttemptAt) <= nowMs;
  }
  return false;
}

export function createIndexedDbSyncRepository(): SyncRepository {
  return {
    buildOperation(input) {
      return buildSyncOperation(input);
    },

    async enqueue(input) {
      return withLocalPersistence("enqueue sync operation", async () => {
        const op = buildSyncOperation(input);
        const db = await getPlayaDatabase();
        await db.put("syncOutbox", op);
        return op;
      });
    },

    async put(operation) {
      return withLocalPersistence("put sync operation", async () => {
        const parsed = parseSyncOperation(operation);
        const db = await getPlayaDatabase();
        await db.put("syncOutbox", parsed);
        return parsed;
      });
    },

    async listPending() {
      return withLocalPersistence("list pending sync", async () => {
        const db = await getPlayaDatabase();
        const rows = await db.getAll("syncOutbox");
        return rows
          .map((row) => parseSyncOperation(row))
          .filter((op) => op.status === "pending" || op.status === "failed" || op.status === "syncing");
      });
    },

    async listDue(now = new Date()) {
      return withLocalPersistence("list due sync", async () => {
        const db = await getPlayaDatabase();
        const nowMs = now.getTime();
        return (await db.getAll("syncOutbox"))
          .map((row) => parseSyncOperation(row))
          .filter((op) => isDue(op, nowMs))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
    },

    async listAll() {
      return withLocalPersistence("list sync outbox", async () => {
        const db = await getPlayaDatabase();
        return (await db.getAll("syncOutbox"))
          .map((row) => parseSyncOperation(row))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
    },

    async get(id) {
      return withLocalPersistence("get sync operation", async () => {
        const db = await getPlayaDatabase();
        const row = await db.get("syncOutbox", id);
        return row ? parseSyncOperation(row) : null;
      });
    },

    async retry(id) {
      return withLocalPersistence("retry sync operation", async () => {
        const db = await getPlayaDatabase();
        const existing = await db.get("syncOutbox", id);
        if (!existing) throw new Error(`Unknown sync operation: ${id}`);
        const parsed = parseSyncOperation(existing);
        const next = parseSyncOperation({
          ...parsed,
          status: "pending",
          nextAttemptAt: null,
          updatedAt: new Date().toISOString(),
          lastError: parsed.status === "conflict" ? parsed.lastError : null,
          conflict: parsed.status === "conflict" ? parsed.conflict : null,
        });
        await db.put("syncOutbox", next);
        return next;
      });
    },

    async markSyncing(id) {
      return withLocalPersistence("mark syncing", async () => {
        const db = await getPlayaDatabase();
        const existing = await db.get("syncOutbox", id);
        if (!existing) throw new Error(`Unknown sync operation: ${id}`);
        const next = parseSyncOperation({
          ...parseSyncOperation(existing),
          status: "syncing",
          updatedAt: new Date().toISOString(),
        });
        await db.put("syncOutbox", next);
        return next;
      });
    },

    async markSynchronized(id, ack) {
      return withLocalPersistence("mark synchronized", async () => {
        const db = await getPlayaDatabase();
        const existing = await db.get("syncOutbox", id);
        if (!existing) throw new Error(`Unknown sync operation: ${id}`);
        const parsed = parseSyncOperation(existing);
        const next = parseSyncOperation({
          ...parsed,
          status: "synced",
          updatedAt: new Date().toISOString(),
          lastError: null,
          nextAttemptAt: null,
          conflict: null,
          remoteReceiptId: ack?.remoteReceiptId ?? parsed.remoteReceiptId ?? null,
          remoteAppliedAt:
            ack?.remoteAppliedAt ?? parsed.remoteAppliedAt ?? new Date().toISOString(),
        });
        await db.put("syncOutbox", next);
        return next;
      });
    },

    async markConflict(id, conflict) {
      return withLocalPersistence("mark conflict", async () => {
        const db = await getPlayaDatabase();
        const existing = await db.get("syncOutbox", id);
        if (!existing) throw new Error(`Unknown sync operation: ${id}`);
        const next = parseSyncOperation({
          ...parseSyncOperation(existing),
          status: "conflict",
          updatedAt: new Date().toISOString(),
          lastError: conflict.message,
          nextAttemptAt: null,
          conflict,
        });
        await db.put("syncOutbox", next);
        return next;
      });
    },

    async markFailed(id, error, options) {
      return withLocalPersistence("mark failed sync", async () => {
        const db = await getPlayaDatabase();
        const existing = await db.get("syncOutbox", id);
        if (!existing) throw new Error(`Unknown sync operation: ${id}`);
        const parsed = parseSyncOperation(existing);
        const attemptCount =
          options?.incrementAttempt === false ? parsed.attemptCount : parsed.attemptCount + 1;
        const next = parseSyncOperation({
          ...parsed,
          status: "failed",
          attemptCount,
          updatedAt: new Date().toISOString(),
          lastError: error,
          nextAttemptAt: options?.nextAttemptAt === undefined ? null : options.nextAttemptAt,
        });
        await db.put("syncOutbox", next);
        return next;
      });
    },

    async getStatus(options) {
      return withLocalPersistence("sync status", async () => {
        const db = await getPlayaDatabase();
        const all = (await db.getAll("syncOutbox")).map((row) => parseSyncOperation(row));
        return summarize(all, options);
      });
    },
  };
}
