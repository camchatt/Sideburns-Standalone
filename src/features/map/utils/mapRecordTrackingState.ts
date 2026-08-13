import type { SidequestProgressPhase } from "@/features/sidequests/types/sidequest";

/**
 * Shared visual / UX state for a map record panel, marker, and tracking controls.
 * Panel, pin, and indicators must agree on one of these four values.
 */
export type MapRecordTrackingState = "available" | "tracked" | "in_range" | "completed";

export function deriveMapRecordTrackingState(input: {
  phase: SidequestProgressPhase | null | undefined;
  /** True when the user has a usable fix inside the beacon radius. */
  inRange?: boolean;
}): MapRecordTrackingState {
  if (input.phase === "completed") return "completed";
  if (input.phase === "in_progress") {
    return input.inRange ? "in_range" : "tracked";
  }
  return "available";
}
