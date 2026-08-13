import {
  DEFAULT_PLAYA_CENTER,
  DEFAULT_PLAYA_ZOOM,
  ONLINE_FALLBACK_RASTER_TILES,
  type MapBasemapResource,
  type MapDataHandle,
  type MapPackageDescriptor,
  type MapSessionStatus,
} from "@/features/map/types/map";
import type { MapPackageDocument } from "@/features/map/schemas/mapPackageSchema";
import { SIDEBURNS_MAP_FORMAT_VERSION } from "@/lib/pwa/versioning";

export function descriptorFromDocument(
  pkg: MapPackageDocument,
  kind: MapPackageDescriptor["kind"],
  uri: string,
): MapPackageDescriptor {
  return {
    id: pkg.id,
    label: pkg.label,
    kind,
    uri,
    version: pkg.contentVersion,
    formatVersion: pkg.formatVersion,
    bounds: pkg.bounds
      ? {
          north: pkg.bounds.north,
          south: pkg.bounds.south,
          east: pkg.bounds.east,
          west: pkg.bounds.west,
        }
      : undefined,
  };
}

export function sampleDescriptor(): MapPackageDescriptor {
  return {
    id: "sample-playa-basemap",
    label: "Sample playa basemap",
    kind: "sample",
    uri: "/maps/sample-basemap.json",
    version: "0.0.1",
    formatVersion: SIDEBURNS_MAP_FORMAT_VERSION,
    bounds: { north: 40.807, south: 40.75, east: -119.17, west: -119.27 },
  };
}

export function fallbackDescriptor(status: MapSessionStatus): MapPackageDescriptor {
  return {
    id: `fallback-${status}`,
    label: "Temporary basemap",
    kind: status === "online_fallback" ? "remote" : "sample",
    uri: status === "online_fallback" ? "remote:esri-imagery" : "local:vector-fallback",
    version: "0.0.0",
    formatVersion: SIDEBURNS_MAP_FORMAT_VERSION,
    bounds: { north: 40.807, south: 40.75, east: -119.17, west: -119.27 },
  };
}

export function offlineStyleResource(pkg: MapPackageDocument, pmtilesBlobUrls?: Record<string, string>): MapBasemapResource {
  const center: [number, number] = pkg.center
    ? [pkg.center[0], pkg.center[1]]
    : DEFAULT_PLAYA_CENTER;
  return {
    type: "maplibre-style",
    style: pkg.style as Record<string, unknown>,
    pmtilesBlobUrls,
    center,
    zoom: pkg.zoom ?? DEFAULT_PLAYA_ZOOM,
    minZoom: pkg.minZoom,
    maxZoom: pkg.maxZoom,
  };
}

export function remoteRasterResource(): MapBasemapResource {
  return {
    type: "remote-raster",
    tileUrls: [...ONLINE_FALLBACK_RASTER_TILES],
    attribution: "© Esri · Earthstar Geographics",
    center: DEFAULT_PLAYA_CENTER,
    zoom: DEFAULT_PLAYA_ZOOM,
    minZoom: 12,
    maxZoom: 18,
  };
}

export function vectorFallbackResource(reason: MapSessionStatus): MapBasemapResource {
  return {
    type: "vector-fallback",
    reason,
    center: DEFAULT_PLAYA_CENTER,
    zoom: DEFAULT_PLAYA_ZOOM,
    minZoom: 12,
    maxZoom: 18,
  };
}

export function statusMessage(status: MapSessionStatus): string {
  switch (status) {
    case "sample":
      return "Sample offline basemap (no pack required).";
    case "installed_offline":
      return "Installed offline map from active playa pack.";
    case "online_fallback":
      return "Temporary online satellite basemap — download a playa pack for offline tiles.";
    case "missing_pack":
      return "No offline map installed. Markers remain usable on the vector fallback.";
    case "corrupted_pack":
      return "Offline map data failed validation and will not be used.";
    case "unsupported_format":
      return "Installed map package format is unsupported on this app version.";
    default:
      return "Map basemap status unknown.";
  }
}

export function buildHandle(input: {
  descriptor: MapPackageDescriptor;
  status: MapSessionStatus;
  mode: MapDataHandle["mode"];
  resource: MapBasemapResource;
  message?: string;
}): MapDataHandle {
  return {
    descriptor: input.descriptor,
    status: input.status,
    mode: input.mode,
    resource: input.resource,
    message: input.message ?? statusMessage(input.status),
  };
}
