import { z } from "zod";
import type { Coordinates } from "@/features/location/types/coordinates";

export const questCategorySchema = z.enum([
  "art",
  "camp",
  "performance",
  "service",
  "explore",
  "other",
]);
export type QuestCategory = z.infer<typeof questCategorySchema>;

export const localBeaconKindSchema = z.enum(["food", "get_weird", "do_good", "medical", "bike", "restroom"]);
export type LocalBeaconKind = z.infer<typeof localBeaconKindSchema>;

/** Accept legacy prototype kinds and normalize to the current taxonomy. */
const legacyBeaconKindSchema = z.enum(["food", "get_weird", "do_good", "medical", "bike", "restroom", "massage"]);

function normalizeLocalBeaconKind(raw: string | null | undefined): LocalBeaconKind | null {
  if (!raw) return null;
  if (raw === "food" || raw === "get_weird" || raw === "do_good" || raw === "medical" || raw === "bike" || raw === "restroom") return raw;
  if (raw === "massage") return "get_weird";
  return null;
}

export const questAvailabilitySchema = z.enum([
  "always",
  "daytime",
  "nighttime",
  "scheduled",
  "unknown",
]);
export type QuestAvailability = z.infer<typeof questAvailabilitySchema>;

export const questDifficultySchema = z.enum(["easy", "moderate", "challenging", "unknown"]);
export type QuestDifficulty = z.infer<typeof questDifficultySchema>;

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().nullable().optional(),
  altitudeMeters: z.number().nullable().optional(),
});

export const placementKindSchema = z.enum(["exact", "approximate"]);
export type SidequestPlacementKind = z.infer<typeof placementKindSchema>;

/**
 * Domain-facing content provenance. UI must use this — never IndexedDB store names
 * or provider adapter ids.
 */
export const sidequestContentOriginSchema = z.enum(["local", "pack", "sample"]);
export type SidequestContentOrigin = z.infer<typeof sidequestContentOriginSchema>;

/**
 * Semantic authorship for post-age and attribution.
 * Distinct from storage `origin` (`local` | `pack` | `sample`).
 */
export const userContentOriginSchema = z.enum(["infrastructure", "user"]);
export type UserContentOrigin = z.infer<typeof userContentOriginSchema>;

/**
 * When `proximity`, completion requires a usable GPS fix inside `radiusMeters`.
 * `open` allows completion without GPS.
 */
export const sidequestCompletionRuleSchema = z.enum(["open", "proximity"]);
export type SidequestCompletionRule = z.infer<typeof sidequestCompletionRuleSchema>;

/** User progress through a sidequest on this device. */
export const sidequestProgressPhaseSchema = z.enum(["saved", "in_progress", "completed"]);
export type SidequestProgressPhase = z.infer<typeof sidequestProgressPhaseSchema>;

export const sidequestSyncStatusSchema = z.enum(["local_only", "pending", "synced", "conflict"]);
export type SidequestSyncStatus = z.infer<typeof sidequestSyncStatusSchema>;

export const progressSyncStatusSchema = z.enum(["pending", "synced", "conflict"]);
export type ProgressSyncStatus = z.infer<typeof progressSyncStatusSchema>;

export const sidequestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  location: coordinatesSchema,
  radiusMeters: z.number().positive(),
  category: questCategorySchema,
  availability: questAvailabilitySchema,
  difficulty: questDifficultySchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  syncStatus: sidequestSyncStatusSchema,
  packId: z.string().nullable().optional(),
  /** Exact GPS placements are distance-ranked; approximate are listed separately. */
  placementKind: placementKindSchema.optional().default("exact"),
  /** Provenance for UI; inferred when missing on older rows. */
  origin: sidequestContentOriginSchema.optional(),
  /** Defaults to open — GPS is never required unless proximity is declared. */
  completionRule: sidequestCompletionRuleSchema.optional().default("open"),
  beaconKind: legacyBeaconKindSchema.nullable().optional(),
  presenter: z.string().max(120).nullable().optional(),
  reward: z.string().max(240).nullable().optional(),
  livePin: z.boolean().optional().default(false),
  testAreaId: z.enum(["black-rock-city", "winthrop"]).nullable().optional(),
  creatorId: z.string().uuid().nullable().optional(),
  creatorDisplayName: z.string().max(80).nullable().optional(),
  contentOrigin: userContentOriginSchema.optional(),
});

export type Sidequest = {
  id: string;
  title: string;
  description: string;
  location: Coordinates;
  radiusMeters: number;
  category: QuestCategory;
  availability: QuestAvailability;
  difficulty: QuestDifficulty;
  createdAt: string;
  updatedAt: string;
  syncStatus: SidequestSyncStatus;
  packId?: string | null;
  placementKind?: SidequestPlacementKind;
  origin: SidequestContentOrigin;
  completionRule: SidequestCompletionRule;
  beaconKind?: LocalBeaconKind | null;
  presenter?: string | null;
  reward?: string | null;
  livePin?: boolean;
  testAreaId?: "black-rock-city" | "winthrop" | null;
  creatorId?: string | null;
  creatorDisplayName?: string | null;
  contentOrigin: UserContentOrigin;
};

