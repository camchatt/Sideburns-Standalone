import type { OfflineStorageAdapter } from "@/features/offline/types/offline";

/** Placeholder local storage adapter. Replace with IndexedDB-backed storage later. */
export function createMemoryStorageAdapter(seed: Record<string, string> = {}): OfflineStorageAdapter {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    async getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
    async removeItem(key) {
      store.delete(key);
    },
  };
}
