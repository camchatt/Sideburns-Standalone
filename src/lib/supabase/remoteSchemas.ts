/**
 * Remote Supabase row shapes for SIDEBURNS sync adapters.
 * These Zod schemas stay in the adapter boundary — never import into UI components
 * or treat as domain types. Map through the helpers in `mappers.ts`.
 *
 * Explicit DTO interfaces are intentional: this app tsconfig runs with `strict: false`,
 * which makes `z.infer` collapse nullable fields into weak optional shapes.
 */
import { z } from "zod";

export const remoteQuestCategorySchema = z.enum([
  "art",
  "camp",
  "performance",
  "service",
  "explore",
  "other",
]);

export const remoteQuestAvailabilitySchema = z.enum([
  "always",
  "daytime",
  "nighttime",
  "scheduled",
  "unknown",
]);

export const remoteQuestDifficultySchema = z.enum(["easy", "moderate", "challenging", "unknown"]);
export const remotePlacementKindSchema = z.enum(["exact", "approximate"]);
export const remoteCompletionRuleSchema = z.enum(["open", "proximity"]);
export const remoteProgressPhaseSchema = z.enum(["saved", "in_progress", "completed"]);

const isoTimestamp = z.string().datetime({ offset: true });

export const remoteSyncOperationTypeSchema = z.enum([
  "sidequest.create",
  "sidequest.update",
  "sidequest.delete",
  "progress.upsert",
  "progress.delete",
  "completion.create",
  "completion.delete",
]);

export const remoteEntityTableSchema = z.enum([
  "shared_beacons",
  "user_sidequests",
  "user_sidequest_progress",
  "user_quest_completions",
]);

export type RemoteQuestCategory = z.infer<typeof remoteQuestCategorySchema>;
export type RemoteQuestAvailability = z.infer<typeof remoteQuestAvailabilitySchema>;
export type RemoteQuestDifficulty = z.infer<typeof remoteQuestDifficultySchema>;
export type RemotePlacementKind = z.infer<typeof remotePlacementKindSchema>;
export type RemoteCompletionRule = z.infer<typeof remoteCompletionRuleSchema>;
export type RemoteProgressPhase = z.infer<typeof remoteProgressPhaseSchema>;
export type RemoteSyncOperationType = z.infer<typeof remoteSyncOperationTypeSchema>;
export type RemoteEntityTable = z.infer<typeof remoteEntityTableSchema>;

export type RemoteProfileRow = {
  id: string;
  display_name: string | null;
  is_anonymous: boolean;
  created_at: string;
  updated_at: string;
};

export const remoteProfileRowSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  is_anonymous: z.boolean(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
});

