import { LOCATION_GEO_OPTIONS } from "@/features/location/config";
import type { Coordinates } from "@/features/location/types/coordinates";
import type {
  LocationPermissionState,
  LocationProvider,
  LocationReading,
  LocationWatchHandle,
} from "@/features/location/types/location";

function nowIso(): string {
  return new Date().toISOString();
}

function reading(
  partial: Partial<LocationReading> & Pick<LocationReading, "permission" | "source">,
): LocationReading {
  return {
    coordinates: partial.coordinates ?? null,
    timestamp: partial.timestamp ?? nowIso(),
    permission: partial.permission,
    accuracyMeters: partial.accuracyMeters ?? partial.coordinates?.accuracyMeters ?? null,
    error: partial.error ?? null,
    source: partial.source,
  };
}

function coordinatesFromPosition(position: GeolocationPosition): Coordinates {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy,
    altitudeMeters: position.coords.altitude,
  };
}

function mapGeoError(error: GeolocationPositionError): {
  permission: LocationPermissionState;
  message: string;
} {
  if (error.code === error.PERMISSION_DENIED) {
    return { permission: "denied", message: "Location permission denied" };
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return { permission: "granted", message: "Location unavailable" };
  }
  if (error.code === error.TIMEOUT) {
    return { permission: "granted", message: "Location timed out" };
  }
  return { permission: "unknown", message: error.message || "Location error" };
}

function hasGeolocation(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.geolocation !== "undefined" &&
    typeof navigator.geolocation.getCurrentPosition === "function" &&
    typeof navigator.geolocation.watchPosition === "function"
  );
}

function isLocationSecureContext(): boolean {
  if (typeof window === "undefined") return true;
  // Browsers treat localhost as trustworthy even over HTTP. An undefined value
  // is tolerated for test environments and older webviews.
  return window.isSecureContext !== false;
}

function secureContextReading(): LocationReading {
  return reading({
    permission: "unsupported",
    source: "device",
    error: "Location requires HTTPS or localhost",
  });
}

async function queryPermission(): Promise<LocationPermissionState> {
  if (!hasGeolocation()) return "unsupported";
  if (!("permissions" in navigator) || !navigator.permissions?.query) return "prompt";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state === "granted") return "granted";
    if (status.state === "denied") return "denied";
    return "prompt";
  } catch {
    return "prompt";
  }
}

/**
 * Browser GPS location provider with optional simulated override for prototypes.
 * Uses a single shared `watchPosition` while any subscriber is active (battery-friendly).
 * Callers must only subscribe after an explicit user opt-in; this provider does not
 * request permission until `getCurrent` / `watch` is invoked.
 */
export function createBrowserLocationProvider(): LocationProvider {
  let simulated: Coordinates | null = null;
  const listeners = new Set<(next: LocationReading) => void>();
  let watchId: number | null = null;
  let lastDeviceReading: LocationReading | null = null;

  function emit(next: LocationReading) {
    if (next.source === "device") lastDeviceReading = next;
    for (const listener of listeners) listener(next);
  }

  function simulatedReading(): LocationReading {
    return reading({
      coordinates: simulated,
      permission: "granted",
      source: "simulated",
      accuracyMeters: simulated?.accuracyMeters ?? 5,
    });
  }

  function startSharedWatch() {
    if (watchId != null || simulated || !hasGeolocation() || !isLocationSecureContext()) return;
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (simulated) return;
        const coordinates = coordinatesFromPosition(position);
        emit(
          reading({
            coordinates,
            permission: "granted",
            source: "device",
            accuracyMeters: coordinates.accuracyMeters,
            timestamp: new Date(position.timestamp).toISOString(),
          }),
        );
      },
      (error) => {
        if (simulated) return;
        const mapped = mapGeoError(error);
        emit(
          reading({
            permission: mapped.permission,
            source: "device",
            error: mapped.message,
          }),
        );
      },
      LOCATION_GEO_OPTIONS,
    );
  }

  function stopSharedWatch() {
    if (watchId == null) return;
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
    watchId = null;
  }

  return {
    async getCurrent() {
      if (simulated) return simulatedReading();
      if (!isLocationSecureContext()) return secureContextReading();
      if (!hasGeolocation()) {
        return reading({
          permission: "unsupported",
          source: "device",
          error: "Geolocation unsupported",
        });
      }
      const permission = await queryPermission();
      return await new Promise<LocationReading>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const coordinates = coordinatesFromPosition(position);
            resolve(
              reading({
                coordinates,
                permission: "granted",
                source: "device",
                accuracyMeters: coordinates.accuracyMeters,
                timestamp: new Date(position.timestamp).toISOString(),
              }),
            );
          },
          (error) => {
            const mapped = mapGeoError(error);
            resolve(
              reading({
                permission: mapped.permission === "denied" ? "denied" : permission,
                source: "device",
                error: mapped.message,
              }),
            );
          },
          LOCATION_GEO_OPTIONS,
        );
      });
    },

    watch(onChange): LocationWatchHandle {
      listeners.add(onChange);

      if (simulated) {
        onChange(simulatedReading());
      } else if (!isLocationSecureContext()) {
        onChange(secureContextReading());
      } else if (!hasGeolocation()) {
        onChange(
          reading({
            permission: "unsupported",
            source: "device",
            error: "Geolocation unsupported",
          }),
        );
      } else {
        onChange(
          lastDeviceReading ??
            reading({
              permission: "prompt",
              source: "device",
              error: "Acquiring location…",
            }),
        );
        startSharedWatch();
      }

      return {
        stop() {
          listeners.delete(onChange);
          if (listeners.size === 0) stopSharedWatch();
        },
      };
    },

    async getPermissionState() {
      if (simulated) return "granted";
      if (!isLocationSecureContext()) return "unsupported";
      return queryPermission();
    },

    setSimulatedLocation(coordinates) {
      simulated = coordinates
        ? {
            ...coordinates,
            accuracyMeters: coordinates.accuracyMeters ?? 5,
          }
        : null;
      if (simulated) {
        stopSharedWatch();
        emit(simulatedReading());
        return;
      }
      if (listeners.size > 0) {
        emit(
          reading({
            permission: "prompt",
            source: "device",
            error: "Acquiring location…",
          }),
        );
        startSharedWatch();
      }
    },
  };
}
