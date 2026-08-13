import { describe, expect, it } from "vitest";
import {
  completionBlockMessage,
  evaluateCompletionGate,
  trackingFlashMessage,
} from "@/features/sidequests/utils/completionGate";
import { parseSidequest } from "@/features/sidequests/types/sidequest";
import type { LocationReading } from "@/features/location/types/location";

const openQuest = parseSidequest({
  id: "sq_test_open",
  title: "Open",
  description: "d",
  location: { latitude: 40.78, longitude: -119.2 },
  radiusMeters: 30,
  category: "other",
  availability: "always",
  difficulty: "easy",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  syncStatus: "synced",
  origin: "sample",
  completionRule: "open",
});

const proximityQuest = parseSidequest({
  ...openQuest,
  id: "sq_test_proximity",
  completionRule: "proximity",
});

function reading(partial: Partial<LocationReading> & { latitude?: number; longitude?: number }): LocationReading {
  const latitude = partial.latitude ?? 40.78;
  const longitude = partial.longitude ?? -119.2;
  return {
    coordinates: {
      latitude,
      longitude,
      accuracyMeters: partial.accuracyMeters ?? 10,
    },
    accuracyMeters: partial.accuracyMeters ?? 10,
    timestamp: partial.timestamp ?? new Date().toISOString(),
    permission: partial.permission ?? "granted",
    source: partial.source ?? "device",
    error: partial.error ?? null,
  };
}

describe("evaluateCompletionGate", () => {
  it("allows open quests without GPS", () => {
    expect(evaluateCompletionGate(openQuest, null).allowed).toBe(true);
  });

  it("maps denied, inaccurate, stale, and unavailable honestly", () => {
    expect(evaluateCompletionGate(proximityQuest, null)).toMatchObject({
      allowed: false,
      reason: "location_prompt_required",
    });

    const deniedReading: LocationReading = {
      coordinates: null,
      accuracyMeters: null,
      timestamp: new Date().toISOString(),
      permission: "denied",
      source: "device",
      error: "Permission denied",
    };
    expect(evaluateCompletionGate(proximityQuest, deniedReading)).toMatchObject({
      reason: "location_denied",
    });

    expect(
      evaluateCompletionGate(proximityQuest, reading({ accuracyMeters: 400 })),
    ).toMatchObject({ reason: "location_inaccurate" });

    expect(
      evaluateCompletionGate(
        proximityQuest,
        reading({ timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString() }),
      ),
    ).toMatchObject({ reason: "location_stale" });

    const unavailable: LocationReading = {
      coordinates: null,
      accuracyMeters: null,
      timestamp: new Date().toISOString(),
      permission: "granted",
      source: "device",
      error: "Position unavailable",
    };
    expect(evaluateCompletionGate(proximityQuest, unavailable)).toMatchObject({
      reason: "location_unavailable",
    });

    expect(completionBlockMessage("location_stale")).toMatch(/stale/i);
  });

  it("uses distinct flash copy for outside-range vs missing location", () => {
    expect(trackingFlashMessage("outside_radius")).toBe("Don't cheat. Go find it!");
    expect(trackingFlashMessage("location_acquiring")).toMatch(/can't find your location/i);
    expect(trackingFlashMessage("location_prompt_required")).toMatch(/Enable location/i);
  });
});
