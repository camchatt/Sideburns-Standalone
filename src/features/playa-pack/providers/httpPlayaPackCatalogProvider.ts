import {
  parsePlayaPackCatalog,
  validateManifestForInstall,
  decodeJsonArrayBuffer,
  parseSidequestsFromPackFile,
} from "@/features/playa-pack/schemas/playaPackManifestSchema";
import type {
  PlayaPackCatalogEntry,
  PlayaPackCatalogProvider,
  PlayaPackManifest,
} from "@/features/playa-pack/types/playaPack";

const DEFAULT_CATALOG_URL = "/packs/catalog.json";

function resolveFileUrl(manifestUrl: string, relativePath: string): string {
  const base = new URL(manifestUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  // Manifest sits beside pack files; resolve relative to its directory.
  const dir = base.pathname.endsWith("/") ? base.pathname : base.pathname.replace(/[^/]+$/, "");
  return new URL(relativePath, `${base.origin}${dir}`).toString();
}

export function createHttpPlayaPackCatalogProvider(
  options: { catalogUrl?: string; fetchImpl?: typeof fetch } = {},
): PlayaPackCatalogProvider {
  const catalogUrl = options.catalogUrl ?? DEFAULT_CATALOG_URL;
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);

  return {
    async listAvailable(): Promise<PlayaPackCatalogEntry[]> {
      const response = await fetchImpl(catalogUrl, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Failed to load pack catalog (${response.status})`);
      }
      return parsePlayaPackCatalog(await response.json());
    },

    async fetchManifest(manifestUrl: string): Promise<PlayaPackManifest> {
      const response = await fetchImpl(manifestUrl, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Failed to load pack manifest (${response.status})`);
      }
      return validateManifestForInstall(await response.json());
    },

    async fetchFile(baseManifestUrl: string, relativePath: string): Promise<ArrayBuffer> {
      const url = resolveFileUrl(baseManifestUrl, relativePath);
      const response = await fetchImpl(url, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Failed to download pack file ${relativePath} (${response.status})`);
      }
      return response.arrayBuffer();
    },
  };
}

export { decodeJsonArrayBuffer, parseSidequestsFromPackFile, resolveFileUrl };
