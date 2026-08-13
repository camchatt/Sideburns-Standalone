import { describe, expect, it } from "vitest";
import { SAMPLE_SIDEQUESTS } from "@/data/sample/sidequests";
import {
  mergeMapRecordsWithLocalSidequests,
  sidequestToMapRecord,
} from "@/features/map/services/loadMapRecordsWithLocalSidequests";
import type { PlayaMapRecord } from "@/features/map/types/mapRecord";

describe("loadMapRecordsWithLocalSidequests helpers", () => {
  it("maps a sidequest onto a PlayaMapRecord with category and kind", () => {
    const record = sidequestToMapRecord(SAMPLE_SIDEQUESTS[0]);
    expect(record.slug).toBe(SAMPLE_SIDEQUESTS[0].id);
    expect(record.placementKind).toBe("exact");
    expect(record.recordKind).toBe("sidequest");
    expect(record.category).toBe("art");
  });

  it("preserves approximate placementKind from sidequests", () => {
    const approx = SAMPLE_SIDEQUESTS.find((quest) => quest.placementKind === "approximate");
    expect(approx).toBeTruthy();
    expect(sidequestToMapRecord(approx!).placementKind).toBe("approximate");
  });

  it("maps a user-created field beacon to its named marker family", () => {
    const record = sidequestToMapRecord({ ...SAMPLE_SIDEQUESTS[0], id: "sq_local_food", origin: "local", beaconKind: "food" });
    expect(record.recordKind).toBe("beacon");
    expect(record.markerKind).toBe("food");
  });

  it("merges pack and local sidequests onto catalog records", () => {
    const pack: PlayaMapRecord[] = [
      {
        id: "pack_1",
        slug: "pack_1",
        title: "Pack",
        description: "",
        location: { latitude: 40.78, longitude: -119.2 },
        placementKind: "exact",
        placementLabel: null,
        placementConfidence: 1,
        eventYear: 2026,
        heroImageUrl: null,
        artistName: null,
        radiusMeters: 20,
        detailUrl: null,
        recordKind: "art",
        category: null,
      },
    ];
    const sidequests = [
      {
        ...SAMPLE_SIDEQUESTS[0],
        id: "sq_local_abc",
        title: "Local create",
        syncStatus: "pending" as const,
        origin: "local" as const,
      },
      {
        ...SAMPLE_SIDEQUESTS[1],
        id: "sq_pack_demo",
        title: "Pack quest",
        origin: "pack" as const,
        packId: "pack_bm_2026_demo",
      },
    ];
    const merged = mergeMapRecordsWithLocalSidequests(pack, sidequests);
    expect(merged).toHaveLength(3);
    expect(merged.some((item) => item.id === "sq_local_abc" && item.placementLabel === "Local sidequest")).toBe(
      true,
    );
    expect(merged.some((item) => item.id === "sq_pack_demo" && item.placementLabel === "Pack sidequest")).toBe(
      true,
    );
  });
});
