import { describe, expect, it } from "vitest";
import {
  assertSupportedMapFormat,
  parseMapPackage,
  validateMapPackageForUse,
} from "@/features/map/schemas/mapPackageSchema";
import { SIDEBURNS_MAP_FORMAT_VERSION } from "@/lib/pwa/versioning";

const validPackage = {
  id: "bm-2026-demo-map",
  label: "Demo",
  formatVersion: SIDEBURNS_MAP_FORMAT_VERSION,
  contentVersion: "2026.1.0",
  engine: "maplibre" as const,
  assets: [],
  style: {
    version: 8 as const,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": "#2a241c" } }],
  },
};

describe("map package schema", () => {
  it("accepts a supported MapLibre package", () => {
    const pkg = validateMapPackageForUse(validPackage);
    expect(pkg.id).toBe("bm-2026-demo-map");
    expect(pkg.engine).toBe("maplibre");
  });

  it("rejects unsupported format versions", () => {
    expect(() =>
      assertSupportedMapFormat({
        ...parseMapPackage(validPackage),
        formatVersion: "sideburn-map-9.9.9",
      }),
    ).toThrow(/Unsupported map format/);
  });

  it("requires pmtiles assets for maplibre-pmtiles engine", () => {
    expect(() =>
      parseMapPackage({
        ...validPackage,
        engine: "maplibre-pmtiles",
        assets: [],
      }),
    ).toThrow(/pmtiles asset/);
  });
});
