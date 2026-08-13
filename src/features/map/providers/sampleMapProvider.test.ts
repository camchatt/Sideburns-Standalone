import { describe, expect, it } from "vitest";
import { createSampleMapProvider } from "@/features/map/providers/sampleMapProvider";
import { remoteRasterResource } from "@/features/map/services/mapSessionHelpers";

describe("sampleMapProvider", () => {
  it("resolves a lightweight offline sample basemap without network tiles", async () => {
    const provider = createSampleMapProvider();
    const session = await provider.resolveSession({ online: false });
    expect(session.status).toBe("sample");
    expect(session.mode).toBe("offline_style");
    expect(session.resource.type).toBe("maplibre-style");
    expect(session.descriptor.id).toBe("sample-playa-basemap");
  });

  it("lists and loads the sample package", async () => {
    const provider = createSampleMapProvider();
    const listed = await provider.listPackages();
    expect(listed).toHaveLength(1);
    const loaded = await provider.loadPackage("sample-playa-basemap");
    expect(loaded.status).toBe("sample");
  });

  it("uses CORS-friendly Esri CDN URLs for online fallback (no host tile proxy)", () => {
    const resource = remoteRasterResource();
    expect(resource.type).toBe("remote-raster");
    if (resource.type !== "remote-raster") return;
    expect(resource.tileUrls).toHaveLength(2);
    expect(resource.tileUrls.every((url) => url.startsWith("https://server.arcgisonline.com/"))).toBe(
      true,
    );
  });
});
