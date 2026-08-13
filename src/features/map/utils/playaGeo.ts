export type LatLng = { lat: number; lng: number };
export const BRC_MAP_BOUNDS = { minLatitude: 40.74, maxLatitude: 40.82, minLongitude: -119.25, maxLongitude: -119.16 } as const;
export const BRC_MAP_CENTER: LatLng = { lat: 40.78, lng: -119.205 };
export const GOLDEN_SPIKE_BY_YEAR: Record<number, LatLng> = { 2025: { lat: 40.786958, lng: -119.202994 }, 2026: { lat: 40.783242, lng: -119.207871 } };
const DEFAULT_MAN_CENTER = { lat: 40.7864, lng: -119.2065 };
export function manCenterForYear(year: number): LatLng { return GOLDEN_SPIKE_BY_YEAR[year] ?? DEFAULT_MAN_CENTER; }
export function clockRadiusToLatLng(hour: number, minute: number, feet: number, man = DEFAULT_MAN_CENTER): LatLng {
  const bearing = ((45 + 30 * ((hour % 12) + minute / 60)) * Math.PI) / 180;
  const meters = Math.max(0, feet) * 0.3048;
  return { lat: man.lat + (meters * Math.cos(bearing)) / 111_320, lng: man.lng + (meters * Math.sin(bearing)) / (111_320 * Math.cos((man.lat * Math.PI) / 180)) };
}
export function playaRingLatLngs(feet: number, man: LatLng, steps = 72): LatLng[] { return Array.from({ length: steps + 1 }, (_, i) => clockRadiusToLatLng((i / steps) * 12, 0, feet, man)); }
