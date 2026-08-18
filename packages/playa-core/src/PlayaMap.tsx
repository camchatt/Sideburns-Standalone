import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Compass, LocateFixed, Minus, Plus } from "lucide-react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "./leafletRotate";
import {
  BRC_MAP_BOUNDS,
  clockRadiusToLatLng,
  manCenterForYear,
  playaRingLatLngs,
  type LatLng,
} from "./geo";
import type { BurningManProject } from "./placements";
import {
  createServicePinIcon,
  servicePinSizeForZoom,
} from "./servicePins";
import { createSetPinIcon, setPinSizeForZoom } from "./setPins";
import {
  beaconKindMeta,
  isServiceBeacon,
  isSetBeacon,
  type SidequesterBeacon,
} from "./beacons";
import { OfflineAwareImageryLayer } from "./OfflineAwareImageryLayer";
import "leaflet/dist/leaflet.css";
import "./playa-map.css";

type RotatableMap = L.Map & {
  setBearing: (theta: number) => void;
  getBearing: () => number;
  compassBearing: L.Handler;
};

const MAX_ZOOM = 18;
const MIN_ZOOM = 12;
const DEFAULT_ZOOM = 14;

/** Marker stack (bottom → top): projects, services, sidequests, sets, hunt. */
const PANE_PROJECTS = "playa-projects";
const PANE_SERVICES = "playa-services";
const PANE_SETS = "playa-sets";
const PANE_SIDEQUESTS = "playa-sidequests";
const PANE_HUNT = "playa-hunt";

/** Tap priority — higher wins on near-ties. Paint z-order is separate. */
const TAP_PRIORITY = {
  project: 10,
  sidequest: 20,
  service: 30,
  set: 40,
  hunt: 50,
} as const;

/** Pixel radius for tap-to-select (container space — rotation-safe). */
const MAP_TAP_HIT_PX = 48;

/** Authored-hunt pin shape — kept local so playa-core stays pack-agnostic. */
export type PlayaHuntPin = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  kind: "riddle" | "key" | "chest" | "character" | string;
  done?: boolean;
  /** Gift-emphasized — pulses on the map. */
  emphasized?: boolean;
};

const HUNT_PIN_FILL: Record<string, string> = {
  riddle: "#c44569",
  key: "#3f454c",
  chest: "#e8912e",
  character: "#2a6b6e",
};

function MapLayerPanes() {
  const map = useMap() as RotatableMap & {
    rotateControl?: { remove: () => void };
  };
  useEffect(() => {
    // With leaflet-rotate, vectors belong in rotatePane. L.Marker is different:
    // the plugin reprojects marker positions itself, so putting marker panes
    // inside rotatePane applies the bearing twice and makes icons orbit/fly.
    const vectorParent =
      map.getPane("rotatePane") ??
      map.getPane("overlayPane") ??
      map.getPanes().overlayPane;
    const markerParent =
      map.getPane("markerPane") ??
      map.getPane("norotatePane") ??
      map.getPanes().markerPane;
    const ensure = (name: string, zIndex: number, parent: HTMLElement) => {
      const pane = map.getPane(name) ?? map.createPane(name, parent);
      pane.style.zIndex = String(zIndex);
    };
    // Default overlayPane is 400; keep custom panes above rings, below tooltips.
    ensure(PANE_PROJECTS, 410, vectorParent);
    ensure(PANE_SERVICES, 450, markerParent);
    ensure(PANE_SIDEQUESTS, 480, vectorParent);
    // Sets above sidequests for visual stacking only.
    ensure(PANE_SETS, 490, markerParent);
    ensure(PANE_HUNT, 500, vectorParent);

    // Drop the plugin’s default square rotate control if it still mounted.
    map.rotateControl?.remove();
  }, [map]);
  return null;
}

