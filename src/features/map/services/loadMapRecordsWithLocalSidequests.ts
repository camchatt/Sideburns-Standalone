import type { Sidequest } from "@/features/sidequests/types/sidequest";
import type { PlayaMapRecord } from "@/features/map/types/mapRecord";
import { loadMapRecords, type LoadedMapRecords } from "@/features/map/services/loadMapRecords";
import type { MapRecordCache, MapRecordProvider } from "@/features/map/types/mapRecord";

function placementLabelFor(quest: Sidequest): string {
  if (quest.id.startsWith("sq_local_") || quest.origin === "local") return "Local sidequest";
  if (quest.origin === "pack") return "Pack sidequest";
  if ((quest.placementKind ?? "exact") === "approximate") return "Approximate placement";
  return "Sample playa placement";
}

export function sidequestToMapRecord(quest: Sidequest): PlayaMapRecord {
  const placementKind = quest.placementKind ?? "exact";
  return {
    id: quest.id,
    slug: quest.id,
    title: quest.title,
    description: quest.description,
    location: quest.location,
    placementKind,
    placementLabel: placementLabelFor(quest),
    placementConfidence: placementKind === "exact" ? 1 : 0.4,
    eventYear: new Date(quest.createdAt).getUTCFullYear() || new Date().getUTCFullYear(),
    heroImageUrl: null,
    artistName: null,
    radiusMeters: quest.radiusMeters,
    detailUrl: null,
    recordKind: quest.beaconKind ? "beacon" : "sidequest",
    markerKind: quest.beaconKind ?? null,
    category: quest.category,
    origin: quest.origin,
    presenter: quest.presenter ?? null,
    reward: quest.reward ?? null,
    livePin: quest.livePin ?? false,
    testAreaId: quest.testAreaId ?? null,
    creatorId: quest.creatorId ?? null,
    creatorDisplayName: quest.creatorDisplayName ?? null,
    contentOrigin: quest.contentOrigin,
    createdAt: quest.createdAt ?? null,
  };
}

/**
 * Overlay device / pack sidequests onto catalog placements.
 * Sidequest rows win on ID collision so local edits stay visible.
 */
export function mergeMapRecordsWithLocalSidequests(
  pack: PlayaMapRecord[],
  sidequests: Sidequest[],
): PlayaMapRecord[] {
  const byId = new Map(
    pack.map((record) => [
      record.id,
      {
        ...record,
        recordKind: record.recordKind ?? (record.id.startsWith("sq_") ? "sidequest" : "art"),
        category: record.category ?? null,
      } satisfies PlayaMapRecord,
    ]),
  );
  for (const quest of sidequests) {
    byId.set(quest.id, sidequestToMapRecord(quest));
  }
  return [...byId.values()];
}

export type LoadedMapWithLocal = LoadedMapRecords & { localCount: number };

export async function loadMapRecordsWithLocalSidequests(input: {
  primary: MapRecordProvider;
  sample: MapRecordProvider;
  cache: MapRecordCache;
  listLocalSidequests: () => Promise<Sidequest[]>;
}): Promise<LoadedMapWithLocal> {
  const [loaded, sidequests] = await Promise.all([
    loadMapRecords({ primary: input.primary, sample: input.sample, cache: input.cache }),
    input.listLocalSidequests(),
  ]);
  const localOnly = sidequests.filter(
    (quest) => quest.id.startsWith("sq_local_") || quest.origin === "local",
  );
  return {
    ...loaded,
    records: mergeMapRecordsWithLocalSidequests(loaded.records, sidequests),
    localCount: localOnly.length,
  };
}
