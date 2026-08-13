import type { AuthProvider, AuthSession } from "@/features/auth/types/auth";
import type {
  RemoteSyncAdapter,
  SyncDrainResult,
  SyncOperation,
  SyncRepository,
  SyncService,
  SyncStatus,
} from "@/features/sync/types/sync";
import { nextAttemptAtIso } from "@/features/sync/utils/backoff";
import { isRemoteSyncOperationType } from "@/features/sync/utils/entityTable";
import { getPlayaDatabase } from "@/lib/storage/playaDatabase";
import {
  parseQuestCompletion,
  parseSidequest,
  parseSidequestProgress,
} from "@/features/sidequests/types/sidequest";
import { log as writeLog } from "@/lib/logging/logger";

export type SyncServiceOptions = {
  repository: SyncRepository;
  remote: RemoteSyncAdapter;
  auth: AuthProvider;
  /** Optional clock for tests. */
  now?: () => Date;
  /** Optional schedule for auto drain after backoff (tests can stub). */
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearSchedule?: (id: ReturnType<typeof setTimeout>) => void;
};

async function markLocalEntitySynced(op: SyncOperation): Promise<void> {
  const db = await getPlayaDatabase();
  if (op.type.startsWith("sidequest.")) {
    const row = await db.get("sidequests", op.entityId);
    if (!row) return;
    const quest = parseSidequest(row);
    if (quest.syncStatus === "synced") return;
    await db.put("sidequests", parseSidequest({ ...quest, syncStatus: "synced" }));
    return;
  }
  if (op.type.startsWith("progress.")) {
    const row = await db.get("sidequestProgress", op.entityId);
    if (!row) return;
    const progress = parseSidequestProgress(row);
    if (progress.syncStatus === "synced") return;
    await db.put("sidequestProgress", parseSidequestProgress({ ...progress, syncStatus: "synced" }));
    return;
  }
  if (op.type.startsWith("completion.")) {
    const row = await db.get("questCompletions", op.entityId);
    if (!row) return;
    const completion = parseQuestCompletion(row);
    if (completion.syncStatus === "synced") return;
    await db.put(
      "questCompletions",
      parseQuestCompletion({ ...completion, syncStatus: "synced" }),
    );
  }
}

