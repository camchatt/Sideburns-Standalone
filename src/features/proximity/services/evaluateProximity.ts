import { isReadingUsableForProximity } from "@/features/location/utils/locationState";
import type { LocationReading } from "@/features/location/types/location";
import type {
  ProximityProvider,
  ProximitySource,
  ProximityState,
  ProximityTarget,
} from "@/features/proximity/types/proximity";

/**
 * Evaluate proximity only from usable foreground readings.
 * Inaccurate and stale fixes must not produce enter/inside/outside events.
 */
export async function evaluateProximityFromReading(
  provider: ProximityProvider,
  targets: ProximityTarget[],
  reading: LocationReading | null,
  nowMs = Date.now(),
): Promise<ProximityState[]> {
  if (!isReadingUsableForProximity(reading, nowMs) || !reading?.coordinates) {
    const updatedAt = new Date(nowMs).toISOString();
    const source: ProximitySource =
      reading?.source === "simulated" ? "simulated" : provider.source;
    return targets.map((target) => ({
      targetId: target.id,
      distanceMeters: null,
      phase: "unknown",
      source,
      updatedAt,
    }));
  }

  const states = await provider.evaluate(targets, reading.coordinates);
  if (reading.source === "simulated") {
    return states.map((state) => ({ ...state, source: "simulated" as const }));
  }
  return states;
}
