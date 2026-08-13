import { z } from "zod";
import {
  assertSupportedPackFormat,
  packEventPayloadSchema,
  packSidequestsPayloadSchema,
  parsePlayaPackManifest,
  playaPackCatalogSchema,
  type PackEventPayload,
  type PackSidequestsPayload,
  type PlayaPackCatalogEntry,
  type PlayaPackManifest,
} from "@/features/playa-pack/types/playaPack";
import type { Sidequest } from "@/features/sidequests/types/sidequest";
import { parseSidequest } from "@/features/sidequests/types/sidequest";

export {
  playaPackManifestSchema,
  playaPackCatalogSchema,
  playaPackFileMetaSchema,
  packSidequestsPayloadSchema,
  packEventPayloadSchema,
  parsePlayaPackManifest,
  assertSupportedPackFormat,
} from "@/features/playa-pack/types/playaPack";

export function parsePlayaPackCatalog(data: unknown): PlayaPackCatalogEntry[] {
  return playaPackCatalogSchema.parse(data).packs;
}

export function parsePackSidequestsPayload(data: unknown): PackSidequestsPayload {
  return packSidequestsPayloadSchema.parse(data);
}

export function parsePackEventPayload(data: unknown): PackEventPayload {
  return packEventPayloadSchema.parse(data);
}

export function decodeJsonArrayBuffer(buffer: ArrayBuffer): unknown {
  const text = new TextDecoder("utf-8").decode(buffer);
  return JSON.parse(text) as unknown;
}

export function parseSidequestsFromPackFile(buffer: ArrayBuffer): Sidequest[] {
  const payload = parsePackSidequestsPayload(decodeJsonArrayBuffer(buffer));
  return payload.sidequests.map((quest) => parseSidequest(quest));
}

export function validateManifestForInstall(data: unknown): PlayaPackManifest {
  const manifest = parsePlayaPackManifest(data);
  assertSupportedPackFormat(manifest);
  return manifest;
}

/** Narrow helper for tests / adapters that only need catalog shape. */
export const catalogUrlSchema = z.string().min(1);
