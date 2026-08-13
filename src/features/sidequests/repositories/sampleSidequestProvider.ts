import type { Coordinates } from "@/features/location/types/coordinates";
import { distanceMeters } from "@/features/location/utils/distance";
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
import { SAMPLE_SIDEQUESTS } from "@/data/sample/sidequests";

export function createSampleSidequestProvider(
  initial: Sidequest[] = SAMPLE_SIDEQUESTS,
): SidequestProvider {
  const records = new Map<string, Sidequest>(
    initial.map((item) => [item.id, parseSidequest({ ...item, origin: item.origin ?? "sample" })]),
  );

  return {
    async getAll() {
      return [...records.values()];
    },
    async getById(id) {
      return records.get(id) ?? null;
    },
    async getNearby(location: Coordinates, radiusMeters: number) {
      return [...records.values()].filter((quest) => distanceMeters(location, quest.location) <= radiusMeters);
    },
    async create(input: CreateSidequestInput) {
      createSidequestInputSchema.parse(input);
      const now = new Date().toISOString();
      const sidequest = parseSidequest({
        id: createStableClientId("sq"),
        title: input.title,
        description: input.description,
        location: { ...input.location },
        radiusMeters: input.radiusMeters,
        category: input.category,
        availability: input.availability,
        difficulty: input.difficulty,
        packId: input.packId ?? null,
        placementKind: input.placementKind ?? "exact",
        completionRule: input.completionRule ?? "open",
        beaconKind: input.beaconKind ?? null,
        presenter: input.presenter ?? null,
        reward: input.reward ?? null,
        livePin: input.livePin ?? false,
        testAreaId: input.testAreaId ?? null,
        origin: "local",
        createdAt: now,
        updatedAt: now,
        syncStatus: "pending",
      });
      records.set(sidequest.id, sidequest);
      return sidequest;
    },
    async update(id: string, input: UpdateSidequestInput) {
      const existing = records.get(id);
      if (!existing) throw new Error(`Sidequest not found: ${id}`);
      updateSidequestInputSchema.parse(input);
      const updated = parseSidequest({
        ...existing,
        ...input,
        location: input.location ? { ...input.location } : existing.location,
        id: existing.id,
        origin: existing.origin,
        updatedAt: new Date().toISOString(),
        syncStatus: "pending",
      });
      records.set(id, updated);
      return updated;
    },
    async delete(id: string) {
      const existing = records.get(id);
      if (!existing || existing.origin !== "local") {
        throw new Error("Only beacons created on this device can be removed.");
      }
      records.delete(id);
    },
  };
}
