import { describe, expect, it } from "vitest";
import { SAMPLE_SIDEQUESTS } from "@/data/sample/sidequests";
import { partitionNearbySidequests } from "@/features/sidequests/utils/nearbySidequests";

describe("partitionNearbySidequests", () => {
  const origin = { latitude: 40.7864, longitude: -119.2065 };

  it("orders precise sidequests by distance and separates approximate", () => {
    const partition = partitionNearbySidequests(SAMPLE_SIDEQUESTS, origin, 5_000);
    expect(partition.approximate.some((quest) => quest.id === "sq_sample_rumor_camp")).toBe(true);
    expect(partition.located.every((row) => row.sidequest.placementKind !== "approximate")).toBe(true);
    expect(partition.located[0]?.sidequest.id).toBe("sq_sample_lantern_grove");
    for (let i = 1; i < partition.located.length; i += 1) {
      expect(partition.located[i]!.distanceMeters).toBeGreaterThanOrEqual(
        partition.located[i - 1]!.distanceMeters,
      );
    }
  });

  it("returns empty located results when nothing is in range", () => {
    const farAway = { latitude: 0, longitude: 0 };
    const partition = partitionNearbySidequests(SAMPLE_SIDEQUESTS, farAway, 1);
    expect(partition.located).toHaveLength(0);
    expect(partition.approximate.length).toBeGreaterThan(0);
  });
});
