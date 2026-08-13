import {
  DEFAULT_PLAYA_CENTER,
  DEFAULT_PLAYA_ZOOM,
  type MapBasemapResource,
  type MapDataHandle,
} from "@/features/map/types/map";

/** MapLibre-compatible style built from a resolved MapProvider resource. */
export function styleFromMapResource(resource: MapBasemapResource): {
  style: Record<string, unknown>;
  center: [number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
} {
  const center = ("center" in resource && resource.center) || DEFAULT_PLAYA_CENTER;
  const zoom = ("zoom" in resource && resource.zoom) || DEFAULT_PLAYA_ZOOM;
  const minZoom = ("minZoom" in resource && resource.minZoom) || 11;
  const maxZoom = ("maxZoom" in resource && resource.maxZoom) || 18;

  if (resource.type === "maplibre-style") {
    return {
      style: rewritePmtilesUrls(resource.style, resource.pmtilesBlobUrls),
      center: resource.center ?? center,
      zoom: resource.zoom ?? zoom,
      minZoom: resource.minZoom ?? minZoom,
      maxZoom: resource.maxZoom ?? maxZoom,
    };
  }

  if (resource.type === "remote-raster") {
    const sources: Record<string, unknown> = {};
    const layers: Record<string, unknown>[] = [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#2a241c" },
      },
    ];
    resource.tileUrls.forEach((url, index) => {
      const sourceId = `remote-raster-${index}`;
      sources[sourceId] = {
        type: "raster",
        tiles: [url],
        tileSize: 256,
        attribution: resource.attribution,
      };
      layers.push({
        id: `${sourceId}-layer`,
        type: "raster",
        source: sourceId,
        paint:
          index === 0
            ? {}
            : index === 1
              ? { "raster-opacity": 0.82 }
              : { "raster-opacity": 0.7 },
      });
    });
    return {
      style: { version: 8, name: "SIDEBURNS online fallback", sources, layers },
      center,
      zoom,
      minZoom,
      maxZoom,
    };
  }

  return {
    style: {
      version: 8,
      name: "SIDEBURNS vector fallback",
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#2a241c" },
        },
      ],
    },
    center,
    zoom,
    minZoom,
    maxZoom,
  };
}

/**
 * Rewrite `pmtiles://asset-path` sources so Protocol can resolve registered local archives.
 * Blob object URLs are registered separately under the asset path key.
 */
function rewritePmtilesUrls(
  style: Record<string, unknown>,
  pmtilesBlobUrls?: Record<string, string>,
): Record<string, unknown> {
  if (!pmtilesBlobUrls || Object.keys(pmtilesBlobUrls).length === 0) {
    return style;
  }
  const sources = style.sources;
  if (!sources || typeof sources !== "object") return style;
  const nextSources: Record<string, unknown> = {};
  for (const [id, source] of Object.entries(sources as Record<string, unknown>)) {
    if (!source || typeof source !== "object") {
      nextSources[id] = source;
      continue;
    }
    const record = { ...(source as Record<string, unknown>) };
    if (typeof record.url === "string" && record.url.startsWith("pmtiles://")) {
      const path = record.url.slice("pmtiles://".length).replace(/^\//, "");
      if (pmtilesBlobUrls[path]) {
        // Protocol looks up by getKey(); we register under the asset path.
        record.url = `pmtiles://${path}`;
      }
    }
    nextSources[id] = record;
  }
  return { ...style, sources: nextSources };
}

export function sessionStatusLabel(session: MapDataHandle): string {
  return session.message;
}
