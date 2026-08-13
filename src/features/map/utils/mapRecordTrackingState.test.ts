import { describe, expect, it } from "vitest";
import { deriveMapRecordTrackingState } from "@/features/map/utils/mapRecordTrackingState";

describe("deriveMapRecordTrackingState", () => {
  it("maps progress phases onto available / tracked / in_range / completed", () => {
    expect(deriveMapRecordTrackingState({ phase: null })).toBe("available");
    expect(deriveMapRecordTrackingState({ phase: "saved" })).toBe("available");
    expect(deriveMapRecordTrackingState({ phase: "in_progress" })).toBe("tracked");
    expect(deriveMapRecordTrackingState({ phase: "in_progress", inRange: true })).toBe("in_range");
    expect(deriveMapRecordTrackingState({ phase: "in_progress", inRange: false })).toBe("tracked");
    expect(deriveMapRecordTrackingState({ phase: "completed", inRange: true })).toBe("completed");
  });
});
