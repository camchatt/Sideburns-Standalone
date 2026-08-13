import { beforeEach, describe, expect, it } from "vitest";
import { createIndexedDbLocalUserIdentityRepository } from "@/features/identity/repositories/indexedDbLocalUserIdentityRepository";
import { closePlayaDatabaseForTests, getPlayaDatabase } from "@/lib/storage/playaDatabase";

describe("local user identity repository", () => {
  beforeEach(async () => {
    await closePlayaDatabaseForTests();
    indexedDB.deleteDatabase("artelier-playa");
  });

  it("creates a stable identity once and persists after reopen", async () => {
    const repository = createIndexedDbLocalUserIdentityRepository();
    expect(await repository.get()).toBeNull();

    const created = await repository.create("Dust Bunny");
    expect(created.displayName).toBe("Dust Bunny");
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const again = await repository.create("Should Not Replace");
    expect(again.id).toBe(created.id);
    expect(again.displayName).toBe("Dust Bunny");

    await closePlayaDatabaseForTests();
    const afterReload = createIndexedDbLocalUserIdentityRepository();
    const persisted = await afterReload.get();
    expect(persisted?.id).toBe(created.id);
    expect(persisted?.displayName).toBe("Dust Bunny");
  });

  it("edits the display name while keeping the same id", async () => {
    const repository = createIndexedDbLocalUserIdentityRepository();
    const created = await repository.create("Camp Questionable");
    const updated = await repository.updateDisplayName("Temple Fox");
    expect(updated.id).toBe(created.id);
    expect(updated.displayName).toBe("Temple Fox");
    expect(updated.updatedAt >= created.updatedAt).toBe(true);

    const db = await getPlayaDatabase();
    expect(db.version).toBe(7);
    expect(db.objectStoreNames.contains("localUserIdentity")).toBe(true);
  });
});
