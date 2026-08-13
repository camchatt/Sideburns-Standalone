import { beforeEach, describe, expect, it } from "vitest";
import { SAMPLE_SIDEQUESTS } from "@/data/sample/sidequests";
import {
  createIndexedDbSidequestRepository,
  createLocalFirstSidequestProvider,
} from "@/features/sidequests/repositories/indexedDbSidequestRepository";
import { closePlayaDatabaseForTests, getPlayaDatabase } from "@/lib/storage/playaDatabase";

describe("indexedDb sidequest repository", () => {
  beforeEach(async () => {
    await closePlayaDatabaseForTests();
    indexedDB.deleteDatabase("artelier-playa");
  });

  it("preserves the sidequests store in version 7", async () => {
    const db = await getPlayaDatabase();
    expect(db.version).toBe(7);
    expect(db.objectStoreNames.contains("sidequests")).toBe(true);
    expect(db.objectStoreNames.contains("sidequestProgress")).toBe(true);
    expect(db.objectStoreNames.contains("syncOutbox")).toBe(true);
    expect(db.objectStoreNames.contains("localUserIdentity")).toBe(true);
  });

  it("persists creates locally with local origin and lists them with sample seed", async () => {
    const repository = createIndexedDbSidequestRepository();
    const provider = createLocalFirstSidequestProvider({ seed: SAMPLE_SIDEQUESTS, repository });
    const created = await provider.create({
      title: "Dust Note",
      description: "Leave a chalk message",
      location: { latitude: 40.785, longitude: -119.205 },
      radiusMeters: 25,
      category: "art",
      availability: "always",
      difficulty: "easy",
    });
    expect(created.syncStatus).toBe("pending");
    expect(created.origin).toBe("local");
    expect(created.completionRule).toBe("open");
    expect(created.id.startsWith("sq_local_")).toBe(true);

    const again = await provider.getById(created.id);
    expect(again?.title).toBe("Dust Note");
    expect(again?.origin).toBe("local");

    const all = await provider.getAll();
    expect(all.some((item) => item.id === created.id)).toBe(true);
    expect(all.filter((item) => item.origin === "sample").length).toBe(SAMPLE_SIDEQUESTS.length);
    expect(all.length).toBeGreaterThanOrEqual(SAMPLE_SIDEQUESTS.length + 1);
  });

  it("removes local records atomically and protects sample records", async () => {
    const repository = createIndexedDbSidequestRepository();
    const provider = createLocalFirstSidequestProvider({ seed: SAMPLE_SIDEQUESTS, repository });
    const created = await provider.create({
      title: "Temporary beacon", description: "Remove me", location: { latitude: 40.785, longitude: -119.205 },
      radiusMeters: 25, category: "service", availability: "always", difficulty: "easy",
    });
    await provider.delete(created.id);
    expect(await provider.getById(created.id)).toBeNull();
    const db = await getPlayaDatabase();
    const operations = await db.getAll("syncOutbox");
    expect(operations.some((operation) => operation.type === "sidequest.delete" && operation.entityId === created.id)).toBe(true);
    await expect(provider.delete(SAMPLE_SIDEQUESTS[0].id)).rejects.toThrow(/created on this device/i);
  });
});
