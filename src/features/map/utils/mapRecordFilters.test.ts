import { describe, expect, it } from "vitest";
import type { PlayaMapRecord } from "@/features/map/types/mapRecord";
import { filterMapRecords } from "@/features/map/utils/mapRecordFilters";
import { markerColorForRecord, SIDEBURN_MARKER_COLOR, BEACON_MARKER_COLORS, ART_MARKER_COLOR } from "@/features/map/utils/markerStyle";

const records: PlayaMapRecord[] = [
  {
    id: "sq_1",
    slug: "sq_1",
    title: "Lantern",
    description: "night art walk",
    location: { latitude: 40.78, longitude: -119.2 },
    placementKind: "exact",
    placementLabel: null,
    placementConfidence: 1,
    eventYear: 2026,
    heroImageUrl: null,
    artistName: null,
    radiusMeters: 30,
    detailUrl: null,
    recordKind: "sidequest",
    category: "art",
  },
  {
    id: "art_1",
    slug: "art_1",
    title: "Temple",
    description: "installation",
    location: { latitude: 40.781, longitude: -119.21 },
    placementKind: "exact",
    placementLabel: null,
    placementConfidence: 1,
    eventYear: 2025,
    heroImageUrl: null,
    artistName: "Anon",
    radiusMeters: 30,
    detailUrl: null,
    recordKind: "art",
    category: null,
  },
  {
    id: "sq_2",
    slug: "sq_2",
    title: "Bike help",
    description: "service",
    location: { latitude: 40.782, longitude: -119.205 },
    placementKind: "approximate",
    placementLabel: "Approx",
    placementConfidence: 0.4,
    eventYear: 2026,
    heroImageUrl: null,
    artistName: null,
    radiusMeters: 40,
    detailUrl: null,
    recordKind: "sidequest",
    category: "service",
  },
  {
    id: "beacon_1",
    slug: "beacon_1",
    title: "Costume swap",
    description: "get weird",
    location: { latitude: 40.783, longitude: -119.204 },
    placementKind: "exact",
    placementLabel: "3:00 plaza",
    placementConfidence: 0.9,
    eventYear: 2025,
    heroImageUrl: null,
    artistName: null,
    radiusMeters: 30,
    detailUrl: null,
    recordKind: "beacon",
    markerKind: "get_weird",
    category: "service",
  },
  {
    id: "service_1", slug: "service_1", title: "Bike shop", description: "repairs",
    location: { latitude: 40.784, longitude: -119.204 }, placementKind: "exact", placementLabel: null,
    placementConfidence: 1, eventYear: 2026, heroImageUrl: null, artistName: null, radiusMeters: 30,
    detailUrl: null, recordKind: "beacon", markerKind: "bike", category: "service",
  },
];

describe("mapRecordFilters", () => {
  it("filters by year, layer, category, and query", () => {
    const filtered = filterMapRecords({
      records,
      year: 2026,
      layers: { art: false, sidequests: true, food: true, getWeird: true, doGood: true, medical: true, bike: true, restroom: true },
      categories: new Set(["art"]),
      query: "lantern",
    });
    expect(filtered.map((row) => row.id)).toEqual(["sq_1"]);
  });

  it("hides sideburns when the layer is off", () => {
    const filtered = filterMapRecords({
      records,
      layers: { art: true, sidequests: false, food: true, getWeird: true, doGood: true, medical: true, bike: true, restroom: true },
    });
    expect(filtered.map((row) => row.id)).toEqual(["art_1", "beacon_1", "service_1"]);
  });

  it("hides get-weird beacons when their layer is off", () => {
    const filtered = filterMapRecords({
      records,
      layers: { art: true, sidequests: true, food: true, getWeird: false, doGood: true, medical: true, bike: true, restroom: true },
    });
    expect(filtered.map((row) => row.id)).not.toContain("beacon_1");
  });

  it("filters food / get weird / do good independently", () => {
    expect(
      filterMapRecords({
        records,
        layers: { art: true, sidequests: true, food: true, getWeird: false, doGood: true, medical: true, bike: true, restroom: true },
      }).map((row) => row.id),
    ).toEqual(["sq_1", "art_1", "sq_2", "service_1"]);
    expect(
      filterMapRecords({ records, markerKinds: new Set(["get_weird"]) }).map((row) => row.id),
    ).toEqual(["sq_1", "art_1", "sq_2", "beacon_1"]);
  });

  it("filters service types independently from sideburn types", () => {
    const filtered = filterMapRecords({
      records,
      layers: { art: true, sidequests: true, food: true, getWeird: true, doGood: true, medical: true, bike: false, restroom: true },
    });
    expect(filtered.map((row) => row.id)).not.toContain("service_1");
    expect(filtered.map((row) => row.id)).toContain("beacon_1");
  });
});

describe("markerStyle", () => {
  it("uses type colors for sideburns, art, and beacons", () => {
    expect(markerColorForRecord(records[0])).toBe(SIDEBURN_MARKER_COLOR);
    expect(markerColorForRecord(records[1])).toBe(ART_MARKER_COLOR);
    expect(markerColorForRecord(records[2])).toBe(SIDEBURN_MARKER_COLOR);
    expect(markerColorForRecord(records[3])).toBe(BEACON_MARKER_COLORS.get_weird);
  });
});
