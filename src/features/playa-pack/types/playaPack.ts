import { z } from "zod";
import type { Sidequest } from "@/features/sidequests/types/sidequest";
import { sidequestSchema } from "@/features/sidequests/types/sidequest";
import { PLAYA_PACK_FORMAT_VERSION } from "@/lib/pwa/versioning";

export const playaPackFileRoleSchema = z.enum(["sidequests", "event", "map_ref", "other"]);
export type PlayaPackFileRole = z.infer<typeof playaPackFileRoleSchema>;

export const playaPackFileMetaSchema = z.object({
  path: z.string().min(1),
  role: playaPackFileRoleSchema,
  byteSize: z.number().int().nonnegative(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});
export type PlayaPackFileMeta = z.infer<typeof playaPackFileMetaSchema>;

export const playaPackManifestSchema = z
  .object({
    packId: z.string().min(1),
    name: z.string().min(1),
    eventYear: z.number().int().nullable(),
    formatVersion: z.string().min(1),
    contentVersion: z.string().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    files: z.array(playaPackFileMetaSchema).min(1),
    totalByteSize: z.number().int().nonnegative(),
    mapPackageId: z.string().nullable(),
    description: z.string().optional(),
  })
  .superRefine((manifest, ctx) => {
    const sum = manifest.files.reduce((acc, file) => acc + file.byteSize, 0);
    if (sum !== manifest.totalByteSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `totalByteSize ${manifest.totalByteSize} does not match file sum ${sum}`,
        path: ["totalByteSize"],
      });
    }
  });

export type PlayaPackManifest = z.infer<typeof playaPackManifestSchema>;

export const playaPackCatalogEntrySchema = z.object({
  packId: z.string().min(1),
  name: z.string().min(1),
  eventYear: z.number().int().nullable(),
  contentVersion: z.string().min(1),
  formatVersion: z.string().min(1),
  estimatedByteSize: z.number().int().nonnegative(),
  manifestUrl: z.string().min(1),
});
export type PlayaPackCatalogEntry = z.infer<typeof playaPackCatalogEntrySchema>;

export const playaPackCatalogSchema = z.object({
  packs: z.array(playaPackCatalogEntrySchema),
});

export const packSidequestsPayloadSchema = z.object({
  packId: z.string().min(1),
  contentVersion: z.string().min(1),
  sidequests: z.array(sidequestSchema),
});
export type PackSidequestsPayload = z.infer<typeof packSidequestsPayloadSchema>;

export const packEventPayloadSchema = z.object({
  packId: z.string().min(1),
  contentVersion: z.string().min(1),
  eventName: z.string().min(1),
  eventYear: z.number().int().nullable(),
  timezone: z.string().optional(),
  gatesOpenAt: z.string().datetime().optional(),
  notes: z.array(z.string()).optional(),
});
export type PackEventPayload = z.infer<typeof packEventPayloadSchema>;

export function parsePlayaPackManifest(data: unknown): PlayaPackManifest {
  return playaPackManifestSchema.parse(data);
}

export function assertSupportedPackFormat(manifest: PlayaPackManifest): void {
  if (manifest.formatVersion !== PLAYA_PACK_FORMAT_VERSION) {
    throw new Error(
      `Unsupported pack format ${manifest.formatVersion}; expected ${PLAYA_PACK_FORMAT_VERSION}`,
    );
  }
}

export type PlayaPackInstallStatus = "incomplete" | "ready" | "active" | "failed";

export type LocalPlayaPackRecord = {
  packId: string;
  name: string;
  eventYear: number | null;
  formatVersion: string;
  contentVersion: string | null;
  status: PlayaPackInstallStatus;
  manifest: PlayaPackManifest | null;
  bytesReceived: number;
  bytesTotal: number;
  lastError: string | null;
  downloadedAt: string | null;
  activatedAt: string | null;
  lastUpdatedAt: string;
  storagePersisted: boolean | null;
};

export type LocalPlayaPackFileRecord = {
  /** Composite key: `${packId}::${path}` */
  id: string;
  packId: string;
  path: string;
  role: PlayaPackFileRole;
  byteSize: number;
  expectedChecksumSha256: string;
  /** Bytes received so far; may be less than byteSize while incomplete. */
  receivedBytes: number;
  complete: boolean;
  /** Raw file bytes when present. */
  data: ArrayBuffer | null;
};

export type ActivePlayaPackPointer = {
  key: "current";
  packId: string;
  contentVersion: string;
  activatedAt: string;
};

/** Domain summary used by EventDataProvider / UI once a pack is known. */
export type PlayaPack = {
  id: string;
  name: string;
  eventYear: number | null;
  formatVersion: string;
  contentVersion: string | null;
  sidequestIds: string[];
  mapPackageId: string | null;
  createdAt: string;
  status?: PlayaPackInstallStatus;
};

export type PlayaPackDownloadProgress = {
  packId: string;
  bytesReceived: number;
  bytesTotal: number;
  fraction: number;
  currentFile: string | null;
  status: PlayaPackInstallStatus;
};

/** Consumer-facing offer for a pack that contains genuine offline map tiles. */
export type OfflineMapOffer = {
  packId: string;
  name: string;
  eventYear: number | null;
  contentVersion: string;
  totalByteSize: number;
};

export type PlayaPackReadinessView = {
  catalog: PlayaPackCatalogEntry[];
  installed: LocalPlayaPackRecord[];
  activePackId: string | null;
  storagePersisted: boolean | null;
  storageEstimateBytes: number | null;
  storageQuotaBytes: number | null;
  notes: string[];
};

export interface EventDataProvider {
  getPack(): Promise<PlayaPack>;
  getSidequests(): Promise<Sidequest[]>;
  readonly source: "sample" | "supabase" | "official_api" | "installed_pack";
}

export interface PlayaPackCatalogProvider {
  listAvailable(): Promise<PlayaPackCatalogEntry[]>;
  fetchManifest(manifestUrl: string): Promise<PlayaPackManifest>;
  fetchFile(baseManifestUrl: string, relativePath: string): Promise<ArrayBuffer>;
}

export function packFileKey(packId: string, path: string): string {
  return `${packId}::${path}`;
}

/** Staging path prefix so an active pack's validated blobs stay intact until activation. */
export const PACK_STAGING_PREFIX = "__staging__/";

export function stagingPackPath(path: string): string {
  return `${PACK_STAGING_PREFIX}${path}`;
}

export function isStagingPackPath(path: string): boolean {
  return path.startsWith(PACK_STAGING_PREFIX);
}

export function finalPackPathFromStaging(path: string): string {
  return isStagingPackPath(path) ? path.slice(PACK_STAGING_PREFIX.length) : path;
}
