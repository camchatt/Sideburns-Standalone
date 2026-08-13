import type { EventDataProvider, PlayaPack } from "@/features/playa-pack/types/playaPack";
import type { PlayaPackService } from "@/features/playa-pack/services/playaPackService";
import { SAMPLE_SIDEQUESTS } from "@/data/sample/sidequests";
import { SAMPLE_DATA_VERSION } from "@/lib/pwa/versioning";

const SAMPLE_PACK: PlayaPack = {
  id: "pack_sample_2026",
  name: "Sample Playa Pack",
  eventYear: 2026,
  formatVersion: SAMPLE_DATA_VERSION,
  contentVersion: SAMPLE_DATA_VERSION,
  sidequestIds: SAMPLE_SIDEQUESTS.map((quest) => quest.id),
  mapPackageId: "sample-playa-basemap",
  createdAt: "2026-01-01T00:00:00.000Z",
};

export function createSampleEventDataProvider(
  playaPacks?: Pick<PlayaPackService, "getActivePack" | "getActiveSidequests" | "toPlayaPackSummary">,
): EventDataProvider {
  return {
    source: "sample",
    async getPack() {
      if (playaPacks) {
        const active = await playaPacks.getActivePack();
        if (active) {
          const quests = await playaPacks.getActiveSidequests();
          return {
            ...playaPacks.toPlayaPackSummary(
              active,
              quests.map((quest) => quest.id),
            ),
            // Keep EventDataProvider.source honest about bundled sample wiring;
            // installed pack details live on the returned PlayaPack.status.
          };
        }
      }
      return SAMPLE_PACK;
    },
    async getSidequests() {
      if (playaPacks) {
        const active = await playaPacks.getActiveSidequests();
        if (active.length > 0) return active.map((quest) => structuredClone(quest));
      }
      return SAMPLE_SIDEQUESTS.map((quest) => structuredClone(quest));
    },
  };
}
