import type { Coordinates } from "@/features/location/types/coordinates";

export type LocationTestPreset = {
  id: "black-rock-city" | "winthrop";
  label: string;
  description: string;
  coordinates: Coordinates;
};

/** Prototype-only coordinates for repeatable remote field testing. */
export const LOCATION_TEST_PRESETS: readonly LocationTestPreset[] = [
  {
    id: "black-rock-city",
    label: "Black Rock City",
    description: "Exercises sample playa distance ranking and proximity behavior.",
    coordinates: { latitude: 40.7864, longitude: -119.2065, accuracyMeters: 8 },
  },
  {
    id: "winthrop",
    label: "Winthrop, MA",
    description: "Compares the prototype with the tester's real-world area.",
    coordinates: { latitude: 42.3751, longitude: -70.9828, accuracyMeters: 8 },
  },
] as const;

export function getLocationTestPreset(id: LocationTestPreset["id"]): LocationTestPreset {
  const preset = LOCATION_TEST_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown location test preset: ${id}`);
  return preset;
}
