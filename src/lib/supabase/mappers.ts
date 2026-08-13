/**
 * Map Supabase row DTOs → SIDEBURNS domain types.
 * Keep this adapter-only; UI and feature services consume domain types exclusively.
 */
import type {
  QuestCompletion,
  Sidequest,
  SidequestProgress,
} from "@/features/sidequests/types/sidequest";
import { inferSidequestOrigin, inferUserContentOrigin } from "@/features/sidequests/types/sidequest";
import type { SyncOperationType } from "@/features/sync/types/sync";
import {
  parseRemoteEventPackRow,
  parseRemoteSyncOperationReceiptRow,
  parseRemoteUserQuestCompletionRow,
  parseRemoteUserSidequestProgressRow,
  parseRemoteUserSidequestRow,
  type RemoteEventPackRow,
  type RemoteSyncOperationReceiptRow,
  type RemoteUserQuestCompletionRow,
  type RemoteUserSidequestProgressRow,
  type RemoteUserSidequestRow,
} from "@/lib/supabase/remoteSchemas";

export type RemoteEventPackCatalogEntry = {
  packId: string;
  name: string;
  eventYear: number | null;
  formatVersion: string;
  contentVersion: string;
  catalogUrl: string | null;
  totalByteSize: number | null;
  mapPackageId: string | null;
  updatedAt: string;
};

export type RemoteSyncReceipt = {
  clientOperationId: string;
  operationType: SyncOperationType;
  entityId: string;
  appliedAt: string;
  payloadHash: string | null;
};

function assertAlive(deletedAt: string | null, label: string): void {
  if (deletedAt != null) {
    throw new Error(`${label} is soft-deleted and must not map into active domain state`);
  }
}

export function mapRemoteUserSidequestToDomain(row: RemoteUserSidequestRow): Sidequest {
  assertAlive(row.deleted_at, "user_sidequests row");
  const origin = inferSidequestOrigin({
    id: row.id,
    packId: row.pack_id,
    origin: "local",
    syncStatus: "synced",
  });

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: {
      latitude: row.latitude,
      longitude: row.longitude,
      accuracyMeters: row.accuracy_meters,
      altitudeMeters: row.altitude_meters,
    },
    radiusMeters: row.radius_meters,
    category: row.category,
    availability: row.availability,
    difficulty: row.difficulty,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: "synced",
    packId: row.pack_id,
    placementKind: row.placement_kind,
    origin,
    completionRule: row.completion_rule,
    contentOrigin: inferUserContentOrigin({ origin }),
    creatorId: null,
    creatorDisplayName: null,
    beaconKind: null,
    presenter: null,
    reward: null,
    livePin: false,
    testAreaId: null,
  };
}

export function sidequestToRemoteApplyPayload(sidequest: Sidequest) {
  return {
    title: sidequest.title,
    description: sidequest.description,
    latitude: sidequest.location.latitude,
    longitude: sidequest.location.longitude,
    accuracy_meters: sidequest.location.accuracyMeters ?? null,
    altitude_meters: sidequest.location.altitudeMeters ?? null,
    radius_meters: sidequest.radiusMeters,
    category: sidequest.category,
    availability: sidequest.availability,
    difficulty: sidequest.difficulty,
    placement_kind: sidequest.placementKind ?? "exact",
    completion_rule: sidequest.completionRule,
    beacon_kind: sidequest.beaconKind ?? null,
    presenter: sidequest.presenter ?? null,
    reward: sidequest.reward ?? null,
    live_pin: sidequest.livePin ?? false,
    test_area_id: sidequest.testAreaId ?? null,
    pack_id: sidequest.packId ?? null,
    created_at: sidequest.createdAt,
    updated_at: sidequest.updatedAt,
  };
}

export function progressToRemoteApplyPayload(progress: SidequestProgress) {
  return {
    sidequest_id: progress.sidequestId,
    phase: progress.phase,
    saved_at: progress.savedAt,
    begun_at: progress.begunAt,
    completed_at: progress.completedAt,
    notes: progress.notes,
    updated_at: progress.updatedAt,
  };
}

export function completionToRemoteApplyPayload(completion: QuestCompletion) {
  return {
    sidequest_id: completion.sidequestId,
    completed_at: completion.completedAt,
    notes: completion.notes,
    created_at: completion.completedAt,
    updated_at: completion.completedAt,
  };
}

export function mapRemoteProgressToDomain(row: RemoteUserSidequestProgressRow): SidequestProgress {
  assertAlive(row.deleted_at, "user_sidequest_progress row");
  return {
    id: row.id,
    sidequestId: row.sidequest_id,
    phase: row.phase,
    savedAt: row.saved_at,
    begunAt: row.begun_at,
    completedAt: row.completed_at,
    notes: row.notes,
    syncStatus: "synced",
    updatedAt: row.updated_at,
  };
}

export function mapRemoteCompletionToDomain(row: RemoteUserQuestCompletionRow): QuestCompletion {
  assertAlive(row.deleted_at, "user_quest_completions row");
  return {
    id: row.id,
    sidequestId: row.sidequest_id,
    completedAt: row.completed_at,
    notes: row.notes,
    syncStatus: "synced",
  };
}

export function mapRemoteEventPackToCatalog(row: RemoteEventPackRow): RemoteEventPackCatalogEntry {
  assertAlive(row.deleted_at, "event_packs row");
  if (!row.is_published) {
    throw new Error("unpublished event_packs row must not surface in catalog mapping");
  }
  return {
    packId: row.pack_id,
    name: row.name,
    eventYear: row.event_year,
    formatVersion: row.format_version,
    contentVersion: row.content_version,
    catalogUrl: row.catalog_url,
    totalByteSize: row.total_byte_size,
    mapPackageId: row.map_package_id,
    updatedAt: row.updated_at,
  };
}

export function mapRemoteSyncReceipt(row: RemoteSyncOperationReceiptRow): RemoteSyncReceipt {
  return {
    clientOperationId: row.client_operation_id,
    operationType: row.operation_type,
    entityId: row.entity_id,
    appliedAt: row.applied_at,
    payloadHash: row.payload_hash,
  };
}

export {
  parseRemoteEventPackRow,
  parseRemoteSyncOperationReceiptRow,
  parseRemoteUserQuestCompletionRow,
  parseRemoteUserSidequestProgressRow,
  parseRemoteUserSidequestRow,
};
