import type { Coordinates } from "@/features/location/types/coordinates";

export type TestAreaId = "black-rock-city" | "winthrop";

export type TestAreaConfig = {
  id: TestAreaId;
  label: string;
  center: Coordinates;
  zoom: number;
  bounds: { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number };
  overlay: "playa" | "none";
  gpsMode: "simulated-available" | "device";
};

export const TEST_AREAS: readonly TestAreaConfig[] = [
  {
    id: "black-rock-city",
    label: "Black Rock City",
    center: { latitude: 40.7864, longitude: -119.2065, accuracyMeters: 8 },
    zoom: 13,
    bounds: { minLatitude: 40.74, maxLatitude: 40.82, minLongitude: -119.25, maxLongitude: -119.16 },
    overlay: "playa",
    gpsMode: "simulated-available",
  },
  {
    id: "winthrop",
    label: "Winthrop, MA",
    center: { latitude: 42.3751, longitude: -70.9828, accuracyMeters: 8 },
    zoom: 15.5,
    bounds: { minLatitude: 42.345, maxLatitude: 42.4, minLongitude: -71.025, maxLongitude: -70.94 },
    overlay: "none",
    gpsMode: "device",
  },
] as const;

export function getTestArea(id: string | null | undefined): TestAreaConfig {
  return TEST_AREAS.find((area) => area.id === id) ?? TEST_AREAS[0];
}

export function coordinatesInTestArea(coordinates: Coordinates, area: TestAreaConfig): boolean {
  return coordinates.latitude >= area.bounds.minLatitude && coordinates.latitude <= area.bounds.maxLatitude &&
    coordinates.longitude >= area.bounds.minLongitude && coordinates.longitude <= area.bounds.maxLongitude;
}