async function requestCompassPermission(): Promise<boolean> {
  const DOE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  if (typeof DOE.requestPermission === "function") {
    try {
      return (await DOE.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

type UserLocation = {
  lat: number;
  lng: number;
  accuracy: number;
};

type LocateStatus =
  | "idle"
  | "locating"
  | "granted"
  | "denied"
  | "unsupported"
  | "error";

const CLOCK_LABELS = [
  { hour: 12, label: "12:00" },
  { hour: 3, label: "3:00" },
  { hour: 6, label: "6:00" },
  { hour: 9, label: "9:00" },
] as const;

/** Minimal project shape PlayaMap needs; Artelier registry types satisfy this. */
export type PlayaMappableProject = {
  id: string;
  slug: string;
  title: string;
  event_year: number;
};

export type PlayaMapPointLike<T extends PlayaMappableProject = PlayaMappableProject> = {
  project: T;
  lat: number;
  lng: number;
  kind: "exact" | "approximate";
};

type PlayaMapProps<T extends PlayaMappableProject = BurningManProject> = {
  points: PlayaMapPointLike<T>[];
  selectedProject: T | null;
  years: number[];
  onSelect: (project: T) => void;
  loading?: boolean;
  /**
   * Extra fitBounds / flyTo padding [topLeft, bottomRight] so floating chrome
   * (filters / records) doesn’t cover the visual focus.
   */
  edgePadding?: [[number, number], [number, number]];
  /** Sidequester beacons overlaid on the playa. */
  beacons?: SidequesterBeacon[];
  selectedBeaconId?: string | null;
  onSelectBeacon?: (beacon: SidequesterBeacon) => void;
  /** When true, next map tap places a beacon instead of selecting art. */
  placingMode?: boolean;
  onPlace?: (latlng: { lat: number; lng: number }) => void;
  /** Dim art pins so beacons stay primary (Sidequester). */
  dimProjects?: boolean;
  /** Hide art/beacon pin tooltips; selection details live in a side panel. */
  hidePinMessages?: boolean;
  /** Pixels of chrome covering the bottom of the map (camera / attribution). */
  bottomInset?: number;
  /**
   * Fixed distance from the bottom for zoom/locate. Independent of sheet height
   * so the info card can cover the controls instead of pushing them.
   */
  controlsBottom?: number;
  /**
   * When set, zoom / locate controls portal into this element so stacking
   * relative to parent chrome (sheet above, map below) is correct.
   */
  controlsPortal?: HTMLElement | null;
  /** Hide +/- zoom (e.g. mobile, where pinch is primary). */
  hideZoom?: boolean;
  /** Corner for the locate control when not using locatePortal. */
  locateCorner?: "left" | "right";
  /**
   * When set, the locate control portals into this element (e.g. sheet tab row)
   * instead of stacking with zoom.
   */
  locatePortal?: HTMLElement | null;
  /** Optional control rendered above the locate button (desktop). */
  aboveLocate?: ReactNode;
  /**
   * Called before requesting geolocation. Return false to cancel.
   * Use for an in-app explanation before the system permission prompt.
   */
  beforeLocate?: () => boolean | Promise<boolean>;
  /**
   * Called before enabling device orientation / compass. Return false to cancel.
   */
  beforeCompass?: () => boolean | Promise<boolean>;
  /** User quest stop pins (and draft stops while composing). */
  huntPins?: PlayaHuntPin[];
  selectedHuntPinId?: string | null;
  onSelectHuntPin?: (pin: PlayaHuntPin) => void;
  /** Friends sharing live GPS via device codes. */
  friendPresences?: PlayaFriendPresence[];
  /** Fired when this device's locate pin updates (for presence publish). */
  onUserLocation?: (location: { lat: number; lng: number } | null) => void;
};

export type PlayaFriendPresence = {
  code: string;
  lat: number;
  lng: number;
  label?: string | null;
  updatedAt: string;
  stale?: boolean;
};

export function PlayaMap<T extends PlayaMappableProject = BurningManProject>({
  points,
  selectedProject,
  years,
  onSelect,
  loading = false,
  edgePadding,
  beacons = [],
  selectedBeaconId = null,
  onSelectBeacon,
  placingMode = false,
  onPlace,
  dimProjects = false,
  hidePinMessages = false,
  bottomInset = 0,
  controlsBottom = 16,
  controlsPortal = null,
  hideZoom = false,
  locateCorner = "left",
  locatePortal = null,
  aboveLocate = null,
  beforeLocate = null,
  beforeCompass = null,
  huntPins = [],
  selectedHuntPinId = null,
  onSelectHuntPin,
  friendPresences = [],
  onUserLocation = null,
}: PlayaMapProps<T>) {
  const primaryYear = years[0] ?? 2026;
  const man = manCenterForYear(primaryYear);

  const rings = useMemo(
    () => [
      playaRingLatLngs(2500, man),
      playaRingLatLngs(4000, man),
      playaRingLatLngs(5755, man),
    ],
    [man],
  );

  const spokes = useMemo(
    () =>
      CLOCK_LABELS.map(({ hour, label }) => {
        const outer = clockRadiusToLatLng(hour, 0, 6200, man);
        return {
          label,
          positions: [man, outer] as [LatLng, LatLng],
        };
      }),
    [man],
  );

  const playaBounds = useMemo(
    () =>
      L.latLngBounds(
        [BRC_MAP_BOUNDS.minLatitude, BRC_MAP_BOUNDS.minLongitude],
        [BRC_MAP_BOUNDS.maxLatitude, BRC_MAP_BOUNDS.maxLongitude],
      ).pad(0.55),
    [],
  );

  const selectedPoint = useMemo(
    () =>
      selectedProject
        ? points.find((point) => point.project.slug === selectedProject.slug) ?? null
        : null,
    [points, selectedProject],
  );

  const selectedBeacon = useMemo(
    () => beacons.find((b) => b.id === selectedBeaconId) ?? null,
    [beacons, selectedBeaconId],
  );

  return (
    <div
      className={`playa-map relative h-full w-full ${placingMode ? "playa-map--placing" : ""}`}
    >
      <MapContainer
        center={[man.lat, man.lng]}
        zoom={DEFAULT_ZOOM}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        scrollWheelZoom
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full"
        {...({
          rotate: true,
          rotateControl: false,
          bearing: 0,
          touchRotate: false,
          shiftKeyRotate: false,
        } as Record<string, unknown>)}
      >
        <OfflineAwareImageryLayer />
        <MapLayerPanes />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          opacity={0.55}
        />

        {rings.map((ring, index) => (
          <Polyline
            key={`ring-${index}`}
            positions={ring.map((p) => [p.lat, p.lng] as [number, number])}
            interactive={false}
            pathOptions={{
              color: "#f4e7c8",
              weight: index === 0 ? 1.4 : 1,
              opacity: index === 0 ? 0.55 : 0.28,
              dashArray: index === 2 ? "4 8" : undefined,
            }}
          />
        ))}

        {spokes.map((spoke) => (
          <Polyline
            key={spoke.label}
            positions={spoke.positions.map((p) => [p.lat, p.lng] as [number, number])}
            interactive={false}
            pathOptions={{ color: "#f4e7c8", weight: 1, opacity: 0.22 }}
          />
        ))}

        <CircleMarker
          center={[man.lat, man.lng]}
          radius={7}
          interactive={false}
          pathOptions={{
            color: "#f8f5ee",
            weight: 2,
            fillColor: "#17130f",
            fillOpacity: 0.95,
          }}
        >
          <Tooltip permanent direction="top" offset={[0, -10]} className="playa-man-label" opacity={1}>
            The Man
          </Tooltip>
        </CircleMarker>

        {points.map((point) => {
          const selected = point.project.slug === selectedProject?.slug;
          const exact = point.kind === "exact";
          const dimmed =
            !selected &&
            (dimProjects || Boolean(selectedProject) || Boolean(selectedBeaconId));
          return (
            <CircleMarker
              key={point.project.id}
              center={[point.lat, point.lng]}
              radius={10}
              pane={PANE_PROJECTS}
              interactive={false}
              pathOptions={{
                color: selected ? "#f8f5ee" : "#f4e7c8",
                weight: selected ? 2 : 1.25,
                fillColor: "#5c534c",
                fillOpacity: selected
                  ? 1
                  : dimmed
                    ? exact
                      ? 0.22
                      : 0.12
                    : exact
                      ? 0.95
                      : 0.45,
                opacity: selected ? 1 : dimmed ? 0.3 : 1,
              }}
            >
              {!placingMode && !hidePinMessages ? (
                <Tooltip
                  permanent={selected}
                  direction="top"
                  offset={[0, selected ? -16 : -8]}
                  className={
                    selected
                      ? "playa-art-tooltip playa-selected-tooltip"
                      : "playa-art-tooltip"
                  }
                >
                  <span className="font-medium">{point.project.title}</span>
                  <span className="block text-[10px] opacity-80">
                    {point.project.event_year}
                    {exact ? " · GPS" : " · approx"}
                  </span>
                </Tooltip>
              ) : null}
            </CircleMarker>
          );
        })}

        <ServiceBeaconMarkers
          beacons={beacons}
          selectedBeaconId={selectedBeaconId}
          hidePinMessages={hidePinMessages || placingMode}
        />

        {beacons.map((beacon) => {
          if (isServiceBeacon(beacon.kind) || isSetBeacon(beacon.kind)) {
            return null;
          }
          const meta = beaconKindMeta(beacon.kind);
          const selected = beacon.id === selectedBeaconId;
          return (
            <CircleMarker
              key={beacon.id}
              center={[beacon.lat, beacon.lng]}
              radius={10}
              pane={PANE_SIDEQUESTS}
              interactive={false}
              pathOptions={{
                className: [
                  "playa-beacon-pin",
                  selected ? "is-selected" : "",
                  beacon.live ? "is-live" : "",
                  beacon.completedAt ? "is-complete" : "",
                ]
                  .filter(Boolean)
                  .join(" "),
                color: "#17130f",
                weight: selected ? 2 : beacon.live ? 1.25 : 1,
                fillColor: meta.color,
                fillOpacity: 1,
                opacity: 1,
              }}
            >
              {!placingMode && !hidePinMessages ? (
                <Tooltip
                  permanent={selected}
                  direction="top"
                  offset={[0, selected ? -14 : -8]}
                  className="playa-art-tooltip playa-beacon-tooltip"
                >
                  <span className="font-medium">{meta.label}</span>
                  {beacon.details ? (
                    <span className="mt-0.5 block text-[11px] opacity-85 line-clamp-2">
                      {beacon.details}
                    </span>
                  ) : null}
                </Tooltip>
              ) : null}
            </CircleMarker>
          );
        })}

        {/* Sets above sidequests for visual stacking only. */}
        <SetBeaconMarkers
          beacons={beacons}
          selectedBeaconId={selectedBeaconId}
          hidePinMessages={hidePinMessages || placingMode}
        />

        {huntPins.map((pin) => {
          const selected = pin.id === selectedHuntPinId;
          const fill = HUNT_PIN_FILL[pin.kind] ?? "#c44569";
          const emphasized = Boolean(pin.emphasized) && !pin.done;
          return (
            <CircleMarker
              key={`hunt-${pin.id}`}
              center={[pin.lat, pin.lng]}
              radius={10}
              pane={PANE_HUNT}
              interactive={false}
              pathOptions={{
                className: [
                  "playa-hunt-pin",
                  selected ? "is-selected" : "",
                  pin.done ? "is-complete" : "",
                  emphasized ? "is-emphasized" : "",
                ]
                  .filter(Boolean)
                  .join(" "),
                color: "#f4f0e8",
                weight: selected || emphasized ? 2 : 1.25,
                fillColor: fill,
                fillOpacity: pin.done ? 0.55 : 1,
                opacity: 1,
              }}
            >
              {!placingMode && !hidePinMessages ? (
                <Tooltip
                  permanent={selected}
                  direction="top"
                  offset={[0, selected ? -14 : -8]}
                  className="playa-art-tooltip playa-beacon-tooltip"
                >
                  <span className="font-medium">{pin.title}</span>
                </Tooltip>
              ) : null}
            </CircleMarker>
          );
        })}

        <MapCameraController
          points={points}
          selected={selectedPoint}
          selectedBeacon={selectedBeacon}
          edgePadding={edgePadding}
          skipFit={
            (beacons.length > 0 || huntPins.length > 0) &&
            !selectedPoint &&
            !selectedBeacon
          }
        />
        <MapHomeOnMan
          man={man}
          edgePadding={edgePadding}
          enabled={!selectedPoint && !selectedBeacon}
        />
        <MapTapRouter
          placingMode={placingMode}
          onPlace={onPlace}
          points={points}
          beacons={beacons}
          huntPins={huntPins}
          onSelectProject={onSelect}
          onSelectBeacon={onSelectBeacon}
          onSelectHuntPin={onSelectHuntPin}
        />
        <MapInvalidateSize />
        <UserLocationControls
          playaBounds={playaBounds}
          controlsBottom={controlsBottom}
          controlsPortal={controlsPortal}
          hideZoom={hideZoom}
          locateCorner={locateCorner}
          locatePortal={locatePortal}
          aboveLocate={aboveLocate}
          beforeLocate={beforeLocate}
          beforeCompass={beforeCompass}
          friendPresences={friendPresences}
          onUserLocation={onUserLocation}
        />
      </MapContainer>

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-start justify-start p-5">
          <p className="rounded-sm bg-[#17130f]/75 px-3 py-2 text-sm text-[#f8f5ee]">
            Loading placements…
          </p>
        </div>
      )}

      {placingMode ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[520] flex justify-center px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <p className="rounded-sm border border-[#b8dc42]/50 bg-[#17130f]/90 px-3 py-2 text-[11px] uppercase tracking-widest text-[#b8dc42] backdrop-blur-md">
            Tap the map to drop your beacon
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ServiceBeaconMarkers({
  beacons,
  selectedBeaconId,
  hidePinMessages,
}: {
  beacons: SidequesterBeacon[];
  selectedBeaconId: string | null;
  hidePinMessages: boolean;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoomend", onZoom);
    onZoom();
    return () => {
      map.off("zoomend", onZoom);
    };
  }, [map]);

  return (
    <>
      {beacons.map((beacon) => {
        if (!isServiceBeacon(beacon.kind)) return null;
        const meta = beaconKindMeta(beacon.kind);
        const selected = beacon.id === selectedBeaconId;
        const size = servicePinSizeForZoom(zoom, beacon.kind);
        return (
          <Marker
            key={beacon.id}
            position={[beacon.lat, beacon.lng]}
            pane={PANE_SERVICES}
            icon={createServicePinIcon(beacon.kind, selected, size)}
            interactive={false}
            zIndexOffset={selected ? 200 : 0}
          >
            {!hidePinMessages ? (
              <Tooltip
                permanent={selected}
                direction="top"
                offset={[0, selected ? -(size / 2 + 6) : -(size / 2 + 2)]}
                className="playa-art-tooltip playa-beacon-tooltip"
              >
                <span className="font-medium">{meta.label}</span>
                {beacon.details ? (
                  <span className="mt-0.5 block text-[11px] opacity-85 line-clamp-2">
                    {beacon.details}
                  </span>
                ) : null}
              </Tooltip>
            ) : null}
          </Marker>
        );
      })}
    </>
  );
}

function SetBeaconMarkers({
  beacons,
  selectedBeaconId,
  hidePinMessages,
}: {
  beacons: SidequesterBeacon[];
  selectedBeaconId: string | null;
  hidePinMessages: boolean;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoomend", onZoom);
    onZoom();
    return () => {
      map.off("zoomend", onZoom);
    };
  }, [map]);

  const size = setPinSizeForZoom(zoom);

  return (
    <>
      {beacons.map((beacon) => {
        if (!isSetBeacon(beacon.kind)) return null;
        const selected = beacon.id === selectedBeaconId;
        return (
          <Marker
            key={beacon.id}
            position={[beacon.lat, beacon.lng]}
            pane={PANE_SETS}
            icon={createSetPinIcon(selected, size, beacon.id)}
            interactive={false}
            zIndexOffset={selected ? 500 : 200}
          >
            {!hidePinMessages ? (
              <Tooltip
                permanent={selected}
                direction="top"
                offset={[0, selected ? -(size / 2 + 6) : -(size / 2 + 2)]}
                className="playa-art-tooltip playa-beacon-tooltip"
              >
                <span className="font-medium">
                  {beacon.details?.trim() || "Live set"}
                </span>
                {beacon.place ? (
                  <span className="mt-0.5 block text-[11px] opacity-85 line-clamp-2">
                    {beacon.place}
                  </span>
                ) : null}
              </Tooltip>
            ) : null}
          </Marker>
        );
      })}
    </>
  );
}

type MapTapTarget = {
  lat: number;
  lng: number;
  /** Higher wins when two targets are equally near. */
  priority: number;
  select: () => void;
};

/**
 * Sole map interaction path: container-space nearest pin (rotation-safe).
 * All pin visuals are paint-only; this router owns select + place.
 */
function MapTapRouter<T extends PlayaMappableProject>({
  placingMode,
  onPlace,
  points,
  beacons,
  huntPins,
  onSelectProject,
  onSelectBeacon,
  onSelectHuntPin,
}: {
  placingMode: boolean;
  onPlace?: (latlng: { lat: number; lng: number }) => void;
  points: PlayaMapPointLike<T>[];
  beacons: SidequesterBeacon[];
  huntPins: PlayaHuntPin[];
  onSelectProject: (project: T) => void;
  onSelectBeacon?: (beacon: SidequesterBeacon) => void;
  onSelectHuntPin?: (pin: PlayaHuntPin) => void;
}) {
  const map = useMap();

  const targets = useMemo((): MapTapTarget[] => {
    const next: MapTapTarget[] = [];
    for (const point of points) {
      next.push({
        lat: point.lat,
        lng: point.lng,
        priority: TAP_PRIORITY.project,
        select: () => onSelectProject(point.project),
      });
    }
    for (const beacon of beacons) {
      next.push({
        lat: beacon.lat,
        lng: beacon.lng,
        priority: isSetBeacon(beacon.kind)
          ? TAP_PRIORITY.set
          : isServiceBeacon(beacon.kind)
            ? TAP_PRIORITY.service
            : TAP_PRIORITY.sidequest,
        select: () => onSelectBeacon?.(beacon),
      });
    }
    for (const pin of huntPins) {
      next.push({
        lat: pin.lat,
        lng: pin.lng,
        priority: TAP_PRIORITY.hunt,
        select: () => onSelectHuntPin?.(pin),
      });
    }
    return next;
  }, [points, beacons, huntPins, onSelectProject, onSelectBeacon, onSelectHuntPin]);

  useEffect(() => {
    const container = map.getContainer();
    let lastTapAt = 0;
    /** True once this gesture involved 2+ fingers (pinch). */
    let sawMultiTouch = false;
    /** Ignore synthetic click/tap right after pinch or zoom. */
    let suppressTapUntil = 0;
    let gestureStartZoom = map.getZoom();

    const isChromeTarget = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(
        target.closest(
          ".leaflet-control, .playa-zoom-btn, .playa-locate-btn, .playa-zoom-stack, button, a",
        ),
      );

    const suppressBriefly = () => {
      suppressTapUntil = Date.now() + 450;
    };

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length >= 2) {
        sawMultiTouch = true;
        suppressBriefly();
        return;
      }
      if (ev.touches.length === 1 && !sawMultiTouch) {
        gestureStartZoom = map.getZoom();
      }
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length >= 2) {
        sawMultiTouch = true;
        suppressBriefly();
      }
    };

    const onZoomOrMoveStart = () => {
      // Pinch-zoom / pan should never open a pin card.
      suppressBriefly();
    };

    const resolveTap = (
      clientX: number,
      clientY: number,
      sourceEvent?: MouseEvent | Touch,
    ) => {
      // Prefer Leaflet's rotate-aware conversion when we have a MouseEvent.
      const clickPt =
        sourceEvent && "clientX" in sourceEvent && map.mouseEventToContainerPoint
          ? map.mouseEventToContainerPoint(sourceEvent as MouseEvent)
          : (() => {
              const bounds = container.getBoundingClientRect();
              return L.point(clientX - bounds.left, clientY - bounds.top);
            })();
      const latlng = map.containerPointToLatLng(clickPt);

      if (placingMode) {
        onPlace?.({ lat: latlng.lat, lng: latlng.lng });
        return true;
      }

      let best: MapTapTarget | null = null;
      let bestDist = MAP_TAP_HIT_PX;
      for (const target of targets) {
        const pinPt = map.latLngToContainerPoint([target.lat, target.lng]);
        const dist = clickPt.distanceTo(pinPt);
        if (dist > MAP_TAP_HIT_PX) continue;
        if (
          !best ||
          dist < bestDist - 0.5 ||
          (Math.abs(dist - bestDist) <= 0.5 && target.priority > best.priority)
        ) {
          best = target;
          bestDist = dist;
        }
      }
      if (!best) return false;
      best.select();
      return true;
    };

    const onClick = (ev: MouseEvent) => {
      if (ev.button !== 0) return;
      if (isChromeTarget(ev.target)) return;
      const now = Date.now();
      if (now < suppressTapUntil) return;
      if (now - lastTapAt < 350) return;
      const handled = resolveTap(ev.clientX, ev.clientY, ev);
      if (!handled) return;
      lastTapAt = now;
      ev.preventDefault();
      ev.stopPropagation();
    };

    const onTouchEnd = (ev: TouchEvent) => {
      // Still holding another finger, or this was a pinch — never select.
      if (sawMultiTouch || ev.touches.length > 0) {
        if (ev.touches.length === 0) {
          sawMultiTouch = false;
          suppressBriefly();
        }
        return;
      }
      if (isChromeTarget(ev.target)) return;
      const now = Date.now();
      if (now < suppressTapUntil) {
        sawMultiTouch = false;
        return;
      }
      const dragging = map.dragging as L.Handler & { moved?: () => boolean };
      if (dragging?.moved?.()) {
        sawMultiTouch = false;
        return;
      }
      // Zoom changed during this gesture (pinch often reports as one finger at end).
      if (Math.abs(map.getZoom() - gestureStartZoom) > 0.01) {
        sawMultiTouch = false;
        suppressBriefly();
        return;
      }
      const touch = ev.changedTouches[0];
      if (!touch || ev.changedTouches.length !== 1) {
        sawMultiTouch = false;
        return;
      }
      if (now - lastTapAt < 350) {
        sawMultiTouch = false;
        return;
      }
      const handled = resolveTap(touch.clientX, touch.clientY);
      sawMultiTouch = false;
      if (!handled) return;
      lastTapAt = now;
      suppressBriefly(); // absorb the synthetic click that follows
      ev.preventDefault();
      ev.stopPropagation();
    };

    container.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    container.addEventListener("touchmove", onTouchMove, {
      capture: true,
      passive: true,
    });
    container.addEventListener("click", onClick, true);
    container.addEventListener("touchend", onTouchEnd, {
      capture: true,
      passive: false,
    });
    map.on("zoomstart", onZoomOrMoveStart);
    map.on("movestart", onZoomOrMoveStart);
    return () => {
      container.removeEventListener("touchstart", onTouchStart, true);
      container.removeEventListener("touchmove", onTouchMove, true);
      container.removeEventListener("click", onClick, true);
      container.removeEventListener("touchend", onTouchEnd, true);
      map.off("zoomstart", onZoomOrMoveStart);
      map.off("movestart", onZoomOrMoveStart);
    };
  }, [map, placingMode, onPlace, targets]);

  return null;
}

