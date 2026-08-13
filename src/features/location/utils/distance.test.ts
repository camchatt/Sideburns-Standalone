import { describe, expect, it } from "vitest";
import { distanceMeters } from "@/features/location/utils/distance";

describe("distanceMeters", () => {
  it("returns ~0 for identical coordinates", () => {
    const point = { latitude: 40.7864, longitude: -119.2065 };
    expect(distanceMeters(point, point)).toBeLessThan(0.01);
  });

  it("returns a positive distance for distinct playa-ish points", () => {
    const a = { latitude: 40.7864, longitude: -119.2065 };
    const b = { latitude: 40.7829, longitude: -119.1988 };
    const meters = distanceMeters(a, b);
    expect(meters).toBeGreaterThan(500);
    expect(meters).toBeLessThan(5000);
  });

  it("is symmetric", () => {
    const a = { latitude: 40.7864, longitude: -119.2065 };
    const b = { latitude: 40.7901, longitude: -119.2112 };
    expect(Math.abs(distanceMeters(a, b) - distanceMeters(b, a))).toBeLessThan(0.01);
  });
});
