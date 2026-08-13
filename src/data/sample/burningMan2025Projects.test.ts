import { describe, expect, it } from "vitest";
import { BURNING_MAN_2025_ART_RECORDS } from "@/data/sample/burningMan2025Projects";

describe("BURNING_MAN_2025_ART_RECORDS", () => {
  it("maps mappable 2025 public placements as art records", () => {
    expect(BURNING_MAN_2025_ART_RECORDS.length).toBeGreaterThan(250);
    expect(BURNING_MAN_2025_ART_RECORDS.every((record) => record.eventYear === 2025)).toBe(true);
    expect(BURNING_MAN_2025_ART_RECORDS.every((record) => record.recordKind === "art")).toBe(true);
  });

  it("keeps unique ids and playa-bounded coordinates", () => {
    expect(new Set(BURNING_MAN_2025_ART_RECORDS.map((record) => record.id)).size).toBe(
      BURNING_MAN_2025_ART_RECORDS.length,
    );
    for (const record of BURNING_MAN_2025_ART_RECORDS) {
      expect(record.location.latitude).toBeGreaterThan(40.74);
      expect(record.location.latitude).toBeLessThan(40.82);
      expect(record.location.longitude).toBeGreaterThan(-119.25);
      expect(record.location.longitude).toBeLessThan(-119.16);
    }
  });
});
