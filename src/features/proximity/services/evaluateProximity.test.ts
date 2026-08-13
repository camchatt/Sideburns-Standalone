import { describe, expect, it } from "vitest";
import { createGpsProximityProvider } from "@/features/proximity/providers/gpsProximityProvider";
import { evaluateProximityFromReading } from "@/features/proximity/services/evaluateProximity";
import type { LocationReading } from "@/features/location/types/location";
import { getLocationTestPreset } from "@/features/location/config/locationTestPresets";

const target = {
  id: "sq_1",
  location: { latitude: 40.7864, longitude: -119.2065 },
  radiusMeters: 50,
};

describe("evaluateProximityFromReading", () => {
  const provider = createGpsProximityProvider();

  it("does not trigger proximity from inaccurate readings", async () => {
    const reading: LocationReading = {
      coordinates: { latitude: 40.7864, longitude: -119.2065, accuracyMeters: 300 },
      accuracyMeters: 300,
      timestamp: new Date().toISOString(),
      permission: "granted",
      source: "device",
    };
    const states = await evaluateProximityFromReading(provider, [target], reading);
    expect(states[0]?.phase).toBe("unknown");
    expect(states[0]?.distanceMeters).toBeNull();
  });

  it("does not trigger proximity from stale readings", async () => {
    const reading: LocationReading = {
      coordinates: { latitude: 40.7864, longitude: -119.2065, accuracyMeters: 10 },
      accuracyMeters: 10,
      timestamp: new Date(Date.now() - 120_000).toISOString(),
      permission: "granted",
      source: "device",
    };
    const states = await evaluateProximityFromReading(provider, [target], reading);
    expect(states[0]?.phase).toBe("unknown");
  });

  it("evaluates inside/outside for usable readings", async () => {
    const reading: LocationReading = {
      coordinates: { latitude: 40.7864, longitude: -119.2065, accuracyMeters: 8 },
      accuracyMeters: 8,
      timestamp: new Date().toISOString(),
      permission: "granted",
      source: "device",
    };
    const states = await evaluateProximityFromReading(provider, [target], reading);
    expect(states[0]?.phase).toBe("inside");
    expect(states[0]?.distanceMeters).toBeLessThan(1);
  });

  it("uses the Black Rock City preset as simulated proximity", async () => {
    const coordinates = getLocationTestPreset("black-rock-city").coordinates;
    const reading: LocationReading = {
      coordinates,
      accuracyMeters: coordinates.accuracyMeters,
      timestamp: new Date().toISOString(),
      permission: "granted",
      source: "simulated",
    };

    const states = await evaluateProximityFromReading(provider, [target], reading);
    expect(states[0]).toMatchObject({ phase: "inside", source: "simulated" });
  });
});