export const createSidequestInputSchema = sidequestSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    syncStatus: true,
    origin: true,
  })
  .extend({
    completionRule: sidequestCompletionRuleSchema.optional(),
    creatorId: z.string().uuid().nullable().optional(),
    creatorDisplayName: z.string().max(80).nullable().optional(),
    contentOrigin: userContentOriginSchema.optional(),
  });

export type CreateSidequestInput = {
  title: string;
  description: string;
  location: Coordinates;
  radiusMeters: number;
  category: QuestCategory;
  availability: QuestAvailability;
  difficulty: QuestDifficulty;
  packId?: string | null;
  placementKind?: SidequestPlacementKind;
  completionRule?: SidequestCompletionRule;
  beaconKind?: LocalBeaconKind | null;
  presenter?: string | null;
  reward?: string | null;
  livePin?: boolean;
  testAreaId?: "black-rock-city" | "winthrop" | null;
  creatorId?: string | null;
  creatorDisplayName?: string | null;
  contentOrigin?: UserContentOrigin;
};

export const updateSidequestInputSchema = createSidequestInputSchema.partial();

export type UpdateSidequestInput = Partial<CreateSidequestInput>;

export const questCompletionSchema = z.object({
  id: z.string().min(1),
  sidequestId: z.string().min(1),
  completedAt: z.string().datetime(),
  notes: z.string().max(500).nullable().optional(),
  syncStatus: progressSyncStatusSchema,
});

export type QuestCompletion = z.infer<typeof questCompletionSchema>;

export const sidequestProgressSchema = z.object({
  id: z.string().min(1),
  sidequestId: z.string().min(1),
  phase: sidequestProgressPhaseSchema,
  savedAt: z.string().datetime().nullable().optional(),
  begunAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  syncStatus: progressSyncStatusSchema,
  updatedAt: z.string().datetime(),
});

export type SidequestProgress = z.infer<typeof sidequestProgressSchema>;

export interface SidequestProvider {
  getAll(): Promise<Sidequest[]>;
  getById(id: string): Promise<Sidequest | null>;
  getNearby(location: Coordinates, radiusMeters: number): Promise<Sidequest[]>;
  create(input: CreateSidequestInput): Promise<Sidequest>;
  update(id: string, input: UpdateSidequestInput): Promise<Sidequest>;
  /** Removes user-owned local content only. Packaged and sample records are immutable. */
  delete(id: string): Promise<void>;
}

/** Stable client ids suitable for later idempotent sync (`sq_local_*`, `qp_local_*`, `qc_local_*`). */
export function createStableClientId(prefix: "sq" | "qp" | "qc"): string {
  return `${prefix}_local_${crypto.randomUUID()}`;
}

export function inferSidequestOrigin(input: {
  id: string;
  packId?: string | null;
  origin?: SidequestContentOrigin | null;
  syncStatus?: SidequestSyncStatus;
}): SidequestContentOrigin {
  if (input.origin) return input.origin;
  if (input.id.startsWith("sq_local_")) return "local";
  if (input.id.startsWith("sq_sample_")) return "sample";
  if (input.packId && input.packId.startsWith("pack_sample")) return "sample";
  if (input.packId) return "pack";
  if (input.syncStatus === "local_only" || input.syncStatus === "pending") return "local";
  return "sample";
}

/** Infer semantic content origin for post-age / attribution without inventing ownership. */
export function inferUserContentOrigin(input: {
  origin: SidequestContentOrigin;
  contentOrigin?: UserContentOrigin | null;
}): UserContentOrigin {
  if (input.contentOrigin) return input.contentOrigin;
  return input.origin === "local" ? "user" : "infrastructure";
}

export function parseSidequest(data: unknown): Sidequest {
  const parsed = sidequestSchema.parse(data);
  const origin = inferSidequestOrigin({
    id: parsed.id,
    packId: parsed.packId,
    origin: parsed.origin,
    syncStatus: parsed.syncStatus,
  });
  const contentOrigin = inferUserContentOrigin({
    origin,
    contentOrigin: parsed.contentOrigin,
  });

  return {
    id: parsed.id,
    title: parsed.title,
    description: parsed.description,
    location: {
      latitude: parsed.location.latitude,
      longitude: parsed.location.longitude,
      accuracyMeters: parsed.location.accuracyMeters,
      altitudeMeters: parsed.location.altitudeMeters,
    },
    radiusMeters: parsed.radiusMeters,
    category: parsed.category,
    availability: parsed.availability,
    difficulty: parsed.difficulty,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    syncStatus: parsed.syncStatus,
    packId: parsed.packId,
    placementKind: parsed.placementKind ?? "exact",
    origin,
    completionRule: parsed.completionRule ?? "open",
    beaconKind: normalizeLocalBeaconKind(parsed.beaconKind),
    presenter: parsed.presenter ?? null,
    reward: parsed.reward ?? null,
    livePin: parsed.livePin ?? false,
    testAreaId: parsed.testAreaId ?? null,
    creatorId: parsed.creatorId ?? null,
    creatorDisplayName: parsed.creatorDisplayName ?? null,
    contentOrigin,
  };
}

export function parseSidequestProgress(data: unknown): SidequestProgress {
  return sidequestProgressSchema.parse(data);
}

export function parseQuestCompletion(data: unknown): QuestCompletion {
  return questCompletionSchema.parse(data);
}
