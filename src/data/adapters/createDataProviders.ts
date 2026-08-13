import type { AppEnvConfig } from "@/lib/validation/env";
import type { EventDataProvider } from "@/features/playa-pack/types/playaPack";
import type { SidequestProvider } from "@/features/sidequests/types/sidequest";
import { createSampleEventDataProvider } from "@/data/adapters/sampleEventDataProvider";
import { SAMPLE_SIDEQUESTS } from "@/data/sample/sidequests";
import { SIDEQUESTER_2025_SIDEQUESTS } from "@/data/sample/sidequester2025";
import {
  createIndexedDbSidequestRepository,
  createLocalFirstSidequestProvider,
} from "@/features/sidequests/repositories/indexedDbSidequestRepository";
import { createIndexedDbPlayaPackRepository } from "@/features/playa-pack/repositories/indexedDbPlayaPackRepository";
import { createHttpPlayaPackCatalogProvider } from "@/features/playa-pack/providers/httpPlayaPackCatalogProvider";
import {
  createPlayaPackService,
  type PlayaPackService,
} from "@/features/playa-pack/services/playaPackService";
import type { SyncBackendMode } from "@/features/sync/types/sync";
import { getPublishableSupabaseKey } from "@/lib/validation/env";

/**
 * Honest provider selection.
 *
 * Event catalog + sidequest *reads* stay local-first (sample seed / packs /
 * IndexedDB) in both modes — that is intentional offline-first behavior, not a
 * silent Supabase fallback.
 *
 * `VITE_DATA_PROVIDER=supabase` enables the remote sync backend when URL +
 * publishable key are present. It does **not** claim that Explore/Nearby are
 * reading live Supabase rows.
 */
export type DataProviderBundle = {
  /** Configured selection from env (`sample` | `supabase`). */
  dataProviderId: AppEnvConfig["VITE_DATA_PROVIDER"];
  /** Actual EventDataProvider.source — never claim supabase while serving sample. */
  catalogSource: EventDataProvider["source"];
  /** Whether deferred outbox apply targets SIDEBURNS Supabase. */
  syncBackend: SyncBackendMode;
  /** True when syncBackend is supabase (credentials present). */
  remoteSyncEnabled: boolean;
  eventData: EventDataProvider;
  sidequests: SidequestProvider;
  playaPacks: PlayaPackService;
};

function createPlayaPacks(): PlayaPackService {
  return createPlayaPackService({
    repository: createIndexedDbPlayaPackRepository(),
    catalog: createHttpPlayaPackCatalogProvider(),
  });
}

function createSidequests(playaPacks: PlayaPackService): SidequestProvider {
  return createLocalFirstSidequestProvider({
    seed: [...SAMPLE_SIDEQUESTS, ...SIDEQUESTER_2025_SIDEQUESTS],
    repository: createIndexedDbSidequestRepository(),
    getActivePackSidequests: () => playaPacks.getActiveSidequests(),
  });
}

export function createDataProviders(env: AppEnvConfig): DataProviderBundle {
  const playaPacks = createPlayaPacks();
  const eventData = createSampleEventDataProvider(playaPacks);
  const sidequests = createSidequests(playaPacks);

  const wantsSupabase = env.VITE_DATA_PROVIDER === "supabase";
  const hasCredentials = Boolean(env.VITE_SUPABASE_URL && getPublishableSupabaseKey(env));
  const remoteSyncEnabled = wantsSupabase && hasCredentials;

  return {
    dataProviderId: wantsSupabase ? "supabase" : "sample",
    catalogSource: eventData.source,
    syncBackend: remoteSyncEnabled ? "supabase" : "none",
    remoteSyncEnabled,
    eventData,
    sidequests,
    playaPacks,
  };
}
