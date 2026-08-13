import { z } from "zod";
import type { SyncOperation } from "@/features/sync/types/sync";

export const syncOperationStatusSchema = z.enum([
  "pending",
  "syncing",
  "synced",
  "failed",
  "conflict",
]);

export const syncOperationTypeSchema = z.enum([
  "sidequest.create",
  "sidequest.update",
  "sidequest.delete",
  "progress.upsert",
  "progress.delete",
  "completion.create",
  "completion.delete",
  "pack.download",
]);

export const syncEntityTableSchema = z.enum([
  "shared_beacons",
  "user_sidequests",
  "user_sidequest_progress",
  "user_quest_completions",
]);

export const syncConflictSnapshotSchema = z.object({
  localPayload: z.unknown(),
  remotePayload: z.unknown().nullable().optional(),
  message: z.string().min(1),
});

export const syncOperationSchema = z.object({
  id: z.string().min(1),
  idempotencyKey: z.string().min(1),
  type: syncOperationTypeSchema,
  entityId: z.string().min(1),
  entityTable: syncEntityTableSchema.nullable(),
  payload: z.unknown(),
  payloadHash: z.string().nullable(),
  status: syncOperationStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().nullable().optional(),
  nextAttemptAt: z.string().datetime().nullable(),
  conflict: syncConflictSnapshotSchema.nullable().optional(),
  remoteReceiptId: z.string().nullable().optional(),
  // Postgres timestamptz commonly serializes as `+00:00`, while local timestamps
  // use `Z`. Accept both valid ISO offset forms at the persistence boundary.
  remoteAppliedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export function parseSyncOperation(raw: unknown): SyncOperation {
  return syncOperationSchema.parse(raw) as SyncOperation;
}
