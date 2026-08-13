export type SyncOperationStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "failed"
  | "conflict";

/**
 * Outbox operation kinds. Remote apply covers the entity mutations listed in
 * `docs/supabase-backend.md`. `pack.download` is local-only (CDN/IndexedDB) and
 * must not be sent to `apply_sync_operation`.
 */
export type SyncOperationType =
  | "sidequest.create"
  | "sidequest.update"
  | "sidequest.delete"
  | "progress.upsert"
  | "progress.delete"
  | "completion.create"
  | "completion.delete"
  | "pack.download";

export type SyncEntityTable =
  | "shared_beacons"
  | "user_sidequests"
  | "user_sidequest_progress"
  | "user_quest_completions"
  | null;

export type SyncConflictSnapshot = {
  localPayload: unknown;
  remotePayload?: unknown | null;
  message: string;
};

export type SyncOperation = {
  /** Stable outbox id — also used as remote `client_operation_id`. */
  id: string;
  /** Explicit idempotency key (equals `id` for SIDEBURNS v1). */
  idempotencyKey: string;
  type: SyncOperationType;
  entityId: string;
  /** Remote table for `apply_sync_operation`; null for local-only ops. */
  entityTable: SyncEntityTable;
  payload: unknown;
  /** Optional hash sent with remote apply for audit / duplicate detection. */
  payloadHash: string | null;
  status: SyncOperationStatus;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  lastError?: string | null;
  /** Earliest time an automatic retry may run (ISO). Null = eligible now / manual-only. */
  nextAttemptAt: string | null;
  /** Preserved for conflict recovery — never silently discarded. */
  conflict?: SyncConflictSnapshot | null;
  /** Last remote receipt ack (when synchronized). */
  remoteReceiptId?: string | null;
  remoteAppliedAt?: string | null;
};

export type SyncEnqueueInput = {
  type: SyncOperationType;
  entityId: string;
  payload: unknown;
  entityTable?: SyncEntityTable;
  payloadHash?: string | null;
  idempotencyKey?: string;
  id?: string;
  status?: SyncOperationStatus;
};

export type SyncBackendMode = "none" | "supabase";

export type SyncStatus = {
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  syncingCount: number;
  lastSyncedAt: string | null;
  connectivity: "online" | "offline" | "unknown";
  /** Honest remote-apply capability (not catalog/sample data source). */
  backend: SyncBackendMode;
  /** True when an authenticated session is available for remote apply. */
  authenticated: boolean;
  /** Human-readable reason sync is paused (auth / sample / offline). */
  pauseReason: string | null;
};

export type SyncDrainResult = {
  attempted: number;
  synced: number;
  failed: number;
  conflicts: number;
  skipped: number;
  paused: boolean;
  pauseReason: string | null;
};

export interface SyncRepository {
  enqueue(operation: SyncEnqueueInput): Promise<SyncOperation>;
  /**
   * Persist a fully formed operation (used inside multi-store IndexedDB transactions).
   * Callers must supply stable id + idempotencyKey.
   */
  put(operation: SyncOperation): Promise<SyncOperation>;
  buildOperation(operation: SyncEnqueueInput): SyncOperation;
  listPending(): Promise<SyncOperation[]>;
  listDue(now?: Date): Promise<SyncOperation[]>;
  listAll(): Promise<SyncOperation[]>;
  get(id: string): Promise<SyncOperation | null>;
  retry(id: string): Promise<SyncOperation>;
  markSyncing(id: string): Promise<SyncOperation>;
  markSynchronized(
    id: string,
    ack?: { remoteReceiptId?: string | null; remoteAppliedAt?: string | null },
  ): Promise<SyncOperation>;
  markConflict(id: string, conflict: SyncConflictSnapshot): Promise<SyncOperation>;
  markFailed(
    id: string,
    error: string,
    options?: { nextAttemptAt?: string | null; incrementAttempt?: boolean },
  ): Promise<SyncOperation>;
  getStatus(options?: {
    backend?: SyncBackendMode;
    authenticated?: boolean;
  }): Promise<SyncStatus>;
}

/** Remote apply boundary — maps domain outbox → SIDEBURNS Supabase RPC. */
export type RemoteSyncApplyRequest = {
  clientOperationId: string;
  operationType: Exclude<SyncOperationType, "pack.download">;
  entityId: string;
  entityTable: Exclude<SyncEntityTable, null>;
  payload: unknown;
  payloadHash: string | null;
};

export type RemoteSyncApplyResult =
  | {
      kind: "acknowledged";
      receiptId: string;
      appliedAt: string;
      duplicateDelivery: boolean;
    }
  | {
      kind: "conflict";
      message: string;
      remotePayload?: unknown | null;
    }
  | {
      kind: "error";
      message: string;
      retryable: boolean;
      code?: string | null;
    };

export interface RemoteSyncAdapter {
  readonly backend: SyncBackendMode;
  apply(request: RemoteSyncApplyRequest): Promise<RemoteSyncApplyResult>;
}

export interface SyncService {
  getStatus(): Promise<SyncStatus>;
  listOperations(): Promise<SyncOperation[]>;
  drain(): Promise<SyncDrainResult>;
  retry(id: string): Promise<SyncDrainResult>;
  retryAllFailed(): Promise<SyncDrainResult>;
  /** Wire opportunistic triggers; returns disposer. */
  start(): () => void;
}
