import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import { PMTiles, Protocol } from "pmtiles";
import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { LocationLifecycleState, LocationReading } from "@/features/location/types/location";
import { locationStateLabel } from "@/features/location/utils/locationState";
import type { MapDataHandle } from "@/features/map/types/map";
import type { PlayaMapRecord } from "@/features/map/types/mapRecord";
import type { TestAreaConfig } from "@/features/map/config/testAreas";
import { BlobPmtilesSource } from "@/features/map/utils/blobPmtilesSource";
import { styleFromMapResource } from "@/features/map/utils/mapLibreStyle";
import { markerColorForRecord, SELECTED_MARKER_COLOR } from "@/features/map/utils/markerStyle";
import type { MapRecordTrackingState } from "@/features/map/utils/mapRecordTrackingState";
import { resolveMapCameraIntent } from "@/features/map/utils/mapCamera";
import { userMarkerLabel } from "@/features/map/utils/userMarkerState";
import {
  clockRadiusToLatLng,
  manCenterForYear,
  playaRingLatLngs,
} from "@/features/map/utils/playaGeo";
import "maplibre-gl/dist/maplibre-gl.css";
import "./playa-map.css";

const CLOCK_LABELS = [
  { hour: 12, label: "12:00" },
  { hour: 3, label: "3:00" },
  { hour: 6, label: "6:00" },
  { hour: 9, label: "9:00" },
] as const;

const CLOCK_LABEL_FEET = 6400;

const RECORDS_SOURCE = "sideburn-records";
const OVERLAY_SOURCE = "sideburn-overlay";
const USER_SOURCE = "sideburn-user";

export type PlayaMapProps = {
  records: PlayaMapRecord[];
  selected: PlayaMapRecord | null;
  onSelect: (record: PlayaMapRecord) => void;
  mapSession: MapDataHandle;
  userLocation?: LocationReading | null;
  locationState?: LocationLifecycleState;
  followUser?: boolean;
  onFollowUserChange?: (follow: boolean) => void;
  onRetryLocation?: () => void;
  activeArea: TestAreaConfig;
  placementMode?: boolean;
  onPlace?: (coordinates: { latitude: number; longitude: number }) => void;
  /** Extra bottom padding when a detail sheet covers the map (px). */
  sheetBottomPadding?: number;
  /** Shared available / tracked / in_range / completed state per record id. */
  trackingById?: ReadonlyMap<string, MapRecordTrackingState>;
  /** Active inventory year — drives The Man / clock ring placement. */
  eventYear?: number | null;
};

let pmtilesProtocol: Protocol | null = null;
let mapLibreWorkerConfigured = false;

function ensureMapLibreWorker() {
  if (mapLibreWorkerConfigured) return;
  maplibregl.setWorkerUrl(mapLibreWorkerUrl);
  mapLibreWorkerConfigured = true;
}

function ensurePmtilesProtocol(): Protocol {
  if (!pmtilesProtocol) {
    pmtilesProtocol = new Protocol();
    maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);
  }
  return pmtilesProtocol;
}