/** Center that keeps `latlng` in the padded visible band (no zoom change). */
function centerForPaddedPoint(
  map: L.Map,
  latlng: L.LatLngExpression,
  zoom: number,
  pad?: [[number, number], [number, number]],
): L.LatLng {
  const point = map.project(latlng, zoom);
  if (!pad) return map.unproject(point, zoom);
  const [[padT, padL], [padB, padR]] = pad;
  const offset = L.point((padL - padR) / 2, (padT - padB) / 2);
  return map.unproject(point.subtract(offset), zoom);
}

/**
 * Keep The Man in the middle of the *visible* playa frame.
 * Bottom-sheet padding would otherwise leave the spike high in the viewport.
 */
function MapHomeOnMan({
  man,
  edgePadding,
  enabled,
}: {
  man: LatLng;
  edgePadding?: [[number, number], [number, number]];
  enabled: boolean;
}) {
  const map = useMap();
  const lastManKeyRef = useRef("");
  const homedWithPadRef = useRef(false);

  const home = useCallback(
    (animate: boolean) => {
      const zoom = DEFAULT_ZOOM;
      const center = centerForPaddedPoint(
        map,
        [man.lat, man.lng],
        zoom,
        edgePadding,
      );
      if (animate) {
        map.setView(center, zoom, { animate: true, duration: 0.35 });
      } else {
        map.setView(center, zoom, { animate: false });
      }
    },
    [map, man.lat, man.lng, edgePadding],
  );

  // Year / spike change → re-home.
  useEffect(() => {
    if (!enabled) return;
    const manKey = `${man.lat},${man.lng}`;
    if (lastManKeyRef.current === manKey) return;
    lastManKeyRef.current = manKey;
    homedWithPadRef.current = false;
    // Wait a tick so Leaflet has size after mount.
    const id = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
      home(false);
      homedWithPadRef.current = Boolean(edgePadding);
    }, 40);
    return () => window.clearTimeout(id);
  }, [enabled, man.lat, man.lng, home, map, edgePadding]);

  // First time we know sheet padding, nudge Man into the visible band once.
  useEffect(() => {
    if (!enabled || !edgePadding || homedWithPadRef.current) return;
    homedWithPadRef.current = true;
    const id = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
      home(false);
    }, 80);
    return () => window.clearTimeout(id);
  }, [enabled, edgePadding, home, map]);

  return null;
}

