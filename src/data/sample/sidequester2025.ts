import type { BeaconMarkerKind, PlayaMapRecord } from "@/features/map/types/mapRecord";
import { parseSidequest, type Sidequest } from "@/features/sidequests/types/sidequest";

type Seed = [kind: BeaconMarkerKind | "sidequest", title: string, description: string, latitude: number, longitude: number, attribution?: string];

const SEEDS: Seed[] = [
  ["food", "Leftover Pizza", "Leftover pizza at the dome — come take a slice.", 40.786958, -119.214462],
  ["food", "Miso Ramen", "Camp kitchen open: miso ramen until we run out.", 40.775746, -119.201026],
  ["food", "Ice Cream Gifts", "Ice cream gifts — bring a cup if you have one.", 40.792368, -119.210097],
  ["food", "Grilled Cheese", "Grilled cheese for the dusty — night shift welcome.", 40.779397, -119.190071],
  ["food", "Fruit Share", "Fruit share table on the corner — oranges & dates.", 40.796801, -119.202994],
  ["sidequest", "Lantern to the Temple", "Carry a lit lantern from here to the Temple without stopping. Hand it to a stranger when you arrive.", 40.795888, -119.191183, "Camp Questionable"],
  ["sidequest", "Portrait Exchange", "Get your portrait drawn by whoever is at the easel, then draw the next person.", 40.782265, -119.192296, "Ink & Dust"],
  ["sidequest", "Sunrise Truth", "Be here at sunrise and say one true thing out loud.", 40.800125, -119.210097],
  ["get_weird", "Costume Swap Spiral", "Trade one wearable item, spin three times, and keep walking as someone new.", 40.782069, -119.196575, "Spiral Kin"],
  ["get_weird", "Silent Disco Dare", "Dance for one full song with headphones you do not own. Bow when it ends.", 40.791782, -119.209327],
  ["get_weird", "Mirror Maze Confessions", "Whisper a ridiculous secret to the mirror and leave a glitter gift.", 40.783438, -119.20753, "Camp Prism"],
  ["get_weird", "Playa Karaoke Duet", "Sing with a stranger for 30 seconds. Harmonize or gloriously fail.", 40.791195, -119.197345],
  ["get_weird", "Dusty Mime Relay", "Act out your last meal without speaking until someone guesses it.", 40.791065, -119.215917],
  ["get_weird", "Glow Stick Labyrinth", "Follow the glow path once clockwise, once counter — invent a ritual midway.", 40.778745, -119.205818],
  ["get_weird", "Alien Translator Booth", "Translate a friend's story into nonsense language, then into kindness.", 40.784807, -119.213435],
  ["do_good", "Shade Tent Relief", "Offer water, a sit, and five quiet minutes to whoever looks cooked.", 40.776529, -119.202994, "Cool Down Collective"],
  ["do_good", "Bike Light Clinic", "Help attach or aim a light so someone rides safer tonight.", 40.795953, -119.206161],
  ["do_good", "MOOP Sweep Circle", "Pick up ten pieces of MOOP in this block and leave the circle cleaner.", 40.781808, -119.196233],
  ["do_good", "Lost & Found Escort", "Walk a lost item or person toward Center Camp Lost & Found.", 40.792108, -119.20967],
  ["do_good", "Hydration Check", "Offer electrolytes or ice to two dusty neighbors who look peaked.", 40.77881, -119.213692],
  ["do_good", "Accessibility Assist", "Clear a path, offer an arm, or help move a wheeled chair across deep dust.", 40.792759, -119.195291],
];

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Standalone 2025 demo inventory — Sideburn / Food / Get Weird / Do Good taxonomy. */
export const SIDEQUESTER_2025_RECORDS: PlayaMapRecord[] = SEEDS.map(
  ([kind, title, description, latitude, longitude, attribution], index) => ({
    id: `bm2025_${String(index + 1).padStart(2, "0")}_${slugify(title)}`,
    slug: `bm2025-${slugify(title)}`,
    title,
    description,
    location: { latitude, longitude, accuracyMeters: 8 },
    placementKind: "exact",
    placementLabel: "2025 prototype placement",
    placementConfidence: 0.9,
    eventYear: 2025,
    heroImageUrl: null,
    artistName: attribution ?? null,
    radiusMeters: kind === "sidequest" ? 50 : 30,
    detailUrl: null,
    recordKind: kind === "sidequest" ? "sidequest" : "beacon",
    markerKind: kind === "sidequest" ? null : kind,
    category: kind === "sidequest" ? "explore" : "service",
    contentOrigin: "infrastructure",
    presenter: attribution ?? null,
  }),
);

/**
 * Completable Sideburns share IDs with their map records so detail actions,
 * marker state, and persisted progress always resolve the same entity.
 * Service beacons intentionally remain map-only and cannot be completed.
 */
export const SIDEQUESTER_2025_SIDEQUESTS: Sidequest[] = SIDEQUESTER_2025_RECORDS
  .filter((record) => record.recordKind === "sidequest")
  .map((record) =>
    parseSidequest({
      id: record.id,
      title: record.title,
      description: record.description,
      location: record.location,
      radiusMeters: record.radiusMeters,
      category: record.category ?? "explore",
      availability: "always",
      difficulty: "unknown",
      createdAt: "2025-08-24T00:00:00.000Z",
      updatedAt: "2025-08-24T00:00:00.000Z",
      syncStatus: "synced",
      packId: "pack_sidequester_2025",
      placementKind: record.placementKind,
      origin: "sample",
      completionRule: "proximity",
      presenter: record.presenter ?? record.artistName,
      contentOrigin: "infrastructure",
    }),
  );
