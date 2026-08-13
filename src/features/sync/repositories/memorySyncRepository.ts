import type {
  SyncEnqueueInput,
  SyncOperation,
  SyncRepository,
  SyncStatus,
} from "@/features/sync/types/sync";
import { parseSyncOperation } from "@/features/sync/schemas/syncOperationSchema";
import { entityTableForOperation } from "@/features/sync/utils/entityTable";

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

function buildFromInput(input: SyncEnqueueInput): SyncOperation {
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

/** In-memory sync outbox for unit tests. Production uses IndexedDB. */
export function createMemorySyncRepository(): SyncRepository {
  const operations = new Map<string, SyncOperation>();

  const touch = (op: SyncOperation): SyncOperation => {
    const parsed = parseSyncOperation(op);
    operations.set(parsed.id, parsed);
    return parsed;
  };

  return {
    buildOperation(input) {
      return buildFromInput(input);
    },
    async enqueue(input) {
      return touch(buildFromInput(input));
    },
    async put(operation) {
      return touch(operation);
    },
    async listPending() {
      return [...operations.values()].filter(
        (op) => op.status === "pending" || op.status === "failed" || op.status === "syncing",
      );
    },
    async listDue(now = new Date()) {
      const nowMs = now.getTime();
      return [...operations.values()]
        .filter((op) => isDue(op, nowMs))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async listAll() {
      return [...operations.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async get(id) {
      return operations.get(id) ?? null;
    },
    async retry(id) {
      const existing = operations.get(id);
      if (!existing) throw new Error(`Unknown sync operation: ${id}`);
      return touch({
        ...existing,
        status: "pending",
        nextAttemptAt: null,
        updatedAt: new Date().toISOString(),
        lastError: existing.status === "conflict" ? existing.lastError : null,
        conflict: existing.status === "conflict" ? existing.conflict : null,
      });
    },
    async markSyncing(id) {
      const existing = operations.get(id);
      if (!existing) throw new Error(`Unknown sync operation: ${id}`);
      return touch({
        ...existing,
        status: "syncing",
        updatedAt: new Date().toISOString(),
      });
    },
    async markSynchronized(id, ack) {
      const existing = operations.get(id);
      if (!existing) throw new Error(`Unknown sync operation: ${id}`);
      return touch({
        ...existing,
        status: "synced",
        updatedAt: new Date().toISOString(),
        lastError: null,
        nextAttemptAt: null,
        conflict: null,
        remoteReceiptId: ack?.remoteReceiptId ?? existing.remoteReceiptId ?? null,
        remoteAppliedAt: ack?.remoteAppliedAt ?? existing.remoteAppliedAt ?? new Date().toISOString(),
      });
    },
    async markConflict(id, conflict) {
      const existing = operations.get(id);
      if (!existing) throw new Error(`Unknown sync operation: ${id}`);
      return touch({
        ...existing,
        status: "conflict",
        updatedAt: new Date().toISOString(),
        lastError: conflict.message,
        nextAttemptAt: null,
        conflict,
      });
    },
    async markFailed(id, error, options) {
      const existing = operations.get(id);
      if (!existing) throw new Error(`Unknown sync operation: ${id}`);
      const attemptCount =
        options?.incrementAttempt === false ? existing.attemptCount : existing.attemptCount + 1;
      return touch({
        ...existing,
        status: "failed",
        attemptCount,
        updatedAt: new Date().toISOString(),
        lastError: error,
        nextAttemptAt: options?.nextAttemptAt === undefined ? null : options.nextAttemptAt,
      });
    },
    async getStatus(options) {
      return summarize([...operations.values()], options);
    },
  };
}
