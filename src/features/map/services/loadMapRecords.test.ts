import { describe, expect, it, vi } from "vitest";
import { loadMapRecords } from "@/features/map/services/loadMapRecords";
import { createSampleMapRecordProvider } from "@/features/map/providers/sampleMapRecordProvider";
import type { MapRecordCache, MapRecordProvider, MapRecordSnapshot } from "@/features/map/types/mapRecord";

describe("loadMapRecords", () => {
  it("caches successful live results", async () => {
    const sample = createSampleMapRecordProvider(); const records = await sample.list();
    const primary: MapRecordProvider = { source: "supabase", list: vi.fn(async () => records) };
    const write = vi.fn(); const cache: MapRecordCache = { read: vi.fn(async () => null), write };
    const result = await loadMapRecords({ primary, sample, cache });
    expect(result.source).toBe("live"); expect(write).toHaveBeenCalledOnce();
  });
  it("uses cached records after a remote failure", async () => {
    const sample = createSampleMapRecordProvider(); const records = await sample.list();
    const primary: MapRecordProvider = { source: "supabase", list: vi.fn(async () => { throw new Error("offline"); }) };
    const snapshot: MapRecordSnapshot = { key: "current", records, source: "supabase", fetchedAt: new Date().toISOString(), schemaVersion: 1 };
    const cache: MapRecordCache = { read: vi.fn(async () => snapshot), write: vi.fn() };
    const result = await loadMapRecords({ primary, sample, cache });
    expect(result.source).toBe("cache"); expect(result.records).toHaveLength(records.length);
  });

  it("prefers bundled sample over a stale cache missing Projects art", async () => {
    const sample = createSampleMapRecordProvider();
    const sampleRecords = await sample.list();
    const stale = sampleRecords.filter((record) => record.recordKind !== "art").slice(0, 6);
    const primary: MapRecordProvider = { source: "supabase", list: vi.fn(async () => { throw new Error("offline"); }) };
    const snapshot: MapRecordSnapshot = {
      key: "current",
      records: stale,
      source: "sample",
      fetchedAt: new Date().toISOString(),
      schemaVersion: 1,
    };
    const write = vi.fn();
    const cache: MapRecordCache = { read: vi.fn(async () => snapshot), write };
    const result = await loadMapRecords({ primary, sample, cache });
    expect(result.source).toBe("sample");
    expect(result.records.some((record) => record.recordKind === "art")).toBe(true);
    expect(write).toHaveBeenCalledOnce();
  });
});
