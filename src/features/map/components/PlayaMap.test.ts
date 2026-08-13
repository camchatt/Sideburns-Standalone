import { describe, expect, it } from "vitest";
import { userMarkerLabel } from "@/features/map/utils/userMarkerState";

describe("user location marker", () => {
  it("labels real, stale, and simulated locations honestly", () => {
    expect(userMarkerLabel("active", "device")).toBe("Your location");
    expect(userMarkerLabel("stale", "device")).toBe("Your last known location");
    expect(userMarkerLabel("simulated", "simulated")).toBe("Your simulated location");
  });
});
