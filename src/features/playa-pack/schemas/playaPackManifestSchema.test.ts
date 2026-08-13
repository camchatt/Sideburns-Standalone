import { describe, expect, it } from "vitest";
import {
  parsePlayaPackManifest,
  parsePlayaPackCatalog,
  assertSupportedPackFormat,
} from "@/features/playa-pack/schemas/playaPackManifestSchema";
import { PLAYA_PACK_FORMAT_VERSION } from "@/lib/pwa/versioning";

describe("playa pack manifest schema", () => {
  it("accepts a valid manifest and rejects byte-size drift", () => {
    const valid = {
      packId: "pack_x",
      name: "X",
      eventYear: 2026,
      formatVersion: PLAYA_PACK_FORMAT_VERSION,
      contentVersion: "1.0.0",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      files: [
        {
          path: "sidequests.json",
          role: "sidequests",
          byteSize: 10,
          checksumSha256: "a".repeat(64),
        },
      ],
      totalByteSize: 10,
      mapPackageId: null,
    };
    expect(parsePlayaPackManifest(valid).packId).toBe("pack_x");
    expect(() => parsePlayaPackManifest({ ...valid, totalByteSize: 11 })).toThrow(/totalByteSize/);
  });

  it("parses catalog entries", () => {
    const packs = parsePlayaPackCatalog({
      packs: [
        {
          packId: "pack_x",
          name: "X",
          eventYear: 2026,
          contentVersion: "1.0.0",
          formatVersion: PLAYA_PACK_FORMAT_VERSION,
          estimatedByteSize: 12,
          manifestUrl: "/packs/x/manifest.json",
        },
      ],
    });
    expect(packs).toHaveLength(1);
  });

  it("rejects unsupported format versions", () => {
    expect(() =>
      assertSupportedPackFormat({
        packId: "pack_x",
        name: "X",
        eventYear: 2026,
        formatVersion: "playa-pack-9.9.9",
        contentVersion: "1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        files: [
          {
            path: "sidequests.json",
            role: "sidequests",
            byteSize: 1,
            checksumSha256: "b".repeat(64),
          },
        ],
        totalByteSize: 1,
        mapPackageId: null,
      }),
    ).toThrow(/Unsupported pack format/);
  });
});
