export type PersistentStorageResult = {
  supported: boolean;
  /** `null` when the Persistence API is unavailable. */
  persisted: boolean | null;
};

/** Read current persistence state without prompting. */
export async function queryPersistentStorage(
  storage: Pick<StorageManager, "persisted"> | undefined = navigator.storage,
): Promise<PersistentStorageResult> {
  if (!storage || typeof storage.persisted !== "function") {
    return { supported: false, persisted: null };
  }
  try {
    return { supported: true, persisted: await storage.persisted() };
  } catch {
    return { supported: true, persisted: false };
  }
}

/**
 * Request persistent storage for large pack downloads.
 * Denial is non-fatal — callers should surface it in readiness UI.
 */
export async function requestPersistentStorage(
  storage: Pick<StorageManager, "persist" | "persisted"> | undefined = navigator.storage,
): Promise<PersistentStorageResult> {
  if (!storage || typeof storage.persist !== "function") {
    return { supported: false, persisted: null };
  }

  try {
    const already = typeof storage.persisted === "function" ? await storage.persisted() : false;
    if (already) return { supported: true, persisted: true };
    const granted = await storage.persist();
    return { supported: true, persisted: granted };
  } catch {
    return { supported: true, persisted: false };
  }
}

export type StorageEstimate = {
  usageBytes: number | null;
  quotaBytes: number | null;
};

export async function estimateStorage(
  storage: Pick<StorageManager, "estimate"> | undefined = navigator.storage,
): Promise<StorageEstimate> {
  if (!storage || typeof storage.estimate !== "function") {
    return { usageBytes: null, quotaBytes: null };
  }
  try {
    const estimate = await storage.estimate();
    return {
      usageBytes: typeof estimate.usage === "number" ? estimate.usage : null,
      quotaBytes: typeof estimate.quota === "number" ? estimate.quota : null,
    };
  } catch {
    return { usageBytes: null, quotaBytes: null };
  }
}
