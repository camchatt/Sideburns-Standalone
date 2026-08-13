import { describe, expect, it } from "vitest";
import {
  inferUserContentOrigin,
  parseSidequest,
} from "@/features/sidequests/types/sidequest";
import { canRemoveBeacon, shouldShowPostAge, presentedByLabel } from "@/features/sidequests/utils/ownership";
import { formatPostAge } from "@/features/sidequests/utils/postAge";

const baseLegacy = {
  id: "sq_sample_legacy",
  title: "Legacy",
  description: "No new fields",
  location: { latitude: 40.78, longitude: -119.2 },
  radiusMeters: 30,
  category: "explore",
  availability: "always",
  difficulty: "easy",
  createdAt: "2025-08-01T12:00:00.000Z",
  updatedAt: "2025-08-01T12:00:00.000Z",
  syncStatus: "synced",
  origin: "sample",
};

describe("contentOrigin and ownership", () => {
  it("parses legacy records without creator fields as infrastructure", () => {
    const parsed = parseSidequest(baseLegacy);
    expect(parsed.contentOrigin).toBe("infrastructure");
    expect(parsed.creatorId).toBeNull();
    expect(parsed.creatorDisplayName).toBeNull();
    expect(inferUserContentOrigin({ origin: "sample" })).toBe("infrastructure");
    expect(inferUserContentOrigin({ origin: "local" })).toBe("user");
  });

  it("only allows remove when creatorId matches local user", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    expect(canRemoveBeacon({ creatorId: userId }, userId)).toBe(true);
    expect(canRemoveBeacon({ creatorId: userId }, "22222222-2222-4222-8222-222222222222")).toBe(false);
    expect(canRemoveBeacon({ creatorId: null }, userId)).toBe(false);
    expect(canRemoveBeacon({}, userId)).toBe(false);
  });

  it("shows post age for all user-generated sideburns and beacons", () => {
    expect(
      shouldShowPostAge({ contentOrigin: "user", recordKind: "sidequest", markerKind: null }),
    ).toBe(true);
    expect(
      shouldShowPostAge({ contentOrigin: "user", recordKind: "beacon", markerKind: "food" }),
    ).toBe(true);
    expect(
      shouldShowPostAge({ contentOrigin: "user", recordKind: "beacon", markerKind: "get_weird" }),
    ).toBe(true);
    expect(
      shouldShowPostAge({ contentOrigin: "user", recordKind: "beacon", markerKind: "do_good" }),
    ).toBe(true);
    expect(
      shouldShowPostAge({ contentOrigin: "infrastructure", recordKind: "sidequest", markerKind: null }),
    ).toBe(false);
  });

  it("falls back presented-by without inventing camp names", () => {
    expect(presentedByLabel({ creatorDisplayName: "Dust Bunny", presenter: null, artistName: null })).toBe(
      "Dust Bunny",
    );
    expect(presentedByLabel({ creatorDisplayName: null, presenter: "Camp Q", artistName: null })).toBe("Camp Q");
    expect(presentedByLabel({ creatorDisplayName: null, presenter: null, artistName: null })).toBe(
      "ANONYMOUS BURNER",
    );
  });
});

describe("formatPostAge", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");

  it("formats concise relative ages", () => {
    expect(formatPostAge("2026-08-04T11:52:00.000Z", now)).toBe("POSTED 8 MIN AGO");
    expect(formatPostAge("2026-08-04T10:00:00.000Z", now)).toBe("POSTED 2 HOURS AGO");
    expect(formatPostAge("2026-08-03T12:00:00.000Z", now)).toBe("POSTED YESTERDAY");
    expect(formatPostAge("2026-08-01T12:00:00.000Z", now)).toBe("POSTED 3 DAYS AGO");
  });

  it("omits age for missing or invalid timestamps", () => {
    expect(formatPostAge(null, now)).toBeNull();
    expect(formatPostAge(undefined, now)).toBeNull();
    expect(formatPostAge("not-a-date", now)).toBeNull();
  });
});