export function createSyncService(options: SyncServiceOptions): SyncService {
  const now = options.now ?? (() => new Date());
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const clearSchedule = options.clearSchedule ?? ((id) => clearTimeout(id));

  let draining = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let started = false;
  let generation = 0;
  const listeners: Array<() => void> = [];

  async function resolveSession(): Promise<AuthSession> {
    return options.auth.getSession();
  }

  async function statusSnapshot(): Promise<SyncStatus> {
    const session = await resolveSession();
    return options.repository.getStatus({
      backend: options.remote.backend,
      authenticated: Boolean(session?.userId),
    });
  }

  function pauseGate(session: AuthSession, online: boolean): { paused: true; reason: string } | null {
    if (options.remote.backend === "none") {
      return { paused: true, reason: "Sample / local-only mode — remote sync is disabled" };
    }
    if (!session?.userId) {
      return { paused: true, reason: "Sign in (anonymous session) to upload pending operations" };
    }
    if (!online) {
      return { paused: true, reason: "Offline — will retry when connection returns" };
    }
    return null;
  }

  async function processOne(op: SyncOperation): Promise<"synced" | "failed" | "conflict" | "skipped"> {
    if (!isRemoteSyncOperationType(op.type) || !op.entityTable) {
      // Local-only ops (e.g. pack.download) — acknowledge locally without remote.
      await options.repository.markSynchronized(op.id, {
        remoteAppliedAt: now().toISOString(),
      });
      return "synced";
    }

    await options.repository.markSyncing(op.id);
    const result = await options.remote.apply({
      clientOperationId: op.idempotencyKey,
      operationType: op.type,
      entityId: op.entityId,
      entityTable: op.entityTable,
      payload: op.payload,
      payloadHash: op.payloadHash,
    });

    if (result.kind === "acknowledged") {
      await options.repository.markSynchronized(op.id, {
        remoteReceiptId: result.receiptId,
        remoteAppliedAt: result.appliedAt,
      });
      try {
        await markLocalEntitySynced(op);
      } catch (error) {
        writeLog("warn", "Local entity syncStatus update failed after remote ack", error);
      }
      return "synced";
    }

    if (result.kind === "conflict") {
      await options.repository.markConflict(op.id, {
        localPayload: op.payload,
        remotePayload: result.remotePayload ?? null,
        message: result.message,
      });
      return "conflict";
    }

    if (result.retryable) {
      const attemptCount = op.attemptCount + 1;
      await options.repository.markFailed(op.id, result.message, {
        incrementAttempt: true,
        nextAttemptAt: nextAttemptAtIso(attemptCount, now()),
      });
      return "failed";
    }

    await options.repository.markFailed(op.id, result.message, {
      incrementAttempt: true,
      nextAttemptAt: null,
    });
    return "failed";
  }

  async function drain(): Promise<SyncDrainResult> {
    if (draining) {
      return {
        attempted: 0,
        synced: 0,
        failed: 0,
        conflicts: 0,
        skipped: 0,
        paused: true,
        pauseReason: "Sync already in progress",
      };
    }

    draining = true;
    const empty: SyncDrainResult = {
      attempted: 0,
      synced: 0,
      failed: 0,
      conflicts: 0,
      skipped: 0,
      paused: false,
      pauseReason: null,
    };

    try {
      let session = await resolveSession();
      const online =
        typeof navigator === "undefined" || !("onLine" in navigator) ? true : navigator.onLine;
      let due: SyncOperation[] | null = null;

      // Creating a public beacon is already an explicit sync action. If the device has
      // queued work but no account yet, establish the supported anonymous session here
      // so testers do not need to discover a separate Profile toggle first. Do not sign
      // in on an empty outbox: merely opening SIDEBURNS remains account-free.
      if (
        options.remote.backend !== "none" &&
        online &&
        !session?.userId &&
        options.auth.signInAnonymously
      ) {
        due = await options.repository.listDue(now());
        if (due.length > 0) {
          try {
            session = await options.auth.signInAnonymously();
          } catch (error) {
            return {
              ...empty,
              paused: true,
              pauseReason:
                error instanceof Error
                  ? `Unable to start anonymous sync: ${error.message}`
                  : "Unable to start anonymous sync",
            };
          }
        }
      }
      const gate = pauseGate(session, online);
      if (gate) {
        return { ...empty, paused: true, pauseReason: gate.reason };
      }

      due ??= await options.repository.listDue(now());
      for (const op of due) {
        empty.attempted += 1;
        try {
          const outcome = await processOne(op);
          if (outcome === "synced") empty.synced += 1;
          else if (outcome === "conflict") empty.conflicts += 1;
          else if (outcome === "failed") empty.failed += 1;
          else empty.skipped += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unexpected sync failure";
          await options.repository.markFailed(op.id, message, {
            incrementAttempt: true,
            nextAttemptAt: nextAttemptAtIso(op.attemptCount + 1, now()),
          });
          empty.failed += 1;
          writeLog("warn", "Sync operation threw", { id: op.id, message });
        }
      }

      scheduleNextWake();
      return empty;
    } finally {
      draining = false;
    }
  }

  function scheduleNextWake() {
    if (!started) return;
    const wakeGeneration = generation;
    if (timer) {
      clearSchedule(timer);
      timer = null;
    }
    void (async () => {
      if (!started || wakeGeneration !== generation) return;
      const pending = await options.repository.listPending();
      if (!started || wakeGeneration !== generation) return;
      const upcoming = pending
        .filter((op) => op.status === "failed" || op.status === "pending")
        .map((op) => (op.nextAttemptAt ? Date.parse(op.nextAttemptAt) : now().getTime()))
        .filter((ms) => Number.isFinite(ms))
        .sort((a, b) => a - b)[0];
      if (upcoming == null) return;
      const delay = Math.max(250, upcoming - now().getTime());
      if (!started || wakeGeneration !== generation) return;
      timer = schedule(() => {
        if (!started || wakeGeneration !== generation) return;
        void drain();
      }, Math.min(delay, 5 * 60 * 1000));
    })();
  }

  async function retry(id: string): Promise<SyncDrainResult> {
    await options.repository.retry(id);
    return drain();
  }

  async function retryAllFailed(): Promise<SyncDrainResult> {
    const all = await options.repository.listAll();
    for (const op of all) {
      if (op.status === "failed" || op.status === "conflict") {
        await options.repository.retry(op.id);
      }
    }
    return drain();
  }

  function start(): () => void {
    if (started) {
      return () => undefined;
    }
    started = true;
    generation += 1;

    const onOnline = () => {
      if (!started) return;
      void drain();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      listeners.push(() => window.removeEventListener("online", onOnline));
    }

    if (options.auth.onAuthStateChange) {
      const unsub = options.auth.onAuthStateChange((session) => {
        if (!started) return;
        if (session?.userId) void drain();
      });
      listeners.push(unsub);
    }

    // Opportunistic drain on start (non-blocking). Do not rely on Background Sync API.
    void drain();
    scheduleNextWake();

    return () => {
      started = false;
      generation += 1;
      if (timer) {
        clearSchedule(timer);
        timer = null;
      }
      while (listeners.length) {
        const dispose = listeners.pop();
        dispose?.();
      }
    };
  }

  return {
    getStatus: statusSnapshot,
    listOperations: () => options.repository.listAll(),
    drain,
    retry,
    retryAllFailed,
    start,
  };
}
