import type { Coordinates } from "@/features/location/types/coordinates";
import { distanceMeters } from "@/features/location/utils/distance";
import type {
  ProximityProvider,
  ProximityState,
  ProximityTarget,
} from "@/features/proximity/types/proximity";

export function createGpsProximityProvider(): ProximityProvider {
  return {
    source: "gps",
    async evaluate(targets: ProximityTarget[], reading: Coordinates | null): Promise<ProximityState[]> {
      const updatedAt = new Date().toISOString();
      if (!reading) {
        return targets.map((target) => ({
          targetId: target.id,
          distanceMeters: null,
          phase: "unknown",
          source: "gps",
          updatedAt,
        }));
      }
      return targets.map((target) => {
        const distance = distanceMeters(reading, target.location);
        const phase = distance <= target.radiusMeters ? "inside" : "outside";
        return {
          targetId: target.id,
          distanceMeters: distance,
          phase,
          source: "gps" as const,
          updatedAt,
        };
      });
    },
  };
}
