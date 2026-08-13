import {
  LOCATION_MAX_USABLE_ACCURACY_METERS,
  LOCATION_STALE_READING_MS,
  PRECISE_LOCATION_MAX_ACCURACY_METERS,
} from "@/features/location/config";
import type {
  LocationLifecycleState,
  LocationReading,
} from "@/features/location/types/location";
import type { Coordinates } from "@/features/location/types/coordinates";

export type DeriveLocationStateOptions = {
  nowMs?: number;
  /** True while a foreground watch (or one-shot acquire) is intentionally running. */
  watching?: boolean;
};

export function isReadingFresh(
  reading: LocationReading,
  nowMs = Date.now(),
  staleMs = LOCATION_STALE_READING_MS,
): boolean {
  const age = nowMs - Date.parse(reading.timestamp);
  if (!Number.isFinite(age)) return false;
  return age <= staleMs;
}

export function isReadingAccurate(
  reading: LocationReading,
  maxAccuracyMeters = LOCATION_MAX_USABLE_ACCURACY_METERS,
): boolean {
  const accuracy = reading.accuracyMeters ?? reading.coordinates?.accuracyMeters;
  if (accuracy == null || !Number.isFinite(accuracy)) return true;
  return accuracy <= maxAccuracyMeters;
}

/** Proximity and Nearby distance ranking must ignore inaccurate or stale fixes. */
export function isReadingUsableForProximity(
  reading: LocationReading | null,
  nowMs = Date.now(),
): boolean {
  if (!reading?.coordinates) return false;
  if (reading.permission === "denied" || reading.permission === "unsupported") return false;
  if (!isReadingFresh(reading, nowMs)) return false;
  if (!isReadingAccurate(reading)) return false;
  return true;
}

export function deriveLocationState(
  reading: LocationReading | null,
  options: DeriveLocationStateOptions = {},
): LocationLifecycleState {
  const nowMs = options.nowMs ?? Date.now();
  const watching = options.watching ?? false;

  if (reading?.error?.toLowerCase().includes("https or localhost")) return "insecure";
  if (reading?.permission === "unsupported") return "unsupported";
  if (reading?.permission === "denied") return "denied";

  if (reading?.source === "simulated" && reading.coordinates) {
    return "simulated";
  }

  if (reading?.coordinates) {
    if (!isReadingFresh(reading, nowMs)) return "stale";
    if (!isReadingAccurate(reading)) return "inaccurate";
    return "active";
  }

  if (reading?.error) {
    const message = reading.error.toLowerCase();
    if (message.includes("unavailable") || message.includes("timed out") || message.includes("timeout")) {
      return "unavailable";
    }
  }

  if (watching) return "acquiring";

  if (reading?.permission === "prompt" || reading?.permission === "unknown" || !reading) {
    return "prompt_required";
  }

  if (reading.permission === "granted") return "acquiring";

  return "prompt_required";
}

export function locationStateLabel(state: LocationLifecycleState): string {
  switch (state) {
    case "unsupported":
      return "Unsupported";
    case "insecure":
      return "HTTPS required";
    case "prompt_required":
      return "Off — tap to enable";
    case "denied":
      return "Permission denied";
    case "unavailable":
      return "Unavailable";
    case "acquiring":
      return "Acquiring…";
    case "active":
      return "Active";
    case "inaccurate":
      return "Inaccurate";
    case "stale":
      return "Stale";
    case "simulated":
      return "Simulated";
  }
}

/** True when a sidequest / placement should be distance-ranked as precise. */
export function hasPreciseCoordinates(
  location: Coordinates,
  placementKind?: "exact" | "approximate" | null,
): boolean {
  if (placementKind === "approximate") return false;
  if (placementKind === "exact") return true;
  const accuracy = location.accuracyMeters;
  if (accuracy == null || !Number.isFinite(accuracy)) return true;
  return accuracy <= PRECISE_LOCATION_MAX_ACCURACY_METERS;
}
