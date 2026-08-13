import {
  createLocalUserIdentity,
  LOCAL_USER_IDENTITY_KEY,
  parseLocalUserIdentity,
  type LocalUserIdentity,
} from "@/features/identity/types/identity";
import { getPlayaDatabase } from "@/lib/storage/playaDatabase";

export type LocalUserIdentityRepository = {
  get(): Promise<LocalUserIdentity | null>;
  /** Creates identity once; subsequent calls return the existing row. */
  create(displayName: string): Promise<LocalUserIdentity>;
  updateDisplayName(displayName: string): Promise<LocalUserIdentity>;
};

export function createIndexedDbLocalUserIdentityRepository(): LocalUserIdentityRepository {
  return {
    async get() {
      const db = await getPlayaDatabase();
      const row = await db.get("localUserIdentity", LOCAL_USER_IDENTITY_KEY);
      return row ? parseLocalUserIdentity(row) : null;
    },
    async create(displayName) {
      const db = await getPlayaDatabase();
      const existing = await db.get("localUserIdentity", LOCAL_USER_IDENTITY_KEY);
      if (existing) return parseLocalUserIdentity(existing);
      const identity = createLocalUserIdentity(displayName);
      await db.put("localUserIdentity", identity, LOCAL_USER_IDENTITY_KEY);
      return identity;
    },
    async updateDisplayName(displayName) {
      const db = await getPlayaDatabase();
      const existing = await db.get("localUserIdentity", LOCAL_USER_IDENTITY_KEY);
      if (!existing) {
        return this.create(displayName);
      }
      const current = parseLocalUserIdentity(existing);
      const next = parseLocalUserIdentity({
        ...current,
        displayName: displayName.trim(),
        updatedAt: new Date().toISOString(),
      });
      await db.put("localUserIdentity", next, LOCAL_USER_IDENTITY_KEY);
      return next;
    },
  };
}
