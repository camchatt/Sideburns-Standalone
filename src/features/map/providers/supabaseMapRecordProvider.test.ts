import { describe, expect, it } from "vitest";
import { mapSupabaseRow } from "@/features/map/providers/supabaseMapRecordProvider";

describe("mapSupabaseRow", () => {
  it("maps a valid public placement into the SIDEBURNS domain", () => {
    const record = mapSupabaseRow({ id: "p1", slug: "temple", title: "Temple", event_year: 2026, description: null, latitude: 40.78, longitude: -119.2, location_string: "12:00 & 2500'", location_confidence: 0.95 });
    expect(record).toMatchObject({
      id: "p1",
      title: "Temple",
      eventYear: 2026,
      placementKind: "exact",
      detailUrl: null,
      recordKind: "art",
      category: null,
    });
  });
  it("derives approximate coordinates from clock and distance", () => {
    const record = mapSupabaseRow({ id: "p2", slug: "clock-art", title: "Clock Art", event_year: 2026, clock_hour: 3, clock_minute: 30, distance_feet: 3000 });
    expect(record.placementKind).toBe("approximate");
    expect(record.location.latitude).toBeGreaterThan(40.7);
  });
  it("rejects invalid or unmappable records", () => {
    expect(() => mapSupabaseRow({ id: "bad", slug: "bad", title: "Bad", event_year: 2026, latitude: 200, longitude: 1 })).toThrow();
    expect(() => mapSupabaseRow({ id: "bad2", slug: "bad2", title: "Bad", event_year: 2026 })).toThrow(/no usable coordinates/);
  });
});
