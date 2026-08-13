import type { BeaconMarkerKind } from "@/features/map/types/mapRecord";

/** User-creatable map pin types. Sideburn is completable; others are beacons. */
export type CreatableBeaconKind = "sideburn" | "food" | "get_weird" | "do_good";

export const CREATABLE_BEACON_KINDS: readonly CreatableBeaconKind[] = [
  "sideburn",
  "food",
  "get_weird",
  "do_good",
] as const;

export const BEACON_MARKER_KINDS: readonly BeaconMarkerKind[] = [
  "food",
  "get_weird",
  "do_good",
  "medical",
  "bike",
  "restroom",
] as const;

const LABELS: Record<"sideburn" | BeaconMarkerKind, string> = {
  sideburn: "Sideburn",
  food: "Food",
  get_weird: "Get Weird",
  do_good: "Do Good",
  medical: "Med Tent",
  bike: "Bike Shop",
  restroom: "Restrooms",
};

/** Legacy service kinds from earlier prototypes — remapped on read. */
const LEGACY_BEACON_KIND_MAP: Record<string, BeaconMarkerKind> = {
  massage: "get_weird",
};

export function beaconKindLabel(kind: CreatableBeaconKind | BeaconMarkerKind | "sidequest" | null | undefined): string {
  if (!kind || kind === "sidequest") return LABELS.sideburn;
  if (kind in LABELS) return LABELS[kind as CreatableBeaconKind];
  return String(kind);
}

export function normalizeBeaconKind(raw: string | null | undefined): BeaconMarkerKind | null {
  if (!raw) return null;
  if (isBeaconMarkerKind(raw)) return raw;
  return LEGACY_BEACON_KIND_MAP[raw] ?? null;
}

export function isBeaconMarkerKind(value: string): value is BeaconMarkerKind {
  return value === "food" || value === "get_weird" || value === "do_good" || value === "medical" || value === "bike" || value === "restroom";
}
