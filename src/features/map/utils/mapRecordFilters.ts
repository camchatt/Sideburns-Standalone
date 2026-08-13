import type { QuestCategory } from "@/features/sidequests/types/sidequest";
import type { BeaconMarkerKind, PlayaMapRecord, PlayaMapRecordKind } from "@/features/map/types/mapRecord";

export type MapLayerVisibility = {
  art: boolean;
  sidequests: boolean;
  food: boolean;
  getWeird: boolean;
  doGood: boolean;
  medical: boolean;
  bike: boolean;
  restroom: boolean;
};

export type MapRecordFilterInput = {
  records: PlayaMapRecord[];
  query?: string;
  year?: number | null;
  categories?: ReadonlySet<QuestCategory> | null;
  markerKinds?: ReadonlySet<BeaconMarkerKind> | null;
  layers?: MapLayerVisibility;
};

export const DEFAULT_MAP_LAYERS: MapLayerVisibility = {
  art: true,
  sidequests: true,
  food: true,
  getWeird: true,
  doGood: true,
  medical: true,
  bike: true,
  restroom: true,
};

function beaconLayerVisible(layers: MapLayerVisibility, markerKind: BeaconMarkerKind | null | undefined): boolean {
  if (markerKind === "food") return layers.food;
  if (markerKind === "get_weird") return layers.getWeird;
  if (markerKind === "do_good") return layers.doGood;
  if (markerKind === "medical") return layers.medical;
  if (markerKind === "bike") return layers.bike;
  if (markerKind === "restroom") return layers.restroom;
  return layers.food || layers.getWeird || layers.doGood || layers.medical || layers.bike || layers.restroom;
}

/** Pure filter for map browse / marker visibility. */
export function filterMapRecords(input: MapRecordFilterInput): PlayaMapRecord[] {
  const q = input.query?.trim().toLowerCase() ?? "";
  const layers = input.layers ?? DEFAULT_MAP_LAYERS;
  const categories = input.categories;

  return input.records.filter((record) => {
    if (input.year && record.eventYear !== input.year) return false;
    if (record.recordKind === "art" && !layers.art) return false;
    if (record.recordKind === "sidequest" && !layers.sidequests) return false;
    if (record.recordKind === "beacon" && !beaconLayerVisible(layers, record.markerKind)) return false;
    if (input.markerKinds && input.markerKinds.size > 0 && record.recordKind === "beacon") {
      if (!record.markerKind || !input.markerKinds.has(record.markerKind)) return false;
    }
    if (categories && categories.size > 0 && record.recordKind === "sidequest") {
      if (!record.category || !categories.has(record.category)) return false;
    }
    if (!q) return true;
    const haystack = `${record.title} ${record.artistName ?? ""} ${record.description} ${record.category ?? ""}`.toLowerCase();
    return haystack.includes(q);
  });
}

export function countByMarkerKind(records: PlayaMapRecord[]): Record<BeaconMarkerKind, number> {
  const counts: Record<BeaconMarkerKind, number> = { food: 0, get_weird: 0, do_good: 0, medical: 0, bike: 0, restroom: 0 };
  for (const record of records) {
    if (record.recordKind === "beacon" && record.markerKind) counts[record.markerKind] += 1;
  }
  return counts;
}

export function countByKind(records: PlayaMapRecord[]): Record<PlayaMapRecordKind, number> {
  return records.reduce(
    (acc, record) => {
      acc[record.recordKind] += 1;
      return acc;
    },
    { art: 0, sidequest: 0, beacon: 0 } as Record<PlayaMapRecordKind, number>,
  );
}

export function countByCategory(records: PlayaMapRecord[]): Partial<Record<QuestCategory, number>> {
  const counts: Partial<Record<QuestCategory, number>> = {};
  for (const record of records) {
    if (!record.category) continue;
    counts[record.category] = (counts[record.category] ?? 0) + 1;
  }
  return counts;
}
