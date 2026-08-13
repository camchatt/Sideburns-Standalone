import { distanceMeters } from "@/features/location/utils/distance";
import {
  deriveLocationState,
  isReadingUsableForProximity,
} from "@/features/location/utils/locationState";
import type { LocationReading } from "@/features/location/types/location";
import type { Sidequest } from "@/features/sidequests/types/sidequest";

export type CompletionBlockReason =
  | "proximity_required"
  | "location_denied"
  | "location_inaccurate"
  | "location_stale"
  | "location_unavailable"
  | "location_unsupported"
  | "location_insecure"
  | "location_prompt_required"
  | "location_acquiring"
  | "outside_radius";

export type CompletionGateResult =
  | { allowed: true; distanceMeters: number | null }
  | { allowed: false; reason: CompletionBlockReason; distanceMeters: number | null; message: string };

export class CompletionGateError extends Error {
  readonly code = "completion_gate_blocked" as const;
  readonly reason: CompletionBlockReason;
  readonly distanceMeters: number | null;

  constructor(result: Extract<CompletionGateResult, { allowed: false }>) {
    super(result.message);
    this.name = "CompletionGateError";
    this.reason = result.reason;
    this.distanceMeters = result.distanceMeters;
  }
}

export function evaluateCompletionGate(
  sidequest: Sidequest,
  reading: LocationReading | null,
  nowMs = Date.now(),
): CompletionGateResult {
  if (sidequest.completionRule !== "proximity") {
    return { allowed: true, distanceMeters: null };
  }

  const lifecycle = deriveLocationState(reading, { nowMs, watching: Boolean(reading) });

  if (!reading?.coordinates) {
    const reason = mapLifecycleToBlockReason(lifecycle);
    return {
      allowed: false,
      reason,
      distanceMeters: null,
      message: completionBlockMessage(reason),
    };
  }

  if (!isReadingUsableForProximity(reading, nowMs)) {
    const reason =
      lifecycle === "denied" ||
      lifecycle === "inaccurate" ||
      lifecycle === "stale" ||
      lifecycle === "unavailable" ||
      lifecycle === "unsupported" ||
      lifecycle === "insecure" ||
      lifecycle === "prompt_required" ||
      lifecycle === "acquiring"
        ? mapLifecycleToBlockReason(lifecycle)
        : "proximity_required";
    return {
      allowed: false,
      reason,
      distanceMeters: null,
      message: completionBlockMessage(reason),
    };
  }

  const distance = distanceMeters(reading.coordinates, sidequest.location);
  if (distance > sidequest.radiusMeters) {
    return {
      allowed: false,
      reason: "outside_radius",
      distanceMeters: distance,
      message: `Move within ${Math.round(sidequest.radiusMeters)} m to complete this sidequest (currently ~${Math.round(distance)} m away).`,
    };
  }

  return { allowed: true, distanceMeters: distance };
}

function mapLifecycleToBlockReason(
  lifecycle: ReturnType<typeof deriveLocationState>,
): CompletionBlockReason {
  switch (lifecycle) {
    case "denied":
      return "location_denied";
    case "inaccurate":
      return "location_inaccurate";
    case "stale":
      return "location_stale";
    case "unavailable":
      return "location_unavailable";
    case "unsupported":
      return "location_unsupported";
    case "insecure":
      return "location_insecure";
    case "acquiring":
      return "location_acquiring";
    case "prompt_required":
      return "location_prompt_required";
    default:
      return "proximity_required";
  }
}

export function completionBlockMessage(reason: CompletionBlockReason): string {
  switch (reason) {
    case "location_denied":
      return "Location permission is denied. Enable GPS or choose a sidequest that does not require proximity.";
    case "location_inaccurate":
      return "GPS accuracy is too low to verify proximity. Wait for a better fix, then retry.";
    case "location_stale":
      return "GPS reading is stale. Wait for a fresh fix, then retry.";
    case "location_unavailable":
      return "GPS is unavailable right now. Retry when a fix is available.";
    case "location_unsupported":
      return "This device does not support geolocation required for proximity completion.";
    case "location_insecure":
      return "Open SIDEBURNS on HTTPS or localhost to use location for proximity completion.";
    case "location_prompt_required":
      return "Enable foreground location to complete this proximity-gated sidequest.";
    case "location_acquiring":
      return "Still acquiring GPS. Wait for an active fix, then retry.";
    case "outside_radius":
      return "You are outside the quest radius.";
    case "proximity_required":
      return "A usable GPS fix is required to complete this sidequest.";
  }
}

/** Brief map-panel flash copy — keeps missing location distinct from “outside range”. */
export function trackingFlashMessage(reason: CompletionBlockReason): string {
  switch (reason) {
    case "outside_radius":
      return "Don't cheat. Go find it!";
    case "location_denied":
    case "location_prompt_required":
      return "Enable location access to check if you're at this beacon.";
    case "location_acquiring":
    case "location_unavailable":
    case "location_stale":
    case "location_inaccurate":
    case "proximity_required":
      return "We can't find your location yet. Try again in a moment.";
    case "location_unsupported":
      return "This device cannot share location for beacon checks.";
    case "location_insecure":
      return "Open SIDEBURNS on HTTPS or localhost to use location.";
  }
}
