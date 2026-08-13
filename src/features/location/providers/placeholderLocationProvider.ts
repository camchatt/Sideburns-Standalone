import type { Coordinates } from "@/features/location/types/coordinates";
import type {
  LocationPermissionState,
  LocationProvider,
  LocationReading,
  LocationWatchHandle,
} from "@/features/location/types/location";

function nowReading(
  partial: Partial<LocationReading> & Pick<LocationReading, "permission" | "source">,
): LocationReading {
  return {
    coordinates: partial.coordinates ?? null,
    timestamp: new Date().toISOString(),
    permission: partial.permission,
    accuracyMeters: partial.accuracyMeters ?? null,
    error: partial.error ?? null,
    source: partial.source,
  };
}

/** Placeholder location provider: supports manual simulation only. */
export function createPlaceholderLocationProvider(): LocationProvider {
  let simulated: Coordinates | null = null;
  const listeners = new Set<(reading: LocationReading) => void>();

  function emit(next: LocationReading) {
    for (const listener of listeners) listener(next);
  }

  return {
    async getCurrent() {
      if (simulated) {
        return nowReading({
          coordinates: simulated,
          permission: "granted",
          source: "simulated",
          accuracyMeters: simulated.accuracyMeters ?? 5,
        });
      }
      return nowReading({
        permission: typeof navigator !== "undefined" && "geolocation" in navigator ? "prompt" : "unsupported",
        source: "device",
        error: "Device GPS not wired in foundation shell",
      });
    },
    watch(onChange): LocationWatchHandle {
      listeners.add(onChange);
      void this.getCurrent().then((reading) => onChange(reading));
      return {
        stop() {
          listeners.delete(onChange);
        },
      };
    },
    async getPermissionState(): Promise<LocationPermissionState> {
      if (simulated) return "granted";
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "unsupported";
      return "prompt";
    },
    setSimulatedLocation(coordinates) {
      simulated = coordinates
        ? { ...coordinates, accuracyMeters: coordinates.accuracyMeters ?? 5 }
        : null;
      if (simulated) {
        emit(
          nowReading({
            coordinates: simulated,
            permission: "granted",
            source: "simulated",
            accuracyMeters: simulated.accuracyMeters ?? 5,
          }),
        );
      }
    },
  };
}
