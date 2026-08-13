/**
 * Map package / basemap loading boundary (not React map widgets).
 * Presentation (MapLibre) consumes opaque handles — routes never import map-engine APIs.
 */

export type MapSourceKind = "sample" | "packaged" | "remote" | "pmtiles";

/**
 * Distinct basemap availability states for field UX.
 * Incomplete pack downloads never surface as installed_offline (activation gates them).
 */
export type MapSessionStatus =
  | "sample"
  | "installed_offline"
  | "online_fallback"
  | "missing_pack"
  | "corrupted_pack"
  | "unsupported_format";

export type MapBasemapMode = "offline_style" | "pmtiles" | "remote_raster" | "vector_fallback";

export type MapPackageDescriptor = {
  id: string;
  label: string;
  kind: MapSourceKind;
  /** URL or local pack path; format-specific. */
  uri: string;
  version: string;
  formatVersion?: string;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
};

/** Engine-neutral basemap payload for the presentation layer. */
export type MapBasemapResource =
  | {
      type: "maplibre-style";
      /** MapLibre StyleSpecification-compatible object. */
      style: Record<string, unknown>;
      /**
       * Optional PMTiles blob URLs keyed by asset path.
       * Created from Cache Storage / Blob sources — not loaded wholesale into JS heap by the provider.
       */
      pmtilesBlobUrls?: Record<string, string>;
      center?: [number, number];
      zoom?: number;
      minZoom?: number;
      maxZoom?: number;
    }
  | {
      type: "remote-raster";
      tileUrls: string[];
      attribution?: string;
      center?: [number, number];
      zoom?: number;
      minZoom?: number;
      maxZoom?: number;
    }
  | {
      type: "vector-fallback";
      /** Why tiles are unavailable — presentation draws playa geometry only. */
      reason: MapSessionStatus;
      center?: [number, number];
      zoom?: number;
      minZoom?: number;
      maxZoom?: number;
    };

export type MapDataHandle = {
  descriptor: MapPackageDescriptor;
  status: MapSessionStatus;
  mode: MapBasemapMode;
  resource: MapBasemapResource;
  /** Short user-facing explanation of the current basemap state. */
  message: string;
};

export type ResolveMapSessionOptions = {
  /** Defaults to `navigator.onLine` when omitted. */
  online?: boolean;
  /** Area intent keeps local test maps independent from playa-pack basemaps. */
  area?: "black-rock-city" | "winthrop";
};

/**
 * Separates map data loading from map presentation widgets.
 * Implementations may load packaged MapLibre/PMTiles, sample basemaps, or remote fallbacks.
 */
export interface MapProvider {
  listPackages(): Promise<MapPackageDescriptor[]>;
  loadPackage(id: string): Promise<MapDataHandle>;
  getActivePackage(): Promise<MapPackageDescriptor | null>;
  /** Resolve what the live map should show (active pack + connectivity). */
  resolveSession(options?: ResolveMapSessionOptions): Promise<MapDataHandle>;
}

/**
 * Temporary online basemap when no offline pack is active.
 * Use absolute Esri CDN URLs (CORS-enabled) so hosted deploys do not depend on
 * fragile same-origin `/tiles/*` proxies (Vercel external rewrites were 500/timeout).
 * Local Vite still exposes `/tiles/*` proxies for manual debugging if needed.
 */
export const ONLINE_FALLBACK_RASTER_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
] as const;

export const DEFAULT_PLAYA_CENTER: [number, number] = [-119.205, 40.78];
export const DEFAULT_PLAYA_ZOOM = 13;
