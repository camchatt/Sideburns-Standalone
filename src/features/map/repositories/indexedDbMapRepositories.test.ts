import { beforeEach, describe, expect, it } from "vitest";
import { createIndexedDbInteractionRepository, createIndexedDbMapRecordCache } from "@/features/map/repositories/indexedDbMapRepositories";
import { deleteDB } from "idb";
import { closePlayaDatabaseForTests, PLAYA_DATABASE_NAME, PLAYA_DATABASE_VERSION } from "@/lib/storage/playaDatabase";

describe("Playa IndexedDB repositories", () => {
  beforeEach(async () => { await closePlayaDatabaseForTests(); await deleteDB(PLAYA_DATABASE_NAME); });
  it("uses schema version 7 with playa-pack, progress, sync outbox, and local identity stores", () => { expect(PLAYA_DATABASE_VERSION).toBe(7); });
  it("persists local like and save state", async () => {
    const repository = createIndexedDbInteractionRepository();
    expect((await repository.toggleLike("p1")).liked).toBe(true);
    expect((await repository.toggleSaved("p1")).saved).toBe(true);
    expect(await repository.get("p1")).toMatchObject({ liked: true, saved: true });
    expect(await repository.listSaved()).toEqual([
      expect.objectContaining({ recordId: "p1", liked: true, saved: true }),
    ]);
  });
  it("persists reversible packaged-record dismissals", async () => {
    const repository = createIndexedDbInteractionRepository();
    expect((await repository.toggleDismissed("pack-1")).dismissed).toBe(true);
    expect(await repository.listDismissed()).toEqual(["pack-1"]);
    expect((await repository.toggleDismissed("pack-1")).dismissed).toBe(false);
    expect(await repository.listDismissed()).toEqual([]);
  });
  it("round-trips a map snapshot", async () => {
    const cache = createIndexedDbMapRecordCache();
    const snapshot = { key: "current" as const, records: [], source: "sample" as const, fetchedAt: "2026-08-03T00:00:00.000Z", schemaVersion: 1 };
    await cache.write(snapshot); expect(await cache.read()).toEqual(snapshot);
  });
});
