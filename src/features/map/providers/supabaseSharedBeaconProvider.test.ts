import { describe, expect, it, vi } from "vitest";
import { createCombinedMapRecordProvider, createSupabaseSharedBeaconProvider, mapSharedBeaconRow } from "@/features/map/providers/supabaseSharedBeaconProvider";
import type { MapRecordProvider, PlayaMapRecord } from "@/features/map/types/mapRecord";

const row = {
  id: "sq_local_shared",
  title: "Jon's beacon",
  description: "Shared in Winthrop",
  latitude: 42.377,
  longitude: -70.982,
  radius_meters: 30,
  category: "service",
  placement_kind: "exact",
  beacon_kind: "do_good",
  presenter: "Jon",
  reward: null,
  live_pin: false,
  test_area_id: "winthrop",
  created_at: "2026-08-03T20:00:00.000Z",
};

describe("shared beacon provider", () => {
  it("maps validated remote rows to shared map records", () => {
    expect(mapSharedBeaconRow(row)).toMatchObject({
      id: "sq_local_shared",
      origin: "shared",
      markerKind: "do_good",
      testAreaId: "winthrop",
      eventYear: 2026,
    });
  });

  it("preserves service beacon kinds for independent map filters", () => {
    expect(mapSharedBeaconRow({ ...row, beacon_kind: "bike" }).markerKind).toBe("bike");
    expect(mapSharedBeaconRow({ ...row, beacon_kind: "massage" }).markerKind).toBe("get_weird");
  });

  it("reads shared rows and merges them over packaged records", async () => {
    const order = vi.fn().mockResolvedValue({ data: [row], error: null });
    const is = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ is }));
    const client = { from: vi.fn(() => ({ select })) } as never;
    const shared = createSupabaseSharedBeaconProvider(client);
    const packaged: PlayaMapRecord = { ...mapSharedBeaconRow(row), title: "Old local title", origin: "sample" };
    const local: MapRecordProvider = { source: "sample", list: vi.fn().mockResolvedValue([packaged]) };

    const records = await createCombinedMapRecordProvider(local, shared).list();

    expect(records).toHaveLength(1);
    expect(records[0].title).toBe("Jon's beacon");
    expect(records[0].origin).toBe("shared");
  });

  it("keeps local catalog rows when the shared beacon fetch fails", async () => {
    const art: PlayaMapRecord = {
      id: "art_1",
      slug: "art_1",
      title: "Temple",
      description: "Art",
      location: { latitude: 40.7864, longitude: -119.2065 },
      placementKind: "exact",
      placementLabel: null,
      placementConfidence: 1,
      eventYear: 2025,
      heroImageUrl: null,
      artistName: null,
      radiusMeters: 30,
      detailUrl: null,
      recordKind: "art",
      category: null,
      origin: "sample",
    };
    const local: MapRecordProvider = { source: "sample", list: vi.fn().mockResolvedValue([art]) };
    const shared: MapRecordProvider = {
      source: "supabase",
      list: vi.fn().mockRejectedValue(new Error("shared_beacons missing")),
    };

    const records = await createCombinedMapRecordProvider(local, shared).list();
    expect(records).toEqual([art]);
  });
});
