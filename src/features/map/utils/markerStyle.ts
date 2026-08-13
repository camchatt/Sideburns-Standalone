import type { QuestCategory } from "@/features/sidequests/types/sidequest";
import type { PlayaMapRecord } from "@/features/map/types/mapRecord";
import type { BeaconMarkerKind } from "@/features/map/types/mapRecord";

/** SIDEBURNS marker palette — distinct type colors for Sideburn / Food / Get Weird / Do Good. */
export const CATEGORY_MARKER_COLORS: Record<QuestCategory, string> = {
  art: "#c45c3e",
  camp: "#d4a017",
  performance: "#8b5cf6",
  service: "#2f6fed",
  explore: "#e2a23a",
  other: "#a83223",
};

/** Completable Sideburn pins — warm amber, distinct from art and beacon types. */
export const SIDEBURN_MARKER_COLOR = "#c45c26";
export const ART_MARKER_COLOR = "#a83223";
export const SELECTED_MARKER_COLOR = "#e2a23a";

export const BEACON_MARKER_COLORS: Record<BeaconMarkerKind, string> = {
  food: "#f07838",
  get_weird: "#a21caf",
  do_good: "#0f766e",
  medical: "#dc2626",
  bike: "#2563eb",
  restroom: "#0891b2",
};

export function markerColorForRecord(record: Pick<PlayaMapRecord, "recordKind" | "category" | "markerKind">): string {
  if (record.recordKind === "beacon" && record.markerKind) {
    return BEACON_MARKER_COLORS[record.markerKind];
  }
  if (record.recordKind === "art") return ART_MARKER_COLOR;
  if (record.recordKind === "sidequest") return SIDEBURN_MARKER_COLOR;
  if (record.category) return CATEGORY_MARKER_COLORS[record.category];
  return CATEGORY_MARKER_COLORS.other;
}