function MapCameraController<T extends PlayaMappableProject>({
  points,
  selected,
  selectedBeacon,
  edgePadding,
  skipFit = false,
}: {
  points: PlayaMapPointLike<T>[];
  selected: PlayaMapPointLike<T> | null;
  selectedBeacon: SidequesterBeacon | null;
  edgePadding?: [[number, number], [number, number]];
  skipFit?: boolean;
}) {
  const map = useMap();
  const edgePaddingRef = useRef(edgePadding);
  edgePaddingRef.current = edgePadding;

  const selectedKey = selected?.project.slug ?? "";
  const beaconKey = selectedBeacon?.id ?? "";
  const pointsKey = points.map((p) => p.project.id).join(",");
  const padKey = edgePadding
    ? `${edgePadding[0].join(",")}|${edgePadding[1].join(",")}`
    : "";

  // Selection / dataset changes — fly once. Do not depend on padKey: sheet snap
  // used to re-fire flyToBounds and made the map feel jumpy.
  useEffect(() => {
    const pad = edgePaddingRef.current;

    if (selectedBeacon) {
      const zoom = Math.max(map.getZoom(), 15);
      const center = centerForPaddedPoint(
        map,
        [selectedBeacon.lat, selectedBeacon.lng],
        zoom,
        pad,
      );
      map.flyTo(center, zoom, { duration: 0.65, easeLinearity: 0.25 });
      return;
    }

    if (selected) {
      const zoom = Math.max(map.getZoom(), 15);
      const center = centerForPaddedPoint(
        map,
        [selected.lat, selected.lng],
        zoom,
        pad,
      );
      map.flyTo(center, zoom, { duration: 0.65, easeLinearity: 0.25 });
      return;
    }

    if (skipFit) return;

    if (!points.length) {
      // MapHomeOnMan owns the default Man framing.
      return;
    }
    const padOpts = pad
      ? {
          paddingTopLeft: pad[0],
          paddingBottomRight: pad[1],
        }
      : {};
    const bounds = L.latLngBounds(
      points.map((p) => [p.lat, p.lng] as [number, number]),
    );
    map.fitBounds(bounds.pad(0.2), {
      maxZoom: 15,
      animate: true,
      duration: 1.35,
      easeLinearity: 0.2,
      ...padOpts,
    });
  }, [
    map,
    selected,
    selectedKey,
    selectedBeacon,
    beaconKey,
    points,
    pointsKey,
    skipFit,
  ]);

  // Sheet / chrome padding changed while a pin is selected — gentle pan only
  // (same zoom), so the pin stays above the card without a zoom punch.
  const prevPadKeyRef = useRef(padKey);
  const prevSelectionRef = useRef(`${beaconKey}|${selectedKey}`);
  useEffect(() => {
    const selection = `${beaconKey}|${selectedKey}`;
    const padChanged = prevPadKeyRef.current !== padKey;
    const selectionChanged = prevSelectionRef.current !== selection;
    prevPadKeyRef.current = padKey;
    prevSelectionRef.current = selection;

    // Selection fly already aims with current pad; only react to pad-only shifts.
    if (!padChanged || selectionChanged) return;

    const target = selectedBeacon
      ? { lat: selectedBeacon.lat, lng: selectedBeacon.lng }
      : selected
        ? { lat: selected.lat, lng: selected.lng }
        : null;
    if (!target || !edgePadding) return;

    const zoom = map.getZoom();
    const desired = centerForPaddedPoint(
      map,
      [target.lat, target.lng],
      zoom,
      edgePadding,
    );
    if (map.getCenter().distanceTo(desired) < 12) return;
    map.panTo(desired, { animate: true, duration: 0.35, easeLinearity: 0.3 });
  }, [map, padKey, selectedBeacon, selected, selectedKey, beaconKey, edgePadding]);

  return null;
}

