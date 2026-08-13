import { createContext, useContext, useEffect, type ReactNode } from "react";
import { createElement } from "react";
import { loadAppConfig, type AppConfig } from "@/app/config";
import { createDataProviders, type DataProviderBundle } from "@/data/adapters/createDataProviders";
import { createAnonymousAuthProvider } from "@/features/auth/services/anonymousAuthProvider";
import { createSupabaseAuthProvider } from "@/features/auth/services/supabaseAuthProvider";
import type { AuthProvider } from "@/features/auth/types/auth";
import { LocalIdentityProvider } from "@/features/identity/hooks/LocalIdentityProvider";
import {
  createIndexedDbLocalUserIdentityRepository,
  type LocalUserIdentityRepository,
} from "@/features/identity/repositories/indexedDbLocalUserIdentityRepository";
import { ForegroundLocationProvider } from "@/features/location/hooks/ForegroundLocationProvider";
import { createBrowserLocationProvider } from "@/features/location/providers/browserLocationProvider";
import type { LocationProvider } from "@/features/location/types/location";
import { createAppMapProvider } from "@/features/map/providers/sampleMapProvider";
import type { MapProvider } from "@/features/map/types/map";
import { createSampleMapRecordProvider } from "@/features/map/providers/sampleMapRecordProvider";
import { createCombinedMapRecordProvider, createSupabaseSharedBeaconProvider } from "@/features/map/providers/supabaseSharedBeaconProvider";
import { createIndexedDbInteractionRepository, createIndexedDbMapRecordCache } from "@/features/map/repositories/indexedDbMapRepositories";
import type { LocalInteractionRepository, MapRecordCache, MapRecordProvider } from "@/features/map/types/mapRecord";
import { createMemoryStorageAdapter } from "@/features/offline/storage/memoryStorageAdapter";
import type { OfflineStorageAdapter } from "@/features/offline/types/offline";
import { createIndexedDbPlayaPackRepository } from "@/features/playa-pack/repositories/indexedDbPlayaPackRepository";
import { createGpsProximityProvider } from "@/features/proximity/providers/gpsProximityProvider";
import type { ProximityProvider } from "@/features/proximity/types/proximity";
import { createIndexedDbSyncRepository } from "@/features/sync/repositories/indexedDbSyncRepository";
import { createNoopRemoteSyncAdapter } from "@/features/sync/providers/noopRemoteSyncAdapter";
import { createSupabaseRemoteSyncAdapter } from "@/features/sync/providers/supabaseRemoteSyncAdapter";
import { createSyncService } from "@/features/sync/services/syncService";
import type { SyncRepository, SyncService } from "@/features/sync/types/sync";
import { createIndexedDbQuestCompletionRepository, type QuestCompletionRepository } from "@/features/sidequests/repositories/indexedDbQuestCompletionRepository";
import { createIndexedDbSidequestProgressRepository } from "@/features/sidequests/repositories/indexedDbSidequestProgressRepository";
import {
  createSidequestLifecycleService,
  type SidequestLifecycleService,
} from "@/features/sidequests/services/sidequestLifecycleService";
import {
  createNoopServiceWorkerBoundary,
  createPromptServiceWorkerBoundary,
  type ServiceWorkerBoundary,
} from "@/lib/pwa/serviceWorkerBoundary";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type AppServices = {
  config: AppConfig;
  data: DataProviderBundle;
  location: LocationProvider;
  map: MapProvider;
  mapRecords: { primary: MapRecordProvider; sample: MapRecordProvider; cache: MapRecordCache; interactions: LocalInteractionRepository };
  proximity: ProximityProvider;
  sync: SyncRepository;
  syncService: SyncService;
  auth: AuthProvider;
  localIdentity: LocalUserIdentityRepository;
  storage: OfflineStorageAdapter;
  pwa: ServiceWorkerBoundary;
  questCompletions: QuestCompletionRepository;
  sidequestLifecycle: SidequestLifecycleService;
};

const AppServicesContext = createContext<AppServices | null>(null);

export function createAppServices(
  rawEnv?: Record<string, unknown>,
  options?: { pwa?: ServiceWorkerBoundary },
): AppServices {
  const config = loadAppConfig(rawEnv);
  const sampleMapRecords = createSampleMapRecordProvider();
  const supabase = createSupabaseBrowserClient(config.env);
  const data = createDataProviders(config.env);
  const packRepository = createIndexedDbPlayaPackRepository();
  const map: MapProvider = createAppMapProvider({
    playaPacks: data.playaPacks,
    packRepository,
    preferSampleWhenNoPack: config.env.VITE_MAP_SOURCE !== "remote",
  });
  const questCompletions = createIndexedDbQuestCompletionRepository();
  const sidequestLifecycle = createSidequestLifecycleService({
    sidequests: data.sidequests,
    progress: createIndexedDbSidequestProgressRepository(),
  });
  const sync = createIndexedDbSyncRepository();
  const auth: AuthProvider =
    data.remoteSyncEnabled && supabase
      ? createSupabaseAuthProvider(supabase)
      : createAnonymousAuthProvider();
  const remote =
    data.remoteSyncEnabled && supabase
      ? createSupabaseRemoteSyncAdapter(supabase)
      : createNoopRemoteSyncAdapter();
  const syncService = createSyncService({
    repository: sync,
    remote,
    auth,
  });
  const primaryMapRecords =
    data.remoteSyncEnabled && supabase
      ? createCombinedMapRecordProvider(sampleMapRecords, createSupabaseSharedBeaconProvider(supabase))
      : sampleMapRecords;

  return {
    config,
    data,
    location: createBrowserLocationProvider(),
    map,
    mapRecords: {
      // Catalog reads are intentionally sample/local-first even when Supabase sync is enabled.
      primary: primaryMapRecords,
      sample: sampleMapRecords,
      cache: createIndexedDbMapRecordCache(),
      interactions: createIndexedDbInteractionRepository(),
    },
    proximity: createGpsProximityProvider(),
    sync,
    syncService,
    auth,
    localIdentity: createIndexedDbLocalUserIdentityRepository(),
    storage: createMemoryStorageAdapter(),
    pwa: options?.pwa ?? createPromptServiceWorkerBoundary(),
    questCompletions,
    sidequestLifecycle,
  };
}

/** Test helper — keeps sample mode and skips real SW registration. */
export function createTestAppServices(rawEnv?: Record<string, unknown>): AppServices {
  return createAppServices(
    rawEnv ?? { VITE_APP_ENV: "development", VITE_DATA_PROVIDER: "sample", VITE_MAP_SOURCE: "sample" },
    { pwa: createNoopServiceWorkerBoundary() },
  );
}

function SyncRuntime({ children }: { children: ReactNode }) {
  const { syncService } = useAppServices();
  useEffect(() => {
    return syncService.start();
  }, [syncService]);
  return children;
}

export function AppProviders({
  children,
  services,
}: {
  children: ReactNode;
  services?: AppServices;
}) {
  const value = services ?? createAppServices();
  return createElement(
    AppServicesContext.Provider,
    { value },
    createElement(
      LocalIdentityProvider,
      {
        repository: value.localIdentity,
        children: createElement(
          ForegroundLocationProvider,
          {
            location: value.location,
            children: createElement(SyncRuntime, null, children),
          },
        ),
      },
    ),
  );
}

export function useAppServices(): AppServices {
  const ctx = useContext(AppServicesContext);
  if (!ctx) {
    throw new Error("useAppServices must be used within AppProviders");
  }
  return ctx;
}