export function PlayaMap({
  records,
  selected,
  onSelect,
  mapSession,
  userLocation = null,
  locationState = "prompt_required",
  followUser = false,
  onFollowUserChange,
  onRetryLocation,
  activeArea,
  placementMode = false,
  onPlace,
  sheetBottomPadding = 160,
  trackingById,
  eventYear = null,
}: PlayaMapProps) {
  const trackingByIdRef = useRef(trackingById);
  trackingByIdRef.current = trackingById;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const activeAreaRef = useRef(activeArea);
  activeAreaRef.current = activeArea;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const placementModeRef = useRef(placementMode);
  placementModeRef.current = placementMode;
  const sheetBottomPaddingRef = useRef(sheetBottomPadding);
  sheetBottomPaddingRef.current = sheetBottomPadding;
  const initialFitDoneRef = useRef(false);
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const followRef = useRef(followUser);
  followRef.current = followUser;
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const locationStateRef = useRef(locationState);
  locationStateRef.current = locationState;
  const onFollowUserChangeRef = useRef(onFollowUserChange);
  onFollowUserChangeRef.current = onFollowUserChange;
  const programmaticMoveRef = useRef(false);
  const registeredPmtiles = useRef<string[]>([]);
  const clockMarkersRef = useRef<maplibregl.Marker[]>([]);
  const recordMarkersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const mapSessionSwapReadyRef = useRef(false);
  const eventYearRef = useRef(eventYear);
  eventYearRef.current = eventYear;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    ensureMapLibreWorker();
    const prepared = styleFromMapResource(mapSession.resource);
    registerPmtiles(mapSession, registeredPmtiles.current);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: prepared.style as StyleSpecification,
      center: [activeArea.center.longitude, activeArea.center.latitude],
      zoom: activeArea.zoom,
      minZoom: prepared.minZoom,
      maxZoom: prepared.maxZoom,
      maxBounds: [[activeArea.bounds.minLongitude, activeArea.bounds.minLatitude], [activeArea.bounds.maxLongitude, activeArea.bounds.maxLatitude]],
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    mapRef.current = map;

    const restoreStyleOverlays = () => {
      const currentSelected = selectedRef.current;
      const currentArea = activeAreaRef.current;
      ensureOverlaysAndSyncRecords(map, recordsRef.current, currentSelected, trackingByIdRef.current);
      syncRecordMarkers(map, recordsRef.current, currentSelected, recordMarkersRef, onSelectRef, trackingByIdRef.current);
      syncOverlayGeometry(map, recordsRef.current, currentSelected, clockMarkersRef, currentArea.overlay, eventYearRef.current);
      syncUser(map, userLocationRef.current);
      syncUserMarker(map, userLocationRef.current, locationStateRef.current, followRef.current, userMarkerRef);
    };

    // MapLibre setStyle removes application sources/layers. A persistent listener
    // restores the latest records after every completed style replacement.
    map.on("style.load", restoreStyleOverlays);
    map.on("load", () => {
      restoreStyleOverlays();
      fitCamera(
        map,
        recordsRef.current,
        selectedRef.current,
        followRef.current,
        userLocationRef.current,
        activeAreaRef.current,
        programmaticMoveRef,
        initialFitDoneRef,
        sheetBottomPaddingRef.current,
      );
    });

    map.on("click", (event) => {
      if (placementModeRef.current) {
        onPlaceRef.current?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
        return;
      }
      if (!map.getLayer("records-circle")) return;
      const features = map.queryRenderedFeatures(event.point, { layers: ["records-circle"] });
      selectRecordFromMapClick({ ...event, features } as maplibregl.MapLayerMouseEvent, recordsRef, onSelectRef);
    });

    map.on("mouseenter", "records-circle", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "records-circle", () => {
      map.getCanvas().style.cursor = "";
    });

    // User pan/zoom while following should release follow instead of fighting intent.
    const stopFollowOnGesture = () => {
      if (programmaticMoveRef.current) return;
      if (!followRef.current) return;
      onFollowUserChangeRef.current?.(false);
    };
    map.on("dragstart", stopFollowOnGesture);
    map.on("zoomstart", stopFollowOnGesture);
    map.on("rotatestart", stopFollowOnGesture);

    const resize = () => map.resize();
    window.addEventListener("resize", resize);
    const timer = window.setTimeout(resize, 80);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", resize);
      clearClockMarkers(clockMarkersRef);
      clearRecordMarkers(recordMarkersRef);
      clearUserMarker(userMarkerRef);
      map.remove();
      mapRef.current = null;
      registeredPmtiles.current = [];
    };
    // Intentionally mount once; basemap updates handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // The constructor already owns the initial style load. Avoid racing it with
    // a redundant setStyle call, which can drop overlay sources and markers.
    if (!mapSessionSwapReadyRef.current) {
      mapSessionSwapReadyRef.current = true;
      return;
    }
    const prepared = styleFromMapResource(mapSession.resource);
    registerPmtiles(mapSession, registeredPmtiles.current);
    map.setStyle(prepared.style as StyleSpecification);
    // Basemap swaps only; the persistent style.load listener restores overlays.
  }, [mapSession]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncRecordMarkers(map, records, selected, recordMarkersRef, onSelectRef, trackingById);
    // A remote raster source can keep isStyleLoaded() false while its tiles are
    // still arriving. Once style.load created our source, publishing GeoJSON is
    // safe and must not wait for the basemap network to become idle.
    if (map.getSource(RECORDS_SOURCE)) {
      syncRecords(map, records, selected, trackingById);
    } else if (map.isStyleLoaded()) {
      ensureOverlaysAndSyncRecords(map, records, selected, trackingById);
    } else {
      return;
    }
    syncOverlayGeometry(map, records, selected, clockMarkersRef, activeArea.overlay, eventYear);
    fitCamera(
      map,
      records,
      selected,
      followUser,
      userLocation,
      activeArea,
      programmaticMoveRef,
      initialFitDoneRef,
      sheetBottomPadding,
    );
  }, [records, selected, followUser, userLocation, activeArea, sheetBottomPadding, trackingById, eventYear]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setMaxBounds([[activeArea.bounds.minLongitude, activeArea.bounds.minLatitude], [activeArea.bounds.maxLongitude, activeArea.bounds.maxLatitude]]);
    // Area switches recenter; closing a selection must not reset the camera.
    programmaticMoveRef.current = true;
    map.easeTo({ center: [activeArea.center.longitude, activeArea.center.latitude], zoom: activeArea.zoom, duration: 500 });
    map.once("moveend", () => {
      programmaticMoveRef.current = false;
    });
    initialFitDoneRef.current = false;
    if (activeArea.overlay === "none") clearClockMarkers(clockMarkersRef);
    if (map.isStyleLoaded()) syncOverlayGeometry(map, recordsRef.current, selected, clockMarkersRef, activeArea.overlay, eventYearRef.current);
    // Overlay sync for selected is handled by the records effect; area change owns recenter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeArea]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncUserMarker(map, userLocation, locationState, followUser, userMarkerRef);
    if (!map.isStyleLoaded()) return;
    syncUser(map, userLocation);
    if (followUser && userLocation?.coordinates) {
      programmaticMoveRef.current = true;
      map.easeTo({
        center: [userLocation.coordinates.longitude, userLocation.coordinates.latitude],
        duration: 450,
      });
      map.once("moveend", () => {
        programmaticMoveRef.current = false;
      });
    }
  }, [userLocation, locationState, followUser]);

  const locationStatus = locationStatusLabel(userLocation, locationState, followUser);
  const showStatus = Boolean(mapSession.message) && mapSession.status !== "online_fallback" && mapSession.status !== "installed_offline" && mapSession.status !== "sample";

  return (
    <div className={`playa-map playa-map--field relative h-full w-full ${placementMode ? "is-placing" : ""}`}>
      <div ref={containerRef} className="h-full w-full" data-testid="playa-map-canvas" />
      {placementMode ? <div className="pointer-events-none absolute inset-x-0 top-28 z-[520] mx-auto w-fit border border-[#17130f]/15 bg-[#f8f5ee]/95 px-4 py-2 text-xs uppercase tracking-widest text-[#17130f]">Tap the map to place beacon</div> : null}
      <div className="absolute bottom-[calc(10.25rem+env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-[500] flex flex-col gap-1">
        {onFollowUserChange ? (
          <button
            type="button"
            className={`playa-zoom-btn playa-follow-btn ${followUser ? "is-active" : ""}`}
            aria-label={followUser ? "Stop following me" : "Follow me"}
            aria-pressed={followUser}
            onClick={() => onFollowUserChange(!followUser)}
            title={
              followUser
                ? "Stop following"
                : userLocation?.coordinates
                  ? "Follow my location"
                  : "Enable follow (requests foreground location)"
            }
            data-testid="map-follow-toggle"
          >
            ⌖
          </button>
        ) : null}
        {(locationState === "denied" || locationState === "insecure" || locationState === "unavailable") && onRetryLocation ? (
          <button
            type="button"
            className="min-h-11 border border-[#17130f]/25 bg-[#f8f5ee]/95 px-3 text-xs text-[#17130f]"
            onClick={onRetryLocation}
            data-testid="map-location-retry"
          >
            Retry location
          </button>
        ) : null}
      </div>
      {showStatus ? <div
        className="pointer-events-none absolute inset-x-0 top-[max(10rem,calc(9.5rem+env(safe-area-inset-top)))] z-[500] mx-auto w-fit max-w-[88%] border border-[#17130f]/12 bg-[#f8f5ee]/92 px-3 py-1.5 text-center text-[11px] text-[#17130f] lg:top-[5.5rem] lg:max-w-[92%] lg:px-3 lg:py-2 lg:text-xs"
        role="status"
        aria-live="polite"
      >
        {mapSession.message}
      </div> : null}
      {locationStatus ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-[calc(11.5rem+env(safe-area-inset-bottom))] z-[500] mx-auto w-fit max-w-[90%] border border-[#17130f]/12 bg-[#f8f5ee]/95 px-3 py-2 text-center text-xs text-[#17130f]/80"
          role="status"
          aria-live="polite"
        >
          {locationStatus}
        </div>
      ) : null}
    </div>
  );
}

