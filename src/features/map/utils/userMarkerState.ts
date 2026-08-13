import type { LocationLifecycleState, LocationReading } from "@/features/location/types/location";

export function userMarkerLabel(
  state: LocationLifecycleState,
  source: LocationReading["source"],
): string {
  if (state === "simulated" || source === "simulated") return "Your simulated location";
  if (state === "stale") return "Your last known location";
  return "Your location";
}
