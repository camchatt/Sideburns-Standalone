import { NEARBY_DEFAULT_RADIUS_METERS } from "@/features/location/config";
import type { Coordinates } from "@/features/location/types/coordinates";
import { distanceMeters } from "@/features/location/utils/distance";
import { hasPreciseCoordinates } from "@/features/location/utils/locationState";
import type { Sidequest } from "@/features/sidequests/types/sidequest";

export type NearbyLocatedSidequest = {
  sidequest: Sidequest;
  distanceMeters: number;
};

export type NearbyPartition = {
  located: NearbyLocatedSidequest[];
  approximate: Sidequest[];
  radiusMeters: number;
};

/**
 * Split sidequests into precise distance-ranked hits vs approximate / imprecise placements.
 */
export function partitionNearbySidequests(
  sidequests: Sidequest[],
  origin: Coordinates,
  radiusMeters = NEARBY_DEFAULT_RADIUS_METERS,
): NearbyPartition {
  const located: NearbyLocatedSidequest[] = [];
  const approximate: Sidequest[] = [];

  for (const sidequest of sidequests) {
    const precise = hasPreciseCoordinates(sidequest.location, sidequest.placementKind);
    if (!precise) {
      approximate.push(sidequest);
      continue;
    }
    const distance = distanceMeters(origin, sidequest.location);
    if (distance <= radiusMeters) {
      located.push({ sidequest, distanceMeters: distance });
    }
  }

  located.sort((a, b) => a.distanceMeters - b.distanceMeters);
  approximate.sort((a, b) => a.title.localeCompare(b.title));

  return { located, approximate, radiusMeters };
}

export function formatDistanceMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
