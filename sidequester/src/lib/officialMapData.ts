import {
  isWithinBrcBounds,
  type LatLng,
  type SidequesterBeacon,
} from "@artelier/playa-core";

export const OFFICIAL_2026_MAP_ENABLED =
  import.meta.env.VITE_USE_OFFICIAL_2026_MAP !== "false";

export const OFFICIAL_TOILET_ID_PREFIX = "official-2026-toilet-";
export const OFFICIAL_SAFETY_ID_PREFIX = "official-2026-safety-";

type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

type GeoJsonLineString = {
  type: "LineString";
  coordinates: number[][];
};

type GeoJsonFeature = {
  geometry?: GeoJsonPolygon | GeoJsonLineString | null;
  properties?: Record<string, unknown> | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type OfficialToiletArea = {
  id: string;
  rings: LatLng[][];
};

export type Official2026MapData = {
  streetPolygons: LatLng[][][];
  streetLines: LatLng[][];
  trashFencePolygons: LatLng[][][];
  toiletAreas: OfficialToiletArea[];
  toiletBeacons: SidequesterBeacon[];
  safetyBeacons: SidequesterBeacon[];
};

const OFFICIAL_CREATED_AT = "2026-07-13T00:00:00.000Z";
const METERS_PER_DEGREE_LATITUDE = 111_320;

/** Offset co-located services without changing their canonical playa address. */
function offsetAtClock(
  anchor: LatLng,
  hour: number,
  radialFeet: number,
  tangentialFeet: number,
): LatLng {
  const bearing = ((45 + 30 * (hour % 12)) * Math.PI) / 180;
  const radialMeters = radialFeet * 0.3048;
  const tangentialMeters = tangentialFeet * 0.3048;
  const eastMeters =
    radialMeters * Math.sin(bearing) +
    tangentialMeters * Math.cos(bearing);
  const northMeters =
    radialMeters * Math.cos(bearing) -
    tangentialMeters * Math.sin(bearing);
  const metersPerDegreeLongitude =
    METERS_PER_DEGREE_LATITUDE * Math.cos((anchor.lat * Math.PI) / 180);
  return {
    lat: anchor.lat + northMeters / METERS_PER_DEGREE_LATITUDE,
    lng: anchor.lng + eastMeters / metersPerDegreeLongitude,
  };
}

function officialSafetyBeacons(): SidequesterBeacon[] {
  const threeAndC = { lat: 40.7764639792935, lng: -119.198961157067 };
  const nineAndC = { lat: 40.7900302191671, lng: -119.216808851232 };
  const fixed = (
    id: string,
    kind: "med_tent" | "ranger",
    details: string,
    position: LatLng,
  ): SidequesterBeacon => ({
    id: `${OFFICIAL_SAFETY_ID_PREFIX}${id}`,
    kind,
    details,
    ...position,
    createdAt: OFFICIAL_CREATED_AT,
    startsAt: null,
    expiresAt: null,
    live: false,
    updates: [],
    createdBy: null,
  });

  return [
    fixed(
      "medical-3-c",
      "med_tent",
      "Medical Station — 3:00 & C, behind the 3:00 plaza",
      offsetAtClock(threeAndC, 3, 35, 0),
    ),
    fixed(
      "medical-9-c",
      "med_tent",
      "Medical Station — 9:00 & C, behind the 9:00 plaza",
      offsetAtClock(nineAndC, 9, 35, 0),
    ),
    fixed(
      "medical-rampart",
      "med_tent",
      "Main Medical / Rampart Emergency Care Center — 5:15 & Esplanade",
      { lat: 40.77691553447779, lng: -119.21133185023535 },
    ),
    fixed(
      "ranger-3-c",
      "ranger",
      "Ranger Outpost — 3:00 & C, adjacent to the 3:00 plaza",
      offsetAtClock(threeAndC, 3, 0, 35),
    ),
    fixed(
      "ranger-9-c",
      "ranger",
      "Ranger Outpost — 9:00 & C, adjacent to the 9:00 plaza",
      offsetAtClock(nineAndC, 9, 0, 35),
    ),
    fixed(
      "ranger-hq",
      "ranger",
      "Ranger HQ — approximately 6:30 & Esplanade",
      { lat: 40.779816285895, lng: -119.215701604384 },
    ),
  ];
}

function assetUrl(baseUrl: string, filename: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}map-data/2026/${filename}`;
}

function linePoints(feature: GeoJsonFeature): LatLng[] {
  if (feature.geometry?.type !== "LineString") {
    throw new Error("2026 street data contains a non-line feature");
  }
  return feature.geometry.coordinates.map(([lng, lat]) => {
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !isWithinBrcBounds(lat, lng)
    ) {
      throw new Error("2026 street data contains invalid coordinates");
    }
    return { lat, lng };
  });
}

async function fetchGeoJson(url: string): Promise<GeoJsonFeatureCollection> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Map asset failed to load: ${url}`);
  const value = (await response.json()) as GeoJsonFeatureCollection;
  if (value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    throw new Error(`Invalid GeoJSON feature collection: ${url}`);
  }
  return value;
}

