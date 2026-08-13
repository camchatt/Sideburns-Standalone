import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { SAMPLE_SIDEQUESTS } from "@/data/sample/sidequests";
import {
  createIndexedDbSidequestRepository,
  createLocalFirstSidequestProvider,
} from "@/features/sidequests/repositories/indexedDbSidequestRepository";
import { createIndexedDbSidequestProgressRepository } from "@/features/sidequests/repositories/indexedDbSidequestProgressRepository";
import { createSidequestLifecycleService } from "@/features/sidequests/services/sidequestLifecycleService";
import { CompletionGateError } from "@/features/sidequests/utils/completionGate";
import {
  closePlayaDatabaseForTests,
  getPlayaDatabase,
  PLAYA_DATABASE_NAME,
  PLAYA_DATABASE_VERSION,
} from "@/lib/storage/playaDatabase";
import type { LocationReading } from "@/features/location/types/location";

function readingAt(
  latitude: number,
  longitude: number,
  overrides: Partial<LocationReading> = {},
): LocationReading {
  return {
    coordinates: { latitude, longitude, accuracyMeters: 10 },
    accuracyMeters: 10,
    timestamp: new Date().toISOString(),
    permission: "granted",
    source: "device",
    error: null,
    ...overrides,
  };
}

describe("sidequest lifecycle IndexedDB migration", () => {
  beforeEach(async () => {
    await closePlayaDatabaseForTests();
    indexedDB.deleteDatabase(PLAYA_DATABASE_NAME);
  });

  it("upgrades to v6 with sidequestProgress, sync outbox, and completion backfill", async () => {
    const legacy = await openDB(PLAYA_DATABASE_NAME, 4, {
      upgrade(database) {
        database.createObjectStore("mapRecordCache");
        database.createObjectStore("interactions", { keyPath: "recordId" });
        database.createObjectStore("sidequests", { keyPath: "id" });
        const completions = database.createObjectStore("questCompletions", { keyPath: "id" });
        completions.createIndex("sidequestId", "sidequestId", { unique: true });
        database.createObjectStore("playaPackMeta", { keyPath: "packId" });
        const files = database.createObjectStore("playaPackFiles", { keyPath: "id" });
        files.createIndex("packId", "packId", { unique: false });
        database.createObjectStore("playaPackActive", { keyPath: "key" });
        const packQuests = database.createObjectStore("packSidequests", { keyPath: "id" });
        packQuests.createIndex("packId", "packId", { unique: false });
      },
    });
    await legacy.put("questCompletions", {
      id: "qc_legacy_1",
      sidequestId: "sq_sample_lantern_grove",
      completedAt: "2026-08-01T12:00:00.000Z",
      notes: "Legacy complete",
      syncStatus: "pending",
    });
    legacy.close();

    const db = await getPlayaDatabase();
    expect(db.version).toBe(PLAYA_DATABASE_VERSION);
    expect(PLAYA_DATABASE_VERSION).toBe(7);
    expect(db.objectStoreNames.contains("syncOutbox")).toBe(true);
    expect(db.objectStoreNames.contains("sidequestProgress")).toBe(true);

    const progressRows = await db.getAll("sidequestProgress");
    expect(progressRows).toHaveLength(1);
    expect(progressRows[0]?.sidequestId).toBe("sq_sample_lantern_grove");
    expect(progressRows[0]?.phase).toBe("completed");
    expect(progressRows[0]?.notes).toBe("Legacy complete");
  });
});

describe("sidequest lifecycle service", () => {
  beforeEach(async () => {
    await closePlayaDatabaseForTests();
    indexedDB.deleteDatabase(PLAYA_DATABASE_NAME);
  });

  function createService() {
    const sidequests = createLocalFirstSidequestProvider({
      seed: SAMPLE_SIDEQUESTS,
      repository: createIndexedDbSidequestRepository(),
    });
    return createSidequestLifecycleService({
      sidequests,
      progress: createIndexedDbSidequestProgressRepository(),
    });
  }

  it("saves, begins, completes with notes atomically, and supports review", async () => {
    const lifecycle = createService();
    const openQuest = SAMPLE_SIDEQUESTS.find((quest) => quest.completionRule === "open")!;

    const saved = await lifecycle.save(openQuest.id);
    expect(saved.phase).toBe("saved");
    expect(saved.id.startsWith("qp_local_")).toBe(true);

    const begun = await lifecycle.begin(openQuest.id);
    expect(begun.phase).toBe("in_progress");

    const { progress, completion } = await lifecycle.complete({
      sidequestId: openQuest.id,
      notes: "  Left a note  ",
      reading: null,
    });
    expect(progress.phase).toBe("completed");
    expect(progress.notes).toBe("Left a note");
    expect(completion.notes).toBe("Left a note");
    expect(completion.id.startsWith("qc_local_")).toBe(true);

    const review = await lifecycle.listReview();
    expect(review.some((row) => row.progress.phase === "completed" && row.sidequest.id === openQuest.id)).toBe(
      true,
    );

    const undone = await lifecycle.undoComplete(openQuest.id);
    expect(undone?.phase).toBe("in_progress");
    const snapshot = await lifecycle.getSnapshot(openQuest.id);
    expect(snapshot?.completion).toBeNull();
  });

  it("does not require GPS for open completion and blocks proximity honestly", async () => {
    const lifecycle = createService();
    const openQuest = SAMPLE_SIDEQUESTS.find((quest) => quest.id === "sq_sample_tea_stop")!;
    const proximityQuest = SAMPLE_SIDEQUESTS.find((quest) => quest.completionRule === "proximity")!;

    await expect(
      lifecycle.complete({ sidequestId: openQuest.id, notes: "No GPS", reading: null }),
    ).resolves.toMatchObject({
      progress: { phase: "completed" },
    });

    await expect(
      lifecycle.complete({ sidequestId: proximityQuest.id, reading: null }),
    ).rejects.toBeInstanceOf(CompletionGateError);

    await expect(
      lifecycle.complete({
        sidequestId: proximityQuest.id,
        reading: readingAt(40.9, -119.3),
      }),
    ).rejects.toMatchObject({ reason: "outside_radius" });

    await expect(
      lifecycle.complete({
        sidequestId: proximityQuest.id,
        reading: readingAt(proximityQuest.location.latitude, proximityQuest.location.longitude, {
          accuracyMeters: 500,
          coordinates: {
            latitude: proximityQuest.location.latitude,
            longitude: proximityQuest.location.longitude,
            accuracyMeters: 500,
          },
        }),
      }),
    ).rejects.toMatchObject({ reason: "location_inaccurate" });

    const ok = await lifecycle.complete({
      sidequestId: proximityQuest.id,
      reading: readingAt(proximityQuest.location.latitude, proximityQuest.location.longitude),
    });
    expect(ok.progress.phase).toBe("completed");
  });

  it("keeps sample-origin quests distinct from local creates", async () => {
    const sidequests = createLocalFirstSidequestProvider({
      seed: SAMPLE_SIDEQUESTS,
      repository: createIndexedDbSidequestRepository(),
    });
    const created = await sidequests.create({
      title: "Local only",
      description: "Device authored",
      location: { latitude: 40.78, longitude: -119.2 },
      radiusMeters: 20,
      category: "other",
      availability: "always",
      difficulty: "easy",
    });
    expect(created.origin).toBe("local");
    const sample = await sidequests.getById("sq_sample_lantern_grove");
    expect(sample?.origin).toBe("sample");
  });
});
