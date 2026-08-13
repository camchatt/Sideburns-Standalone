import { describe, expect, it } from "vitest";
import {
  SIDEQUESTER_2025_RECORDS,
  SIDEQUESTER_2025_SIDEQUESTS,
} from "@/data/sample/sidequester2025";

describe("SIDEQUESTER_2025_RECORDS", () => {
  it("contains the complete standalone 2025 beacon and sidequest inventory", () => {
    expect(SIDEQUESTER_2025_RECORDS).toHaveLength(21);
    expect(SIDEQUESTER_2025_RECORDS.every((record) => record.eventYear === 2025)).toBe(true);
    expect(SIDEQUESTER_2025_RECORDS.filter((record) => record.recordKind === "sidequest")).toHaveLength(3);
    expect(SIDEQUESTER_2025_RECORDS.filter((record) => record.markerKind === "food")).toHaveLength(5);
    expect(SIDEQUESTER_2025_RECORDS.filter((record) => record.markerKind === "get_weird")).toHaveLength(7);
    expect(SIDEQUESTER_2025_RECORDS.filter((record) => record.markerKind === "do_good")).toHaveLength(6);
    expect(SIDEQUESTER_2025_RECORDS.filter((record) => record.recordKind === "sidequest")).toHaveLength(3);
  });

  it("uses unique SIDEBURNS-owned IDs and bounded coordinates", () => {
    expect(new Set(SIDEQUESTER_2025_RECORDS.map((record) => record.id)).size).toBe(21);
    for (const record of SIDEQUESTER_2025_RECORDS) {
      expect(record.id).toMatch(/^bm2025_/);
      expect(record.location.latitude).toBeGreaterThan(40.74);
      expect(record.location.latitude).toBeLessThan(40.82);
      expect(record.location.longitude).toBeGreaterThan(-119.25);
      expect(record.location.longitude).toBeLessThan(-119.16);
    }
  });

  it("exposes only Sideburn records to the proximity lifecycle", () => {
    expect(SIDEQUESTER_2025_SIDEQUESTS).toHaveLength(3);
    expect(SIDEQUESTER_2025_SIDEQUESTS.every((quest) => quest.completionRule === "proximity")).toBe(true);
    expect(SIDEQUESTER_2025_SIDEQUESTS.map((quest) => quest.id)).toEqual(
      SIDEQUESTER_2025_RECORDS
        .filter((record) => record.recordKind === "sidequest")
        .map((record) => record.id),
    );
  });
});
