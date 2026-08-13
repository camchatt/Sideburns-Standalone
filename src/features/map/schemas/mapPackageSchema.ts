import { z } from "zod";
import { SIDEBURNS_MAP_FORMAT_VERSION } from "@/lib/pwa/versioning";

export const mapPackageBoundsSchema = z.object({
  north: z.number(),
  south: z.number(),
  east: z.number(),
  west: z.number(),
});

export const mapPackageAssetSchema = z.object({
  path: z.string().min(1),
  role: z.enum(["pmtiles", "style", "other"]),
  byteSize: z.number().int().nonnegative(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

/**
 * Versioned offline map package descriptor (MapLibre style ± optional PMTiles assets).
 * Validated at pack import / MapProvider load boundaries — never trust pack JSON blindly.
 */
export const mapPackageSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    formatVersion: z.string().min(1),
    contentVersion: z.string().min(1),
    engine: z.enum(["maplibre", "maplibre-pmtiles"]),
    bounds: mapPackageBoundsSchema.optional(),
    center: z.tuple([z.number(), z.number()]).optional(),
    zoom: z.number().optional(),
    minZoom: z.number().optional(),
    maxZoom: z.number().optional(),
    assets: z.array(mapPackageAssetSchema).default([]),
    /** MapLibre style object (v8). Kept as a loose record; MapLibre validates at runtime. */
    style: z
      .object({
        version: z.literal(8),
        sources: z.record(z.unknown()),
        layers: z.array(z.record(z.unknown())).min(1),
      })
      .passthrough(),
    notes: z.string().optional(),
  })
  .superRefine((pkg, ctx) => {
    if (pkg.engine === "maplibre-pmtiles") {
      const hasPmtiles = pkg.assets.some((asset) => asset.role === "pmtiles");
      if (!hasPmtiles) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "maplibre-pmtiles packages require at least one pmtiles asset",
          path: ["assets"],
        });
      }
    }
  });

export type MapPackageDocument = z.infer<typeof mapPackageSchema>;
export type MapPackageAsset = z.infer<typeof mapPackageAssetSchema>;

export function parseMapPackage(data: unknown): MapPackageDocument {
  return mapPackageSchema.parse(data);
}

export function assertSupportedMapFormat(pkg: MapPackageDocument): void {
  if (pkg.formatVersion !== SIDEBURNS_MAP_FORMAT_VERSION) {
    throw new Error(
      `Unsupported map format ${pkg.formatVersion}; expected ${SIDEBURNS_MAP_FORMAT_VERSION}`,
    );
  }
}

export function validateMapPackageForUse(data: unknown): MapPackageDocument {
  const pkg = parseMapPackage(data);
  assertSupportedMapFormat(pkg);
  return pkg;
}