function polygonRings(feature: GeoJsonFeature): LatLng[][] {
  if (feature.geometry?.type !== "Polygon") {
    throw new Error("2026 map data contains a non-polygon feature");
  }
  return feature.geometry.coordinates.map((ring) =>
    ring.map(([lng, lat]) => {
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        !isWithinBrcBounds(lat, lng)
      ) {
        throw new Error("2026 map data contains invalid coordinates");
      }
      return { lat, lng };
    }),
  );
}

/** Area-weighted centroid of the outer polygon ring, suitable for its map icon. */
function polygonCentroid(ring: LatLng[]): LatLng {
  let twiceArea = 0;
  let lngSum = 0;
  let latSum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    const cross = current.lng * next.lat - next.lng * current.lat;
    twiceArea += cross;
    lngSum += (current.lng + next.lng) * cross;
    latSum += (current.lat + next.lat) * cross;
  }
  if (Math.abs(twiceArea) < Number.EPSILON) {
    throw new Error("2026 toilet polygon has no measurable area");
  }
  return {
    lng: lngSum / (3 * twiceArea),
    lat: latSum / (3 * twiceArea),
  };
}

export async function loadOfficial2026MapData(
  baseUrl = import.meta.env.BASE_URL,
): Promise<Official2026MapData> {
  const [streets, streetLineData, trashFence, toilets] = await Promise.all([
    fetchGeoJson(assetUrl(baseUrl, "street_outlines.geojson")),
    fetchGeoJson(assetUrl(baseUrl, "street_lines.geojson")),
    fetchGeoJson(assetUrl(baseUrl, "trash_fence.geojson")),
    fetchGeoJson(assetUrl(baseUrl, "toilets.geojson")),
  ]);
  const streetPolygons = streets.features.map(polygonRings);
  const streetLines = streetLineData.features.map(linePoints);
  const trashFencePolygons = trashFence.features.map(polygonRings);
  const toiletAreas: OfficialToiletArea[] = [];
  const toiletBeacons: SidequesterBeacon[] = [];

  for (const feature of toilets.features) {
    const objectId = feature.properties?.OBJECTID;
    if (typeof objectId !== "number" && typeof objectId !== "string") {
      throw new Error("2026 toilet feature is missing OBJECTID");
    }
    const id = `${OFFICIAL_TOILET_ID_PREFIX}${objectId}`;
    const rings = polygonRings(feature);
    const centroid = polygonCentroid(rings[0]);
    const areaClass = feature.properties?.class;
    const qualifier = typeof areaClass === "string" ? ` — ${areaClass}` : "";
    toiletAreas.push({ id, rings });
    toiletBeacons.push({
      id,
      kind: "restroom",
      details: `Official planned toilet bank${qualifier}`,
      lat: centroid.lat,
      lng: centroid.lng,
      createdAt: OFFICIAL_CREATED_AT,
      startsAt: null,
      expiresAt: null,
      live: false,
      updates: [],
      createdBy: null,
    });
  }

  if (
    streetPolygons.length !== 1 ||
    streetLines.length !== 573 ||
    trashFencePolygons.length !== 1 ||
    toiletBeacons.length !== 45
  ) {
    throw new Error(
      `Unexpected 2026 map inventory: ${streetPolygons.length} street polygon(s), ${streetLines.length} street line(s), ${trashFencePolygons.length} trash fence polygon(s), ${toiletBeacons.length} toilet banks`,
    );
  }
  return {
    streetPolygons,
    streetLines,
    trashFencePolygons,
    toiletAreas,
    toiletBeacons,
    safetyBeacons: officialSafetyBeacons(),
  };
}

/** Replace official city inventory; community-created pins remain untouched. */
export function applyOfficialInfrastructureBeacons(
  beacons: SidequesterBeacon[],
  officialToilets: SidequesterBeacon[],
  officialSafety: SidequesterBeacon[],
  enabled: boolean,
): SidequesterBeacon[] {
  const isOfficial = (beacon: SidequesterBeacon) =>
    beacon.id.startsWith(OFFICIAL_TOILET_ID_PREFIX) ||
    beacon.id.startsWith(OFFICIAL_SAFETY_ID_PREFIX);
  const previousOfficial = new Map(
    beacons
      .filter(isOfficial)
      .map((beacon) => [beacon.id, beacon]),
  );
  const withoutOfficial = beacons.filter((beacon) => !isOfficial(beacon));
  if (!enabled) return withoutOfficial;

  // Official mode contains surveyed infrastructure plus community-created
  // pins. Keep every stock demo available only through the legacy rollback.
  const withoutStockDemos = withoutOfficial.filter(
    (beacon) => !beacon.id.startsWith("demo-"),
  );
  return [
    ...[...officialToilets, ...officialSafety].map((beacon) => {
      const previous = previousOfficial.get(beacon.id);
      return previous?.updates?.length
        ? { ...beacon, updates: previous.updates }
        : beacon;
    }),
    ...withoutStockDemos,
  ];
}
