import { beforeEach, describe, expect, it } from "vitest";
import { createIndexedDbQuestCompletionRepository } from "@/features/sidequests/repositories/indexedDbQuestCompletionRepository";
import { closePlayaDatabaseForTests, getPlayaDatabase } from "@/lib/storage/playaDatabase";

describe("indexedDb quest completion repository", () => {
  beforeEach(async () => {
    await closePlayaDatabaseForTests();
    indexedDB.deleteDatabase("artelier-playa");
  });

  it("preserves the completion store through version 6", async () => {
    const db = await getPlayaDatabase();
    expect(db.version).toBe(7);
    expect(db.objectStoreNames.contains("questCompletions")).toBe(true);
    expect(db.objectStoreNames.contains("syncOutbox")).toBe(true);
  });

  it("completes idempotently and supports an offline undo", async () => {
    const repository = createIndexedDbQuestCompletionRepository();
    const first = await repository.complete("sq_sample_1", "  Dusty but done  ");
    const repeated = await repository.complete("sq_sample_1");

    expect(repeated.id).toBe(first.id);
    expect(first.notes).toBe("Dusty but done");
    expect(first.syncStatus).toBe("pending");
    expect(await repository.list()).toHaveLength(1);

    await repository.remove("sq_sample_1");
    expect(await repository.getForSidequest("sq_sample_1")).toBeNull();
  });
});