function registerPmtiles(session: MapDataHandle, registered: string[]) {
  const resource = session.resource;
  if (resource.type !== "maplibre-style" || !resource.pmtilesBlobUrls) return;
  const protocol = ensurePmtilesProtocol();
  for (const [path, objectUrl] of Object.entries(resource.pmtilesBlobUrls)) {
    if (registered.includes(path)) continue;
    void fetch(objectUrl)
      .then((response) => response.blob())
      .then((blob) => {
        const source = new BlobPmtilesSource(blob, path);
        protocol.add(new PMTiles(source));
        registered.push(path);
      })
      .catch(() => {
        // Presentation keeps vector overlays even if a tile archive fails to register.
      });
  }
}

function ensureOverlayLayers(map: MapLibreMap) {
  // setStyle clears custom images — always re-register before symbol layers reference them.
  ensureBeaconMarkerImages(map);
  if (!map.getSource(OVERLAY_SOURCE)) {
    map.addSource(OVERLAY_SOURCE, {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
    map.addLayer({
      id: "overlay-lines",
      type: "line",
      source: OVERLAY_SOURCE,
      filter: ["==", ["get", "kind"], "ring"],
      paint: {
        "line-color": "#f4e7c8",
        "line-width": ["case", ["==", ["get", "weight"], "strong"], 1.4, 1],
        "line-opacity": ["case", ["==", ["get", "weight"], "strong"], 0.55, 0.28],
        "line-dasharray": [1, 0],
      },
    });
    map.addLayer({
      id: "overlay-spokes",
      type: "line",
      source: OVERLAY_SOURCE,
      filter: ["==", ["get", "kind"], "spoke"],
      paint: { "line-color": "#f4e7c8", "line-width": 1, "line-opacity": 0.22 },
    });
    map.addLayer({
      id: "overlay-man",
      type: "circle",
      source: OVERLAY_SOURCE,
      filter: ["==", ["get", "kind"], "man"],
      paint: {
        "circle-radius": 8,
        "circle-color": "#17130f",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#f8f5ee",
        "circle-opacity": 1,
      },
    });
  }

  if (!map.getSource(RECORDS_SOURCE)) {
    map.addSource(RECORDS_SOURCE, {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
  }
  if (!map.getLayer("records-halo")) {
    map.addLayer({
      id: "records-halo",
      type: "circle",
      source: RECORDS_SOURCE,
      filter: [
        "any",
        ["==", ["get", "selected"], true],
        ["==", ["get", "tracking"], "tracked"],
        ["==", ["get", "tracking"], "in_range"],
      ],
      paint: {
        "circle-radius": [
          "case",
          ["==", ["get", "tracking"], "in_range"],
          26,
          ["==", ["get", "tracking"], "tracked"],
          24,
          22,
        ],
        "circle-color": [
          "case",
          ["==", ["get", "tracking"], "in_range"],
          "#22c55e",
          ["==", ["get", "tracking"], "tracked"],
          "#e2a23a",
          "#f8f5ee",
        ],
        "circle-opacity": 0.16,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": [
          "case",
          ["==", ["get", "tracking"], "in_range"],
          "#22c55e",
          ["==", ["get", "tracking"], "tracked"],
          "#e2a23a",
          "#f8f5ee",
        ],
      },
    });
  }
  if (!map.getLayer("records-circle")) {
    map.addLayer({
      id: "records-circle",
      type: "circle",
      source: RECORDS_SOURCE,
      // Sidequester-style projects: compact geo-anchored red circles with a warm outline.
      filter: ["==", ["get", "recordKind"], "art"],
      paint: {
        "circle-radius": ["case", ["==", ["get", "selected"], true], 9, 5],
        "circle-color": ["case", ["==", ["get", "selected"], true], SELECTED_MARKER_COLOR, "#a83223"],
        "circle-opacity": 0.96,
        "circle-stroke-width": ["case", ["==", ["get", "selected"], true], 2.5, 1.5],
        "circle-stroke-color": "#f4e7c8",
      },
    });
  }
  if (!map.getLayer("records-beacon-icons")) {
    map.addLayer({
      id: "records-beacon-icons",
      type: "symbol",
      source: RECORDS_SOURCE,
      filter: ["==", ["get", "recordKind"], "beacon"],
      layout: {
        "icon-image": ["get", "markerIcon"],
        "icon-size": 1,
        "icon-allow-overlap": true,
      },
    });
  }
  // Keep The Man above dense art / record circles.
  if (map.getLayer("overlay-man")) map.moveLayer("overlay-man");

  if (!map.getSource(USER_SOURCE)) {
    map.addSource(USER_SOURCE, {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
    map.addLayer({
      id: "user-accuracy",
      type: "circle",
      source: USER_SOURCE,
      filter: ["==", ["get", "kind"], "accuracy"],
      paint: {
        "circle-radius": ["get", "radiusPx"],
        "circle-color": "#5ec8ff",
        "circle-opacity": 0.12,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#5ec8ff",
      },
    });
    map.addLayer({
      id: "user-dot",
      type: "circle",
      source: USER_SOURCE,
      filter: ["==", ["get", "kind"], "you"],
      paint: {
        "circle-radius": 9,
        "circle-color": "#5ec8ff",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#f8f5ee",
      },
    });
  }
}

function syncOverlayGeometry(
  map: MapLibreMap,
  records: PlayaMapRecord[],
  selected: PlayaMapRecord | null,
  clockMarkersRef: { current: maplibregl.Marker[] },
  overlay: TestAreaConfig["overlay"],
  eventYear?: number | null,
) {
  if (overlay === "none") {
    const source = map.getSource(OVERLAY_SOURCE) as GeoJSONSource | undefined;
    source?.setData(emptyFeatureCollection());
    clearClockMarkers(clockMarkersRef);
    return;
  }
  const year = eventYear ?? selected?.eventYear ?? records[0]?.eventYear ?? 2026;
  const man = manCenterForYear(year);
  const features: Feature[] = [];

  for (const [index, feet] of [2500, 4000, 5755].entries()) {
    const ring = playaRingLatLngs(feet, man);
    features.push({
      type: "Feature",
      properties: { kind: "ring", weight: index === 0 ? "strong" : "soft" },
      geometry: {
        type: "LineString",
        coordinates: ring.map((point) => [point.lng, point.lat]),
      },
    });
  }

  for (const { hour } of CLOCK_LABELS) {
    const tip = clockRadiusToLatLng(hour, 0, 6200, man);
    features.push({
      type: "Feature",
      properties: { kind: "spoke" },
      geometry: {
        type: "LineString",
        coordinates: [
          [man.lng, man.lat],
          [tip.lng, tip.lat],
        ],
      },
    });
  }

  features.push({
    type: "Feature",
    properties: { kind: "man", label: "The Man" },
    geometry: { type: "Point", coordinates: [man.lng, man.lat] },
  });

  const source = map.getSource(OVERLAY_SOURCE) as GeoJSONSource | undefined;
  source?.setData({ type: "FeatureCollection", features });
  syncClockLabels(map, man, clockMarkersRef);
}

function clearClockMarkers(clockMarkersRef: { current: maplibregl.Marker[] }) {
  for (const marker of clockMarkersRef.current) marker.remove();
  clockMarkersRef.current = [];
}

function syncClockLabels(
  map: MapLibreMap,
  man: { lat: number; lng: number },
  clockMarkersRef: { current: maplibregl.Marker[] },
) {
  clearClockMarkers(clockMarkersRef);

  for (const { hour, label } of CLOCK_LABELS) {
    const tip = clockRadiusToLatLng(hour, 0, CLOCK_LABEL_FEET, man);
    const el = document.createElement("div");
    el.className = "playa-clock-label";
    el.textContent = label;
    el.setAttribute("aria-hidden", "true");
    clockMarkersRef.current.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([tip.lng, tip.lat]).addTo(map));
  }

  // Anchor bottom so THE MAN sits above the black Man circle (Sidequester parity).
  const manEl = document.createElement("div");
  manEl.className = "playa-man-label";
  manEl.textContent = "THE MAN";
  manEl.setAttribute("aria-hidden", "true");
  clockMarkersRef.current.push(
    new maplibregl.Marker({ element: manEl, anchor: "bottom", offset: [0, -10] }).setLngLat([man.lng, man.lat]).addTo(map),
  );
}

// Exported for lifecycle regression tests; the component remains the only UI export.
// eslint-disable-next-line react-refresh/only-export-components
export function ensureOverlaysAndSyncRecords(
  map: MapLibreMap,
  records: PlayaMapRecord[],
  selected: PlayaMapRecord | null,
  trackingById?: ReadonlyMap<string, MapRecordTrackingState>,
) {
  ensureOverlayLayers(map);
  syncRecords(map, records, selected, trackingById);
}

function syncRecords(
  map: MapLibreMap,
  records: PlayaMapRecord[],
  selected: PlayaMapRecord | null,
  trackingById?: ReadonlyMap<string, MapRecordTrackingState>,
) {
  const features: Feature[] = records.map((record) => {
    const tracking = trackingById?.get(record.id) ?? "available";
    return {
      type: "Feature" as const,
      properties: {
        id: record.id,
        title: record.title,
        placementKind: record.placementKind,
        recordKind: record.recordKind,
        // GeoJSON properties must remain JSON-serializable; MapLibre workers can
        // reject an entire collection when an optional value is `undefined`.
        category: record.category ?? null,
        markerIcon: record.markerKind ? `sideburn-${record.markerKind}` : "",
        color: markerColorForRecord(record),
        selected: selected?.id === record.id,
        tracking,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [record.location.longitude, record.location.latitude],
      },
    };
  });
  const source = map.getSource(RECORDS_SOURCE) as GeoJSONSource | undefined;
  if (!source) {
    if (import.meta.env.DEV) console.warn("Map record source is unavailable after overlay repair.");
    return;
  }
  source.setData({ type: "FeatureCollection", features });
}

function clearRecordMarkers(recordMarkersRef: { current: maplibregl.Marker[] }) {
  for (const marker of recordMarkersRef.current) marker.remove();
  recordMarkersRef.current = [];
}

// eslint-disable-next-line react-refresh/only-export-components
export function syncRecordMarkers(
  map: MapLibreMap,
  records: PlayaMapRecord[],
  selected: PlayaMapRecord | null,
  recordMarkersRef: { current: maplibregl.Marker[] },
  onSelectRef: { current: (record: PlayaMapRecord) => void },
  trackingById?: ReadonlyMap<string, MapRecordTrackingState>,
) {
  clearRecordMarkers(recordMarkersRef);
  for (const record of records) {
    // Art stays on GeoJSON symbol/circle layers so hundreds of pins remain geo-anchored.
    // DOM markers are only for sparse beacons/sideburns (+ optional selected art chip).
    if (!shouldUseDomRecordMarker(record, selected)) continue;
    const tracking = trackingById?.get(record.id) ?? "available";
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "playa-record-marker",
      selected?.id === record.id ? "is-selected" : "",
      record.livePin ? "is-live" : "",
      tracking !== "available" ? `is-${tracking.replace("_", "-")}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    button.dataset.tracking = tracking;
    button.style.setProperty("--marker-color", markerColorForRecord(record));
    button.setAttribute("aria-label", record.title);
    button.title = record.title;
    button.textContent =
      tracking === "completed"
        ? "✓"
        : record.markerKind
          ? BEACON_ICON_SPECS[record.markerKind].label
          : record.recordKind === "art"
            ? "+"
            : "S";
    button.classList.add(
      record.recordKind === "art"
        ? "is-art"
        : record.recordKind === "beacon" && record.markerKind
          ? `is-${record.markerKind.replace("_", "-")}`
          : "is-sideburn",
    );
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelectRef.current(record);
    });
    recordMarkersRef.current.push(
      new maplibregl.Marker({ element: button, anchor: "center" })
        .setLngLat([record.location.longitude, record.location.latitude])
        .addTo(map),
    );
  }
}

const BEACON_ICON_SPECS = {
  food: { color: "#f07838", label: "F" },
  get_weird: { color: "#a21caf", label: "?" },
  do_good: { color: "#0f766e", label: "G" },
} as const;

function ensureBeaconMarkerImages(map: MapLibreMap) {
  for (const [kind, spec] of Object.entries(BEACON_ICON_SPECS)) {
    const id = `sideburn-${kind}`;
    if (map.hasImage(id)) continue;
    const canvas = document.createElement("canvas");
    canvas.width = 28;
    canvas.height = 28;
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.fillStyle = spec.color;
    context.beginPath();
    context.arc(14, 14, 13, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#f8f5ee";
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = "#ffffff";
    context.font = "bold 14px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(spec.label, 14, 14.5);
    map.addImage(id, context.getImageData(0, 0, 28, 28), { pixelRatio: 1 });
  }
}

function syncUser(map: MapLibreMap, userLocation: LocationReading | null) {
  const coords = userLocation?.coordinates;
  const features: Feature[] = [];
  if (coords) {
    if (coords.accuracyMeters && coords.accuracyMeters > 0) {
      // Approximate meters→pixels at current zoom for a soft accuracy cue.
      const radiusPx = Math.min(80, Math.max(12, coords.accuracyMeters / 4));
      features.push({
        type: "Feature",
        properties: { kind: "accuracy", radiusPx },
        geometry: {
          type: "Point",
          coordinates: [coords.longitude, coords.latitude],
        },
      });
    }
    features.push({
      type: "Feature",
      properties: { kind: "you" },
      geometry: {
        type: "Point",
        coordinates: [coords.longitude, coords.latitude],
      },
    });
  }
  const source = map.getSource(USER_SOURCE) as GeoJSONSource | undefined;
  source?.setData({ type: "FeatureCollection", features });
}

function clearUserMarker(ref: { current: maplibregl.Marker | null }) {
  ref.current?.remove();
  ref.current = null;
}

function syncUserMarker(
  map: MapLibreMap,
  reading: LocationReading | null,
  state: LocationLifecycleState,
  following: boolean,
  ref: { current: maplibregl.Marker | null },
) {
  const coordinates = reading?.coordinates;
  if (!coordinates) {
    clearUserMarker(ref);
    return;
  }

  if (!ref.current) {
    const marker = document.createElement("div");
    marker.className = "playa-user-marker";
    marker.setAttribute("role", "img");
    marker.setAttribute("aria-label", "Your location");
    marker.title = "Your location";
    marker.dataset.testid = "map-user-location-marker";
    const arrow = document.createElement("span");
    arrow.className = "playa-user-marker__arrow";
    arrow.textContent = "➤";
    marker.appendChild(arrow);
    ref.current = new maplibregl.Marker({ element: marker, anchor: "center" })
      .setLngLat([coordinates.longitude, coordinates.latitude])
      .addTo(map);
  }

  const element = ref.current.getElement();
  element.classList.toggle("is-following", following);
  element.classList.toggle("is-simulated", state === "simulated" || reading.source === "simulated");
  element.classList.toggle("is-stale", state === "stale");
  element.setAttribute("aria-label", userMarkerLabel(state, reading.source));
  element.title = element.getAttribute("aria-label") ?? "Your location";
  ref.current.setLngLat([coordinates.longitude, coordinates.latitude]);
}

function fitCamera(
  map: MapLibreMap,
  records: PlayaMapRecord[],
  selected: PlayaMapRecord | null,
  followUser: boolean,
  userLocation: LocationReading | null,
  activeArea: TestAreaConfig,
  programmaticMoveRef: { current: boolean },
  initialFitDoneRef: { current: boolean },
  sheetBottomPadding: number,
) {
  const intent = resolveMapCameraIntent({
    selected: Boolean(selected),
    followUser,
    hasUserCoordinates: Boolean(userLocation?.coordinates),
    recordsLength: records.length,
    playaOverlay: activeArea.overlay === "playa",
    initialFitDone: initialFitDoneRef.current,
    sheetBottomPadding,
  });

  if (intent.type === "follow-user" && userLocation?.coordinates) {
    programmaticMoveRef.current = true;
    map.easeTo({
      center: [userLocation.coordinates.longitude, userLocation.coordinates.latitude],
      duration: 450,
    });
    map.once("moveend", () => {
      programmaticMoveRef.current = false;
    });
    return;
  }
  if (intent.type === "focus-selected" && selected) {
    programmaticMoveRef.current = true;
    map.easeTo({
      center: [selected.location.longitude, selected.location.latitude],
      zoom: Math.max(map.getZoom(), 15),
      duration: 550,
      padding: intent.padding,
    });
    map.once("moveend", () => {
      programmaticMoveRef.current = false;
    });
    return;
  }
  if (intent.type === "initial-fit" && records.length) {
    const bounds = new maplibregl.LngLatBounds();
    for (const record of records) {
      bounds.extend([record.location.longitude, record.location.latitude]);
    }
    programmaticMoveRef.current = true;
    initialFitDoneRef.current = true;
    map.fitBounds(bounds, {
      padding: { top: 100, bottom: 180, left: 48, right: 48 },
      maxZoom: 15,
      duration: 1000,
    });
    map.once("moveend", () => {
      programmaticMoveRef.current = false;
    });
    return;
  }
  // preserve: leave center/zoom unchanged when closing detail or refreshing records
}

function emptyFeatureCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldUseDomRecordMarker(
  record: PlayaMapRecord,
  selected: PlayaMapRecord | null,
) {
  return record.recordKind !== "art" || selected?.id === record.id;
}

// eslint-disable-next-line react-refresh/only-export-components
export function selectRecordFromMapClick(
  event: maplibregl.MapLayerMouseEvent,
  recordsRef: { current: PlayaMapRecord[] },
  onSelectRef: { current: (record: PlayaMapRecord) => void },
) {
  const feature = event.features?.[0];
  const id = feature?.properties?.id;
  if (typeof id !== "string") return;
  const record = recordsRef.current.find((row) => row.id === id);
  if (record) onSelectRef.current(record);
}

function locationStatusLabel(
  reading: LocationReading | null | undefined,
  state: LocationLifecycleState,
  followUser: boolean,
): string | null {
  if (state === "active" && reading?.coordinates && !followUser) return null;
  if (state === "active" && reading?.coordinates && followUser) return "Following you";
  if (state === "prompt_required") return "Location off — enable to show your position.";
  if (state === "denied") return "Location permission denied — browsing stays available.";
  if (state === "unsupported") return "Geolocation unsupported on this device.";
  if (state === "insecure") return "Location requires HTTPS or localhost — browsing stays available.";
  if (state === "inaccurate") return "GPS fix is inaccurate — Nearby proximity paused.";
  if (state === "stale") return "GPS fix is stale — waiting for a fresh reading.";
  if (state === "simulated") return `Simulated location · ${locationStateLabel(state)}`;
  if (state === "acquiring") return "Acquiring foreground GPS…";
  if (state === "unavailable") return reading?.error ?? "Location unavailable";
  if (reading?.error) return reading.error;
  return locationStateLabel(state);
}
