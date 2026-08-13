import { describe, expect, it } from "vitest";
import {
  LOCATION_MAX_USABLE_ACCURACY_METERS,
  LOCATION_STALE_READING_MS,
} from "@/features/location/config";
import type { LocationReading } from "@/features/location/types/location";
import {
  deriveLocationState,
  hasPreciseCoordinates,
  isReadingUsableForProximity,
} from "@/features/location/utils/locationState";

function reading(partial: Partial<LocationReading> & Pick<LocationReading, "permission" | "source">): LocationReading {
  return {
    coordinates: partial.coordinates ?? null,
    timestamp: partial.timestamp ?? new Date().toISOString(),
    permission: partial.permission,
    accuracyMeters: partial.accuracyMeters ?? partial.coordinates?.accuracyMeters ?? null,
    error: partial.error ?? null,
    source: partial.source,
  };
}

describe("deriveLocationState", () => {
  it("reports unsupported and denied distinctly", () => {
    expect(
      deriveLocationState(reading({ permission: "unsupported", source: "device", error: "nope" })),
    ).toBe("unsupported");
    expect(
      deriveLocationState(reading({ permission: "denied", source: "device", error: "denied" })),
    ).toBe("denied");
  });

  it("reports insecure origins separately from unsupported devices", () => {
    expect(
      deriveLocationState(
        reading({
          permission: "unsupported",
          source: "device",
          error: "Location requires HTTPS or localhost",
        }),
      ),
    ).toBe("insecure");
  });

  it("reports prompt_required when not watching", () => {
    expect(deriveLocationState(null, { watching: false })).toBe("prompt_required");
    expect(
      deriveLocationState(reading({ permission: "prompt", source: "device" }), { watching: false }),
    ).toBe("prompt_required");
  });

  it("reports acquiring while watching without a fix", () => {
    expect(
      deriveLocationState(reading({ permission: "prompt", source: "device", error: "Acquiring…" }), {
        watching: true,
      }),
    ).toBe("acquiring");
  });

  it("reports unavailable from geo errors", () => {
    expect(
      deriveLocationState(
        reading({ permission: "granted", source: "device", error: "Location unavailable" }),
        { watching: true },
      ),
    ).toBe("unavailable");
  });

  it("reports inaccurate and stale for poor fixes", () => {
    const now = Date.UTC(2026, 7, 3, 12, 0, 0);
    expect(
      deriveLocationState(
        reading({
          permission: "granted",
          source: "device",
          coordinates: { latitude: 40.78, longitude: -119.2, accuracyMeters: LOCATION_MAX_USABLE_ACCURACY_METERS + 1 },
          accuracyMeters: LOCATION_MAX_USABLE_ACCURACY_METERS + 1,
          timestamp: new Date(now).toISOString(),
        }),
        { nowMs: now, watching: true },
      ),
    ).toBe("inaccurate");

    expect(
      deriveLocationState(
        reading({
          permission: "granted",
          source: "device",
          coordinates: { latitude: 40.78, longitude: -119.2, accuracyMeters: 10 },
          accuracyMeters: 10,
          timestamp: new Date(now - LOCATION_STALE_READING_MS - 1).toISOString(),
        }),
        { nowMs: now, watching: true },
      ),
    ).toBe("stale");
  });

  it("reports active and simulated", () => {
    const now = Date.UTC(2026, 7, 3, 12, 0, 0);
    expect(
      deriveLocationState(
        reading({
          permission: "granted",
          source: "device",
          coordinates: { latitude: 40.78, longitude: -119.2, accuracyMeters: 12 },
          accuracyMeters: 12,
          timestamp: new Date(now).toISOString(),
        }),
        { nowMs: now },
      ),
    ).toBe("active");

    expect(
      deriveLocationState(
        reading({
          permission: "granted",
          source: "simulated",
          coordinates: { latitude: 40.78, longitude: -119.2 },
          accuracyMeters: 5,
          timestamp: new Date(now).toISOString(),
        }),
        { nowMs: now },
      ),
    ).toBe("simulated");
  });
});

describe("isReadingUsableForProximity", () => {
  it("rejects inaccurate and stale readings", () => {
    const now = Date.UTC(2026, 7, 3, 12, 0, 0);
    expect(
      isReadingUsableForProximity(
        reading({
          permission: "granted",
          source: "device",
          coordinates: { latitude: 1, longitude: 2, accuracyMeters: 250 },
          accuracyMeters: 250,
          timestamp: new Date(now).toISOString(),
        }),
        now,
      ),
    ).toBe(false);

    expect(
      isReadingUsableForProximity(
        reading({
          permission: "granted",
          source: "device",
          coordinates: { latitude: 1, longitude: 2, accuracyMeters: 10 },
          accuracyMeters: 10,
          timestamp: new Date(now - LOCATION_STALE_READING_MS - 5_000).toISOString(),
        }),
        now,
      ),
    ).toBe(false);
  });

  it("accepts fresh accurate readings including simulated", () => {
    const now = Date.UTC(2026, 7, 3, 12, 0, 0);
    expect(
      isReadingUsableForProximity(
        reading({
          permission: "granted",
          source: "simulated",
          coordinates: { latitude: 40.78, longitude: -119.2, accuracyMeters: 5 },
          accuracyMeters: 5,
          timestamp: new Date(now).toISOString(),
        }),
        now,
      ),
    ).toBe(true);
  });
});

describe("hasPreciseCoordinates", () => {
  it("treats approximate placementKind as imprecise", () => {
    expect(hasPreciseCoordinates({ latitude: 40.7, longitude: -119.2 }, "approximate")).toBe(false);
    expect(hasPreciseCoordinates({ latitude: 40.7, longitude: -119.2 }, "exact")).toBe(true);
  });
});
