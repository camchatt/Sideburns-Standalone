import type { Coordinates } from "@/features/location/types/coordinates";

export type LocationPermissionState =
  | "prompt"
  | "granted"
  | "denied"
  | "unsupported"
  | "unknown";

/**
 * Distinct foreground location lifecycle / quality states for UI and proximity gating.
 * Never implies background tracking in a normal PWA.
 */
export type LocationLifecycleState =
  | "unsupported"
  | "insecure"
  | "prompt_required"
  | "denied"
  | "unavailable"
  | "acquiring"
  | "active"
  | "inaccurate"
  | "stale"
  | "simulated";

export type LocationReading = {
  coordinates: Coordinates | null;
  timestamp: string;
  permission: LocationPermissionState;
  accuracyMeters?: number | null;
  error?: string | null;
  source: "device" | "simulated";
};

export type LocationWatchHandle = {
  stop: () => void;
};

export interface LocationProvider {
  getCurrent(): Promise<LocationReading>;
  /** Starts geolocation only when called — callers must gate on explicit user opt-in. */
  watch(onChange: (reading: LocationReading) => void): LocationWatchHandle;
  getPermissionState(): Promise<LocationPermissionState>;
  setSimulatedLocation(coordinates: Coordinates | null): void;
}