export type RemoteEventPackRow = {
  pack_id: string;
  name: string;
  event_year: number | null;
  format_version: string;
  content_version: string;
  catalog_url: string | null;
  total_byte_size: number | null;
  map_package_id: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export const remoteEventPackRowSchema = z.object({
  pack_id: z.string().min(1),
  name: z.string().min(1),
  event_year: z.number().int().nullable(),
  format_version: z.string().min(1),
  content_version: z.string().min(1),
  catalog_url: z.string().nullable(),
  total_byte_size: z.number().int().nonnegative().nullable(),
  map_package_id: z.string().nullable(),
  is_published: z.boolean(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  deleted_at: isoTimestamp.nullable(),
});

export type RemoteUserSidequestRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  altitude_meters: number | null;
  radius_meters: number;
  category: RemoteQuestCategory;
  availability: RemoteQuestAvailability;
  difficulty: RemoteQuestDifficulty;
  placement_kind: RemotePlacementKind;
  completion_rule: RemoteCompletionRule;
  pack_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export const remoteUserSidequestRowSchema = z.object({
  id: z.string().min(1),
  owner_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_meters: z.number().nonnegative().nullable(),
  altitude_meters: z.number().nullable(),
  radius_meters: z.number().positive(),
  category: remoteQuestCategorySchema,
  availability: remoteQuestAvailabilitySchema,
  difficulty: remoteQuestDifficultySchema,
  placement_kind: remotePlacementKindSchema,
  completion_rule: remoteCompletionRuleSchema,
  pack_id: z.string().nullable(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  deleted_at: isoTimestamp.nullable(),
});

export type RemoteUserSidequestProgressRow = {
  id: string;
  owner_id: string;
  sidequest_id: string;
  phase: RemoteProgressPhase;
  saved_at: string | null;
  begun_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export const remoteUserSidequestProgressRowSchema = z.object({
  id: z.string().min(1),
  owner_id: z.string().uuid(),
  sidequest_id: z.string().min(1),
  phase: remoteProgressPhaseSchema,
  saved_at: isoTimestamp.nullable(),
  begun_at: isoTimestamp.nullable(),
  completed_at: isoTimestamp.nullable(),
  notes: z.string().max(500).nullable(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  deleted_at: isoTimestamp.nullable(),
});

export type RemoteUserQuestCompletionRow = {
  id: string;
  owner_id: string;
  sidequest_id: string;
  completed_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export const remoteUserQuestCompletionRowSchema = z.object({
  id: z.string().min(1),
  owner_id: z.string().uuid(),
  sidequest_id: z.string().min(1),
  completed_at: isoTimestamp,
  notes: z.string().max(500).nullable(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  deleted_at: isoTimestamp.nullable(),
});

export type RemoteSyncOperationReceiptRow = {
  id: string;
  owner_id: string;
  client_operation_id: string;
  operation_type: RemoteSyncOperationType;
  entity_id: string;
  entity_table: RemoteEntityTable;
  payload_hash: string | null;
  applied_at: string;
  created_at: string;
  updated_at: string;
};

export const remoteSyncOperationReceiptRowSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  client_operation_id: z.string().min(1),
  operation_type: remoteSyncOperationTypeSchema,
  entity_id: z.string().min(1),
  entity_table: remoteEntityTableSchema,
  payload_hash: z.string().nullable(),
  applied_at: isoTimestamp,
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
});

/** Payload shape accepted by `apply_sync_operation` for sidequest upserts. */
export const remoteSidequestApplyPayloadSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  latitude: z.number(),
  longitude: z.number(),
  accuracy_meters: z.number().nullable().optional(),
  altitude_meters: z.number().nullable().optional(),
  radius_meters: z.number().positive(),
  category: remoteQuestCategorySchema,
  availability: remoteQuestAvailabilitySchema,
  difficulty: remoteQuestDifficultySchema,
  placement_kind: remotePlacementKindSchema.optional().default("exact"),
  completion_rule: remoteCompletionRuleSchema.optional().default("open"),
  pack_id: z.string().nullable().optional(),
  created_at: isoTimestamp.optional(),
  updated_at: isoTimestamp.optional(),
});

export function parseRemoteProfileRow(raw: unknown): RemoteProfileRow {
  return remoteProfileRowSchema.parse(raw) as RemoteProfileRow;
}

export function parseRemoteEventPackRow(raw: unknown): RemoteEventPackRow {
  return remoteEventPackRowSchema.parse(raw) as RemoteEventPackRow;
}

export function parseRemoteUserSidequestRow(raw: unknown): RemoteUserSidequestRow {
  return remoteUserSidequestRowSchema.parse(raw) as RemoteUserSidequestRow;
}

export function parseRemoteUserSidequestProgressRow(raw: unknown): RemoteUserSidequestProgressRow {
  return remoteUserSidequestProgressRowSchema.parse(raw) as RemoteUserSidequestProgressRow;
}

export function parseRemoteUserQuestCompletionRow(raw: unknown): RemoteUserQuestCompletionRow {
  return remoteUserQuestCompletionRowSchema.parse(raw) as RemoteUserQuestCompletionRow;
}

export function parseRemoteSyncOperationReceiptRow(raw: unknown): RemoteSyncOperationReceiptRow {
  return remoteSyncOperationReceiptRowSchema.parse(raw) as RemoteSyncOperationReceiptRow;
}
