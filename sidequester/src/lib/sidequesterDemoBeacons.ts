import {
  clockRadiusToLatLng,
  isServiceBeacon,
  manCenterForYear,
  type SidequesterBeacon,
} from "@artelier/playa-core";

/**
 * Demo pins — festival **services** only (projects come from Supabase).
 * Disable: VITE_INCLUDE_DEMO_BEACONS=false
 */
export const SIDEQUESTER_INCLUDE_DEMO_BEACONS =
  import.meta.env.VITE_INCLUDE_DEMO_BEACONS !== "false";

const DELETED_DEMO_BEACONS_KEY = "sideburns.deleted-demo-beacons.v1";

export function loadDeletedDemoBeaconIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DELETED_DEMO_BEACONS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is string => typeof id === "string"),
    );
  } catch {
    return new Set();
  }
}

/** Admin removals of stock demo pins — keep them from coming back on this device. */
export function rememberDeletedDemoBeacon(id: string) {
  if (typeof window === "undefined" || !id.startsWith("demo-")) return;
  const ids = loadDeletedDemoBeaconIds();
  if (ids.has(id)) return;
  ids.add(id);
  window.localStorage.setItem(
    DELETED_DEMO_BEACONS_KEY,
    JSON.stringify([...ids]),
  );
}

const MAN_2026 = manCenterForYear(2026);
const DEMO_CREATED_AT = "2026-07-30T16:00:00.000Z";

function at(
  hour: number,
  minute: number,
  distanceFeet: number,
): { lat: number; lng: number } {
  return clockRadiusToLatLng(hour, minute, distanceFeet, MAN_2026);
}

function demoBeacon(
  partial: Omit<SidequesterBeacon, "createdAt" | "live" | "startsAt" | "expiresAt"> &
    Partial<Pick<SidequesterBeacon, "startsAt" | "expiresAt" | "live">>,
): SidequesterBeacon {
  return {
    createdAt: DEMO_CREATED_AT,
    startsAt: null,
    expiresAt: null,
    live: false,
    ...partial,
  };
}

/** Festival infrastructure demos shown when demos are enabled. */
export const SIDEQUESTER_SERVICE_DEMO_BEACONS: SidequesterBeacon[] = [
  demoBeacon({
    id: "demo-med-3plaza",
    kind: "med_tent",
    details: "3:00 Plaza medical — first aid.",
    ...at(3, 0, 2500),
  }),
  demoBeacon({
    id: "demo-med-9plaza",
    kind: "med_tent",
    details: "9:00 Plaza medical tent.",
    ...at(9, 0, 2500),
  }),
  demoBeacon({
    id: "demo-med-center-camp",
    kind: "med_tent",
    details: "Center Camp medical outpost.",
    ...at(6, 0, 1800),
  }),
  demoBeacon({
    id: "demo-ranger-hq",
    kind: "ranger",
    details: "Ranger HQ — lost & found, mediation, night patrols.",
    ...at(5, 45, 2100),
  }),
  demoBeacon({
    id: "demo-ranger-3plaza",
    kind: "ranger",
    details: "3:00 Plaza Ranger outpost.",
    ...at(3, 0, 2400),
  }),
  demoBeacon({
    id: "demo-ranger-9plaza",
    kind: "ranger",
    details: "9:00 Plaza Ranger outpost.",
    ...at(9, 0, 2400),
  }),
  demoBeacon({
    id: "demo-dmv-main",
    kind: "dmv",
    details: "DMV — mutant vehicle registration & inspections.",
    ...at(7, 30, 2200),
  }),
  demoBeacon({
    id: "demo-dmv-gate",
    kind: "dmv",
    details: "DMV satellite near Gate Road.",
    ...at(6, 0, 5200),
  }),
  demoBeacon({
    id: "demo-bike-7",
    kind: "bike_shop",
    details: "Staffed bike repair — tubes, pumps, lights.",
    ...at(7, 0, 3000),
  }),
  demoBeacon({
    id: "demo-bike-4",
    kind: "bike_shop",
    details: "Bike shop + loaner pumps.",
    ...at(4, 30, 3800),
  }),
  demoBeacon({
    id: "demo-bike-10",
    kind: "bike_shop",
    details: "Night bike clinic — bring lights to check.",
    ...at(10, 0, 3400),
  }),
  demoBeacon({
    id: "demo-rr-3esplanade",
    kind: "restroom",
    details: "3:00 & Esplanade",
    updates: [
      {
        id: "demo-rr-3-u1",
        text: "Port-o-potties out of order",
        createdAt: "2026-08-04T18:14:00.000Z",
      },
      {
        id: "demo-rr-3-u2",
        text: "Fixed",
        createdAt: "2026-08-04T19:02:00.000Z",
      },
    ],
    ...at(3, 0, 2650),
  }),
  demoBeacon({
    id: "demo-rr-9esplanade",
    kind: "restroom",
    details: "9:00 & Esplanade",
    updates: [
      {
        id: "demo-rr-9-u1",
        text: "Line moving slowly",
        createdAt: "2026-08-04T17:40:00.000Z",
      },
    ],
    ...at(9, 0, 2650),
  }),
  demoBeacon({
    id: "demo-rr-6deep",
    kind: "restroom",
    details: "Mid-city toward 6:00",
    updates: [],
    ...at(6, 0, 4200),
  }),
  demoBeacon({
    id: "demo-rr-12plaza",
    kind: "restroom",
    details: "12:00 plaza",
    updates: [
      {
        id: "demo-rr-12-u1",
        text: "Handwash empty — refill requested",
        createdAt: "2026-08-04T16:20:00.000Z",
      },
      {
        id: "demo-rr-12-u2",
        text: "Restocked",
        createdAt: "2026-08-04T17:05:00.000Z",
      },
    ],
    ...at(12, 0, 3000),
  }),
];

export function mergeSidequesterDemoBeacons(
  beacons: SidequesterBeacon[],
): SidequesterBeacon[] {
  // Drop legacy demo sidequests / food / sets; keep user pins + service demos.
  const withoutRetiredDemos = beacons.filter((b) => {
    if (!b.id.startsWith("demo-")) return true;
    return isServiceBeacon(b.kind);
  });
  const withoutDemos = withoutRetiredDemos.filter(
    (b) => !b.id.startsWith("demo-"),
  );
  if (!SIDEQUESTER_INCLUDE_DEMO_BEACONS) return withoutDemos;
  const deletedDemos = loadDeletedDemoBeaconIds();
  const storedDemos = new Map(
    withoutRetiredDemos
      .filter((b) => b.id.startsWith("demo-") && !deletedDemos.has(b.id))
      .map((b) => [b.id, b]),
  );
  const byId = new Map(withoutDemos.map((b) => [b.id, b]));
  for (const demo of SIDEQUESTER_SERVICE_DEMO_BEACONS) {
    if (deletedDemos.has(demo.id)) continue;
    const stored = storedDemos.get(demo.id);
    // Keep community updates posted on this device across reloads.
    byId.set(
      demo.id,
      stored?.updates && stored.updates.length > (demo.updates?.length ?? 0)
        ? { ...demo, updates: stored.updates }
        : demo,
    );
  }
  return [...byId.values()];
}
