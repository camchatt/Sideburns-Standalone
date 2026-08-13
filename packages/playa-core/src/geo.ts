/**
 * Geographic helpers for Black Rock City playa placement.
 * Clock/radius math follows Burning Man's published survey model:
 * true north/south aligns with the 4:30 axis (bearing intercept 45°).
 */

export type LatLng = { lat: number; lng: number };

/** Default public map framing for Black Rock City — camps + inner + outer playa. */
export const BRC_MAP_BOUNDS = {
  minLatitude: 40.72,
  maxLatitude: 40.84,
  minLongitude: -119.28,
  maxLongitude: -119.14,
} as const;

/** Fallback when a year has no published spike in-repo — prefer current event year. */
export const DEFAULT_MAN_CENTER: LatLng = { lat: 40.787035, lng: -119.203201 };

/**
 * Default map home — The Man (golden spike), not the bounding-box midpoint.
 * Prefer `manCenterForYear(eventYear)` when the event year is known.
 */
export const BRC_MAP_CENTER: LatLng = DEFAULT_MAN_CENTER;

/** Static Esri World Imagery export framed on Black Rock City (hero / preview use). */
export const PLAYA_MAP_PREVIEW_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export" +
  `?bbox=${BRC_MAP_BOUNDS.minLongitude},${BRC_MAP_BOUNDS.minLatitude},${BRC_MAP_BOUNDS.maxLongitude},${BRC_MAP_BOUNDS.maxLatitude}` +
  "&bboxSR=4326&imageSR=4326&size=1920,900&format=jpg&f=image";

/** Surveyed golden spike (The Man) by event year when known. */
export const GOLDEN_SPIKE_BY_YEAR: Record<number, LatLng> = {
  2025: { lat: 40.786958, lng: -119.202994 },
  2026: { lat: 40.787035, lng: -119.203201 },
};

const FEET_TO_M = 0.3048;
const M_PER_DEG_LAT = 111_320;
/** Official 2026: true N/S follows the 4:30 axis → intercept 45°, 30° per hour. */
const BEARING_INTERCEPT_DEG = 45;
const BEARING_PER_HOUR_DEG = 30;

function metersPerDegreeLng(lat: number): number {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

export function manCenterForYear(eventYear: number): LatLng {
  return GOLDEN_SPIKE_BY_YEAR[eventYear] ?? DEFAULT_MAN_CENTER;
}

/**
 * Convert playa clock + distance-from-Man (feet) to WGS84.
 * Approximate only — GPS remains authoritative when present.
 */
export function clockRadiusToLatLng(
  hour: number,
  minute: number,
  distanceFeet: number,
  man: LatLng = DEFAULT_MAN_CENTER,
): LatLng {
  const time = (hour % 12) + minute / 60;
  const bearingRad = ((BEARING_INTERCEPT_DEG + BEARING_PER_HOUR_DEG * time) * Math.PI) / 180;
  const radiusM = Math.max(0, distanceFeet) * FEET_TO_M;
  const eastM = radiusM * Math.sin(bearingRad);
  const northM = radiusM * Math.cos(bearingRad);
  return {
    lat: man.lat + northM / M_PER_DEG_LAT,
    lng: man.lng + eastM / metersPerDegreeLng(man.lat),
  };
}

/** Distance from Man for a closed playa ring (feet), used for schematic overlay. */
export function playaRingLatLngs(
  distanceFeet: number,
  man: LatLng,
  steps = 72,
): LatLng[] {
  const points: LatLng[] = [];
  for (let i = 0; i <= steps; i++) {
    const hour = (i / steps) * 12;
    points.push(clockRadiusToLatLng(hour, 0, distanceFeet, man));
  }
  return points;
}

export function isWithinBrcBounds(lat: number, lng: number): boolean {
  return (
    lat >= BRC_MAP_BOUNDS.minLatitude &&
    lat <= BRC_MAP_BOUNDS.maxLatitude &&
    lng >= BRC_MAP_BOUNDS.minLongitude &&
    lng <= BRC_MAP_BOUNDS.maxLongitude
  );
}
