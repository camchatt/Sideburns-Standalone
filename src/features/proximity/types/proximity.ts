import type { Coordinates } from "@/features/location/types/coordinates";

export type ProximitySource = "gps" | "simulated" | "bluetooth";

export type ProximityPhase = "unknown" | "outside" | "enter" | "inside" | "exit";

export type ProximityState = {
  targetId: string;
  distanceMeters: number | null;
  phase: ProximityPhase;
  source: ProximitySource;
  updatedAt: string;
};

export type ProximityTarget = {
  id: string;
  location: Coordinates;
  radiusMeters: number;
};

/**
 * Common proximity boundary. GPS and simulated sources are in-scope for core UX.
 * Bluetooth may implement the same interface later; it must never be required.
 */
export interface ProximityProvider {
  evaluate(targets: ProximityTarget[], reading: Coordinates | null): Promise<ProximityState[]>;
  readonly source: ProximitySource;
}
