import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { LEGACY_INDEXED_DB_NAME } from "@/lib/branding";
import type { LocalInteraction, MapRecordSnapshot } from "@/features/map/types/mapRecord";
import type {
  ActivePlayaPackPointer,
  LocalPlayaPackFileRecord,
  LocalPlayaPackRecord,
} from "@/features/playa-pack/types/playaPack";
import type {
  QuestCompletion,
  Sidequest,
  SidequestProgress,
} from "@/features/sidequests/types/sidequest";
import {
  createStableClientId,
  parseQuestCompletion,
  parseSidequestProgress,
} from "@/features/sidequests/types/sidequest";
import type { LocalUserIdentity } from "@/features/identity/types/identity";
import type { SyncOperation } from "@/features/sync/types/sync";

/** @deprecated Prefer LEGACY_INDEXED_DB_NAME — kept as alias for existing imports/tests. */
export const PLAYA_DATABASE_NAME = LEGACY_INDEXED_DB_NAME;
/** v7: anonymous local user identity (`localUserIdentity`) for creator attribution. */
export const PLAYA_DATABASE_VERSION = 7;

interface PlayaDatabase extends DBSchema {
  mapRecordCache: { key: string; value: MapRecordSnapshot };
  interactions: { key: string; value: LocalInteraction & { recordId: string } };
  sidequests: { key: string; value: Sidequest };
  questCompletions: { key: string; value: QuestCompletion; indexes: { sidequestId: string } };
  sidequestProgress: { key: string; value: SidequestProgress; indexes: { sidequestId: string } };
  playaPackMeta: { key: string; value: LocalPlayaPackRecord };
  playaPackFiles: { key: string; value: LocalPlayaPackFileRecord; indexes: { packId: string } };
  playaPackActive: { key: string; value: ActivePlayaPackPointer };
  /** Official pack sidequests only — never mixed with user-created `sidequests` rows. */
  packSidequests: { key: string; value: Sidequest; indexes: { packId: string } };
  /** Deferred sync outbox — preserved across reloads, SW updates, and auth changes. */
  syncOutbox: {
    key: string;
    value: SyncOperation;
    indexes: { status: string; nextAttemptAt: string };
  };
  /** Single-row anonymous local identity (keyed as `current`). */
  localUserIdentity: { key: string; value: LocalUserIdentity };
}

let databasePromise: Promise<IDBPDatabase<PlayaDatabase>> | null = null;

export function getPlayaDatabase(): Promise<IDBPDatabase<PlayaDatabase>> {
  databasePromise ??= openDB<PlayaDatabase>(PLAYA_DATABASE_NAME, PLAYA_DATABASE_VERSION, {
    async upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        database.createObjectStore("mapRecordCache");
        database.createObjectStore("interactions", { keyPath: "recordId" });
      }
      if (oldVersion < 2) {
        if (!database.objectStoreNames.contains("sidequests")) {
          database.createObjectStore("sidequests", { keyPath: "id" });
        }
      }
      if (oldVersion < 3 && !database.objectStoreNames.contains("questCompletions")) {
        const completions = database.createObjectStore("questCompletions", { keyPath: "id" });
        completions.createIndex("sidequestId", "sidequestId", { unique: true });
      }
      if (oldVersion < 4) {
        if (!database.objectStoreNames.contains("playaPackMeta")) {
          database.createObjectStore("playaPackMeta", { keyPath: "packId" });
        }
        if (!database.objectStoreNames.contains("playaPackFiles")) {
          const files = database.createObjectStore("playaPackFiles", { keyPath: "id" });
          files.createIndex("packId", "packId", { unique: false });
        }
        if (!database.objectStoreNames.contains("playaPackActive")) {
          database.createObjectStore("playaPackActive", { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains("packSidequests")) {
          const packQuests = database.createObjectStore("packSidequests", { keyPath: "id" });
          packQuests.createIndex("packId", "packId", { unique: false });
        }
      }
      if (oldVersion < 5) {
        if (!database.objectStoreNames.contains("sidequestProgress")) {
          const progress = database.createObjectStore("sidequestProgress", { keyPath: "id" });
          progress.createIndex("sidequestId", "sidequestId", { unique: true });
        }

        // Backfill inside the upgrade transaction so incomplete ≠ migrated.
        const completionsStore = transaction.objectStore("questCompletions");
        const progressStore = transaction.objectStore("sidequestProgress");
        const rows = await completionsStore.getAll();
        for (const raw of rows) {
          const completion = parseQuestCompletion(raw);
          const existing = await progressStore.index("sidequestId").get(completion.sidequestId);
          if (existing) continue;
          const now = completion.completedAt;
          progressStore.put(
            parseSidequestProgress({
              id: createStableClientId("qp"),
              sidequestId: completion.sidequestId,
              phase: "completed",
              savedAt: now,
              begunAt: now,
              completedAt: completion.completedAt,
              notes: completion.notes ?? null,
              syncStatus: completion.syncStatus,
              updatedAt: now,
            }),
          );
        }
      }
      if (oldVersion < 6 && !database.objectStoreNames.contains("syncOutbox")) {
        const outbox = database.createObjectStore("syncOutbox", { keyPath: "id" });
        outbox.createIndex("status", "status", { unique: false });
        outbox.createIndex("nextAttemptAt", "nextAttemptAt", { unique: false });
      }
      if (oldVersion < 7 && !database.objectStoreNames.contains("localUserIdentity")) {
        database.createObjectStore("localUserIdentity");
      }
    },
  });
  return databasePromise;
}

export async function closePlayaDatabaseForTests(): Promise<void> {
  if (!databasePromise) return;
  const database = await databasePromise;
  database.close();
  databasePromise = null;
}
