import type { Coordinates } from "@/features/location/types/coordinates";
import type { QuestCategory } from "@/features/sidequests/types/sidequest";

export type MapRecordListOptions = { years?: number[]; query?: string };

/** Art placements vs completable sidequests on the map. */
export type PlayaMapRecordKind = "art" | "sidequest" | "beacon";
export type BeaconMarkerKind = "food" | "get_weird" | "do_good" | "medical" | "bike" | "restroom";

export type PlayaMapRecord = {
  id: string;
  slug: string;
  title: string;
  description: string;
  location: Coordinates;
  placementKind: "exact" | "approximate";
  placementLabel: string | null;
  placementConfidence: number | null;
  eventYear: number;
  heroImageUrl: string | null;
  artistName: string | null;
  radiusMeters: number;
  detailUrl: string | null;
  /** Defaults to sidequest when omitted on older cached rows. */
  recordKind: PlayaMapRecordKind;
  /** Optional standalone field-service icon; never implies a completable sidequest. */
  markerKind?: BeaconMarkerKind | null;
  /** Present for sidequests; optional for art placements. */
  category: QuestCategory | null;
  origin?: "local" | "pack" | "sample" | "shared";
  presenter?: string | null;
  reward?: string | null;
  livePin?: boolean;
  testAreaId?: "black-rock-city" | "winthrop" | null;
  creatorId?: string | null;
  creatorDisplayName?: string | null;
  contentOrigin?: "infrastructure" | "user";
  /** ISO timestamp when known; used for user-generated post age. */
  createdAt?: string | null;
};

export interface MapRecordProvider {
  readonly source: "sample" | "supabase";
  list(options?: MapRecordListOptions): Promise<PlayaMapRecord[]>;
}

export type MapRecordSnapshot = {
  key: "current";
  records: PlayaMapRecord[];
  source: MapRecordProvider["source"];
  fetchedAt: string;
  schemaVersion: number;
};

export interface MapRecordCache {
  read(): Promise<MapRecordSnapshot | null>;
  write(snapshot: MapRecordSnapshot): Promise<void>;
}

export type LocalInteraction = { liked: boolean; saved: boolean; dismissed?: boolean; updatedAt: string };

export type LocalInteractionEntry = LocalInteraction & { recordId: string };

export interface LocalInteractionRepository {
  get(recordId: string): Promise<LocalInteraction>;
  toggleLike(recordId: string): Promise<LocalInteraction>;
  toggleSaved(recordId: string): Promise<LocalInteraction>;
  toggleDismissed(recordId: string): Promise<LocalInteraction>;
  listSaved(): Promise<LocalInteractionEntry[]>;
  listDismissed(): Promise<string[]>;
}