function MapInvalidateSize() {
  const map = useMap();
  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        map.invalidateSize({ pan: false, debounceMoveend: true });
      }, 120);
    };
    const id = window.setTimeout(() => map.invalidateSize({ pan: false }), 80);
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
    window.visualViewport?.addEventListener("resize", refresh);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(timer);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("orientationchange", refresh);
      window.visualViewport?.removeEventListener("resize", refresh);
    };
  }, [map]);
  return null;
}

function UserLocationControls({
  playaBounds,
  controlsBottom = 16,
  controlsPortal = null,
  hideZoom = false,
  locateCorner = "left",
  locatePortal = null,
  aboveLocate = null,
  beforeLocate = null,
  beforeCompass = null,
  friendPresences = [],
  onUserLocation = null,
}: {
  playaBounds: L.LatLngBounds;
  controlsBottom?: number;
  controlsPortal?: HTMLElement | null;
  hideZoom?: boolean;
  locateCorner?: "left" | "right";
  locatePortal?: HTMLElement | null;
  aboveLocate?: ReactNode;
  beforeLocate?: (() => boolean | Promise<boolean>) | null;
  beforeCompass?: (() => boolean | Promise<boolean>) | null;
  friendPresences?: PlayaFriendPresence[];
  onUserLocation?: ((location: { lat: number; lng: number } | null) => void) | null;
}) {
  const map = useMap() as RotatableMap;
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [status, setStatus] = useState<LocateStatus>("idle");
  const [compassOn, setCompassOn] = useState(false);
  const [bearing, setBearing] = useState(0);
  const bindMapControl = useCallback((element: HTMLDivElement | null) => {
    if (element) L.DomEvent.disableClickPropagation(element);
  }, []);

  const locate = useCallback(async () => {
    if (beforeLocate) {
      const ok = await beforeLocate();
      if (!ok) return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next: UserLocation = {
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy || 40,
        };
        const nearPlaya = playaBounds.pad(0.15).contains([next.lat, next.lng]);
        if (nearPlaya) {
          setUserLocation(next);
          setStatus("granted");
          onUserLocation?.({ lat: next.lat, lng: next.lng });
          map.flyTo([next.lat, next.lng], Math.max(map.getZoom(), 15), {
            duration: 0.7,
          });
        } else {
          // Off-playa: no pin, no status chip — return locate to idle.
          setUserLocation(null);
          onUserLocation?.(null);
          setStatus("idle");
        }
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [map, playaBounds, beforeLocate, onUserLocation]);

  useEffect(() => {
    const onRotate = () => setBearing(map.getBearing());
    map.on("rotate", onRotate);
    return () => {
      map.off("rotate", onRotate);
    };
  }, [map]);

  useEffect(() => {
    return () => {
      map.compassBearing?.disable();
      map.setBearing?.(0);
    };
  }, [map]);

  const toggleCompass = useCallback(async () => {
    if (compassOn) {
      map.compassBearing.disable();
      map.setBearing(0);
      setCompassOn(false);
      setBearing(0);
      return;
    }
    if (beforeCompass) {
      const ok = await beforeCompass();
      if (!ok) return;
    }
    const allowed = await requestCompassPermission();
    if (!allowed) return;
    map.compassBearing.enable();
    // If the handler disabled itself (no orientation API), stay off.
    if (!map.compassBearing.enabled()) return;
    setCompassOn(true);
  }, [compassOn, map, beforeCompass]);

  // In-flow stack so desktop `aboveLocate` (+ FAB) never overlaps compass.
  const locateCluster = (
    <div
      ref={bindMapControl}
      className="pointer-events-none inline-flex flex-col items-center gap-2"
    >
      <button
        type="button"
        aria-label={compassOn ? "Stop orienting map to phone" : "Orient map to phone"}
        aria-pressed={compassOn}
        title={compassOn ? "North up" : "Orient map to phone"}
        className={`playa-zoom-btn playa-locate-btn playa-compass-btn pointer-events-auto ${
          compassOn ? "is-active" : ""
        }`}
        onClick={() => {
          void toggleCompass();
        }}
      >
        <Compass
          className="h-4 w-4 transition-transform duration-150"
          strokeWidth={1.75}
          aria-hidden
          style={{ transform: `rotate(${-bearing}deg)` }}
        />
      </button>
      <button
        type="button"
        aria-label="Locate me"
        title="Locate me"
        className={`playa-zoom-btn playa-locate-btn pointer-events-auto ${
          status === "granted" ? "is-active" : ""
        } ${status === "locating" ? "is-locating" : ""}`}
        onClick={() => {
          void locate();
        }}
        disabled={status === "locating"}
      >
        <LocateFixed className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );

  const sideInset =
    locateCorner === "right"
      ? {
          right: "calc(env(safe-area-inset-right, 0px) + 1.25rem)",
          left: "auto",
        }
      : {
          left: "calc(env(safe-area-inset-left, 0px) + 1.25rem)",
          right: "auto",
        };

  const showZoom = !hideZoom;
  const showInlineLocate = !locatePortal;
  const showAboveLocate = Boolean(aboveLocate) && showInlineLocate;
  const hasStackControls = showZoom || showInlineLocate || showAboveLocate;

  const controls = hasStackControls ? (
    <div
      ref={bindMapControl}
      className={`pointer-events-none absolute z-[500] flex flex-col gap-2 ${
        locateCorner === "right" ? "items-end" : "items-start"
      }`}
      style={{
        ...sideInset,
        bottom: `max(${controlsBottom}px, calc(env(safe-area-inset-bottom, 0px) + ${Math.max(controlsBottom - 16, 8)}px))`,
      }}
    >
      {showZoom ? (
        <div
          className="playa-zoom-stack pointer-events-auto"
          role="group"
          aria-label="Map zoom"
        >
          <button
            type="button"
            aria-label="Zoom in"
            className="playa-zoom-btn"
            onClick={() => map.zoomIn()}
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            className="playa-zoom-btn"
            onClick={() => map.zoomOut()}
          >
            <Minus className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : null}
      {showInlineLocate ? (
        <div
          className={`pointer-events-none flex flex-col gap-3 ${
            locateCorner === "right" ? "items-end" : "items-start"
          }`}
        >
          {aboveLocate}
          {locateCluster}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      {userLocation ? (
        <>
          <Circle
            center={[userLocation.lat, userLocation.lng]}
            radius={Math.min(Math.max(userLocation.accuracy, 20), 400)}
            pathOptions={{
              className: "playa-user-accuracy",
              color: "#5eb0ff",
              weight: 1,
              fillColor: "#5eb0ff",
              fillOpacity: 0.12,
              opacity: 0.55,
            }}
            interactive={false}
          />
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={9}
            pathOptions={{
              className: "playa-user-pin",
              color: "#f8f5ee",
              weight: 2.5,
              fillColor: "#2f7dd1",
              fillOpacity: 1,
              opacity: 1,
            }}
            interactive={false}
          >
            <Tooltip
              permanent
              direction="top"
              offset={[0, -12]}
              className="playa-art-tooltip playa-user-tooltip"
            >
              You
            </Tooltip>
          </CircleMarker>
        </>
      ) : null}

      {friendPresences.map((friend) => (
        <CircleMarker
          key={friend.code}
          center={[friend.lat, friend.lng]}
          radius={8}
          pathOptions={{
            className: "playa-friend-pin",
            color: "#f8f5ee",
            weight: 2,
            fillColor: friend.stale ? "#a89b86" : "#e8912e",
            fillOpacity: friend.stale ? 0.55 : 1,
            opacity: 1,
          }}
          interactive={false}
        >
          <Tooltip
            permanent
            direction="top"
            offset={[0, -12]}
            className="playa-art-tooltip playa-friend-tooltip"
          >
            {friend.label?.trim() || friend.code}
          </Tooltip>
        </CircleMarker>
      ))}

      {controls
        ? controlsPortal
          ? createPortal(controls, controlsPortal)
          : controls
        : null}
      {locatePortal ? createPortal(locateCluster, locatePortal) : null}
    </>
  );
}
