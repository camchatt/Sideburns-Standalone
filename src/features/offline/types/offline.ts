export type OfflineReadinessStatus = {
  appShellReady: boolean;
  playaPackReady: boolean;
  storagePersisted: boolean | null;
  locationPermission: "prompt" | "granted" | "denied" | "unsupported" | "unknown";
  syncHealthy: boolean;
  notes: string[];
  updatedAt: string;
};

export type OfflineStorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
