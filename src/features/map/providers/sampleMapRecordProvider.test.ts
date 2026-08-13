import { describe, expect, it } from "vitest";
import { createSampleMapRecordProvider } from "@/features/map/providers/sampleMapRecordProvider";

describe("createSampleMapRecordProvider", () => {
  it("serves the standalone 2025 Sidequester inventory by year", async () => {
    const records = await createSampleMapRecordProvider().list({ years: [2025] });
    const art = records.filter((record) => record.recordKind === "art");
    const beacons = records.filter((record) => record.recordKind === "beacon");
    const sidequests = records.filter((record) => record.recordKind === "sidequest");
    expect(art.length).toBeGreaterThan(250);
    expect(beacons).toHaveLength(18);
    expect(sidequests).toHaveLength(3);
    expect(records.every((record) => record.eventYear === 2025)).toBe(true);
  });

  it("hides 2025 art when listing only 2026", async () => {
    const records = await createSampleMapRecordProvider().list({ years: [2026] });
    expect(records.every((record) => record.eventYear === 2026)).toBe(true);
    expect(records.every((record) => record.recordKind !== "art")).toBe(true);
  });

  it("keeps the existing fictional 2026 samples available", async () => {
    const records = await createSampleMapRecordProvider().list({ years: [2026] });
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.eventYear === 2026)).toBe(true);
  });
});
