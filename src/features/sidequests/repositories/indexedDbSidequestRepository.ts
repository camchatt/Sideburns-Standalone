import type {
  CreateSidequestInput,
  Sidequest,
  SidequestProvider,
  UpdateSidequestInput,
} from "@/features/sidequests/types/sidequest";
import {
  createSidequestInputSchema,
  createStableClientId,
  parseSidequest,
  updateSidequestInputSchema,
} from "@/features/sidequests/types/sidequest";
import type { Coordinates } from "@/features/location/types/coordinates";
import { distanceMeters } from "@/features/location/utils/distance";
import { getPlayaDatabase } from "@/lib/storage/playaDatabase";
import { withLocalPersistence } from "@/features/sidequests/utils/localPersistence";
import {
  buildSidequestOutboxOp,
  deleteWithOutbox,
  putWithOutbox,
} from "@/features/sync/utils/atomicEnqueue";

export type LocalSidequestRepository = {
  list(): Promise<Sidequest[]>;
  get(id: string): Promise<Sidequest | null>;
  put(
    sidequest: Sidequest,
    options?: { outboxType?: "sidequest.create" | "sidequest.update" },
  ): Promise<Sidequest>;
  delete(sidequest: Sidequest): Promise<void>;
};

export function createIndexedDbSidequestRepository(): LocalSidequestRepository {
  return {
    async list() {
      return withLocalPersistence("list sidequests", async () => {
        const db = await getPlayaDatabase();
        const rows = await db.getAll("sidequests");
        return rows.map((row) => parseSidequest(row));
      });
    },
    async get(id) {
      return withLocalPersistence("read sidequest", async () => {
        const db = await getPlayaDatabase();
        const row = await db.get("sidequests", id);
        return row ? parseSidequest(row) : null;
      });
    },
    async put(sidequest, options) {
      return withLocalPersistence("save sidequest", async () => {
        const parsed = parseSidequest(sidequest);
        if (options?.outboxType) {
          const operation = await buildSidequestOutboxOp(options.outboxType, parsed);
          await putWithOutbox({ store: "sidequests", entity: parsed, operation });
          return parsed;
        }
        const db = await getPlayaDatabase();
        await db.put("sidequests", parsed);
        return parsed;
      });
    },
    async delete(sidequest) {
      return withLocalPersistence("remove sidequest", async () => {
        const parsed = parseSidequest(sidequest);
        const operation = await buildSidequestOutboxOp("sidequest.delete", parsed);
        await deleteWithOutbox({ store: "sidequests", key: parsed.id, operation });
      });
    },
  };
}

/**
 * Bundled sample seed (or active pack sidequests) + durable IndexedDB overlay for local-first creates.
 * Pack activation must never delete rows in the user `sidequests` store.
 */
export function createLocalFirstSidequestProvider(input: {
  seed: Sidequest[];
  repository: LocalSidequestRepository;
  /** When an official pack is active, these replace the bundled sample seed. */
  getActivePackSidequests?: () => Promise<Sidequest[]>;
}): SidequestProvider {
  const bundledSeed = input.seed.map((item) => parseSidequest({ ...item, origin: item.origin ?? "sample" }));

  async function baseSeed(): Promise<Map<string, Sidequest>> {
    const packQuests = input.getActivePackSidequests ? await input.getActivePackSidequests() : [];
    const source =
      packQuests.length > 0
        ? packQuests.map((quest) => parseSidequest({ ...quest, origin: quest.origin ?? "pack" }))
        : bundledSeed;
    return new Map(source.map((item) => [item.id, structuredClone(item)]));
  }

  async function all(): Promise<Sidequest[]> {
    const local = await input.repository.list();
    const merged = await baseSeed();
    for (const item of local) {
      merged.set(item.id, parseSidequest({ ...item, origin: item.origin ?? "local" }));
    }
    return [...merged.values()];
  }

  return {
    async getAll() {
      return all();
    },
    async getById(id) {
      const local = await input.repository.get(id);
      if (local) return parseSidequest({ ...local, origin: local.origin ?? "local" });
      return (await baseSeed()).get(id) ?? null;
    },
    async getNearby(location: Coordinates, radiusMeters: number) {
      return (await all()).filter((quest) => distanceMeters(location, quest.location) <= radiusMeters);
    },
    async create(createInput: CreateSidequestInput) {
      createSidequestInputSchema.parse(createInput);
      const now = new Date().toISOString();
      const sidequest = parseSidequest({
        id: createStableClientId("sq"),
        title: createInput.title,
        description: createInput.description,
        location: { ...createInput.location },
        radiusMeters: createInput.radiusMeters,
        category: createInput.category,
        availability: createInput.availability,
        difficulty: createInput.difficulty,
        packId: createInput.packId ?? null,
        placementKind: createInput.placementKind ?? "exact",
        completionRule: createInput.completionRule ?? "open",
        beaconKind: createInput.beaconKind ?? null,
        presenter: createInput.presenter ?? createInput.creatorDisplayName ?? null,
        reward: createInput.reward ?? null,
        livePin: createInput.livePin ?? false,
        testAreaId: createInput.testAreaId ?? null,
        creatorId: createInput.creatorId ?? null,
        creatorDisplayName: createInput.creatorDisplayName ?? null,
        contentOrigin: createInput.contentOrigin ?? "user",
        origin: "local",
        createdAt: now,
        updatedAt: now,
        syncStatus: "pending",
      });
      return input.repository.put(sidequest, { outboxType: "sidequest.create" });
    },
    async update(id: string, patch: UpdateSidequestInput) {
      updateSidequestInputSchema.parse(patch);
      const existing = (await input.repository.get(id)) ?? (await baseSeed()).get(id);
      if (!existing) throw new Error(`Sidequest not found: ${id}`);
      const updated = parseSidequest({
        ...existing,
        ...patch,
        location: patch.location ? { ...patch.location } : existing.location,
        id: existing.id,
        origin: existing.origin === "local" ? "local" : existing.origin,
        updatedAt: new Date().toISOString(),
        syncStatus: "pending",
      });
      // Persist into the user store even when editing a pack/sample seed overlay.
      return input.repository.put(updated, { outboxType: "sidequest.update" });
    },
    async delete(id: string) {
      const existing = await input.repository.get(id);
      if (!existing || existing.origin !== "local") {
        throw new Error("Only beacons created on this device can be removed.");
      }
      await input.repository.delete(existing);
    },
  };
}
