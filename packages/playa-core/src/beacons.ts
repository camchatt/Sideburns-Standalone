export type ServiceLayerKind =
  | "service"
  | "med_tent"
  | "ranger"
  | "dmv"
  | "bike_shop"
  | "restroom";

/** Live music / DJ sets currently playing on the playa. */
export type SetLayerKind = "set";

export type SidequesterBeaconKind =
  | "general"
  | "sidequest"
  | "quest"
  | "tech_support"
  | "bike_stuff"
  | "popup_event"
  | "weird"
  | "food"
  | ServiceLayerKind
  | SetLayerKind;

/** Beacon kinds that live under the Sidequests map layer. */
export type SidequestLayerKind = Exclude<
  SidequesterBeaconKind,
  "food" | ServiceLayerKind | SetLayerKind
>;

export type BeaconMapLayer = "sidequest" | "food" | "service" | "set";

/** Larry Harvey’s Ten Principles — tags for open sidequest pins. */
export const BURNING_MAN_PRINCIPLES = [
  "Radical Inclusion",
  "Gifting",
  "Decommodification",
  "Radical Self-reliance",
  "Radical Self-expression",
  "Communal Effort",
  "Civic Responsibility",
  "Leaving No Trace",
  "Participation",
  "Immediacy",
] as const;

export type BurningManPrinciple = (typeof BURNING_MAN_PRINCIPLES)[number];

export function isBurningManPrinciple(
  value: unknown,
): value is BurningManPrinciple {
  return (
    typeof value === "string" &&
    (BURNING_MAN_PRINCIPLES as readonly string[]).includes(value)
  );
}

/** Status note on a service (or other) pin — shown in a timeline. */
export type BeaconUpdate = {
  id: string;
  text: string;
  createdAt: string;
};

/** Another device verified this pin is in the right place. */
export type BeaconLocationConfirmation = {
  deviceId: string;
  confirmedAt: string;
};

export type SidequesterBeacon = {
  id: string;
  kind: SidequesterBeaconKind;
  details: string;
  lat: number;
  lng: number;
  createdAt: string;
  /** ISO datetime for pop-up events and scheduled sets. */
  startsAt?: string | null;
  /** ISO datetime when a timed beacon (e.g. tech support) auto-clears. */
  expiresAt?: string | null;
  /** Sidequest is happening now — shown as a live pin on the map. */
  live?: boolean;
  /** Quest engine: camp or brand presenting the quest. */
  sponsor?: string | null;
  /** Quest engine: what a finisher gets. */
  reward?: string | null;
  /** Multi-stop quest thread linked to this hub beacon. */
  questThreadId?: string | null;
  /** Quest engine: ISO datetime this device completed the quest. */
  completedAt?: string | null;
  /** Quest engine: completions reported by everyone (seeded until synced). */
  completions?: number;
  /** Chronological status updates (services / sets). Newest last. */
  updates?: BeaconUpdate[];
  /** Hero image for set cards (and similar). */
  imageUrl?: string | null;
  /** Camp, stage, or place label (sets). */
  place?: string | null;
  /** Device that dropped this pin (creator can’t self-confirm location). */
  createdBy?: string | null;
  /** Crowd checks that the pin is where it claims to be. */
  locationConfirmations?: BeaconLocationConfirmation[];
  /** Optional Burning Man principle tag (sidequest pins). */
  principle?: BurningManPrinciple | null;
  /** Longer blurb for Mission sideburns (name stays in `details`). */
  description?: string | null;
};

/** Tech support pins clear after this window unless refreshed. */
export const TECH_SUPPORT_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

type BeaconKindMeta = {
  id: SidequesterBeaconKind;
  label: string;
  color: string;
  hint: string;
  layer: BeaconMapLayer;
};

export const SIDEQUESTER_BEACON_KINDS: BeaconKindMeta[] = [
  {
    id: "general",
    label: "General",
    color: "#a89b86",
    hint: "Legacy — folded into Sidequest",
    layer: "sidequest",
  },
  {
    id: "sidequest",
    label: "Sideburns",
    color: "#ff6b9d",
    hint: "Gifts, asks, oddities, meetups — tag a principle if it fits",
    layer: "sidequest",
  },
  {
    id: "quest",
    label: "Quest",
    color: "#c44569",
    hint: "Multi-stop thread with a reward — place stops like a route",
    layer: "sidequest",
  },
  {
    id: "tech_support",
    label: "Tech Support",
    color: "#5eb0ff",
    hint: "LEDs, generators, radios, fixes — auto-clears after 1 hour",
    layer: "sidequest",
  },
  {
    id: "bike_stuff",
    label: "Bike Stuff",
    color: "#6bcf7a",
    hint: "Repairs, lights, lock help, rides",
    layer: "sidequest",
  },
  {
    id: "popup_event",
    label: "Meet up",
    color: "#7dcea0",
    hint: "Timed gatherings, meetups, shows, ceremonies",
    layer: "sidequest",
  },
  {
    id: "weird",
    label: "Weirdness",
    color: "#7ec8c0",
    hint: "Legacy — folded into Sidequest",
    layer: "sidequest",
  },
  {
    id: "food",
    label: "Food",
    color: "#f0a06a",
    hint: "Gifts, leftovers, camp kitchens, snack finds",
    layer: "food",
  },
  {
    id: "service",
    label: "Service",
    color: "#8b5fbf",
    hint: "User-added camp services and resources",
    layer: "service",
  },
  {
    id: "med_tent",
    label: "Med Tent",
    color: "#3d8fc4",
    hint: "First aid, medical support",
    layer: "service",
  },
  {
    id: "ranger",
    label: "Rangers",
    color: "#3d8fc4",
    hint: "Black Rock Rangers — help, mediation, lost people",
    layer: "service",
  },
  {
    id: "dmv",
    label: "DMV",
    color: "#3d8fc4",
    hint: "Department of Mutant Vehicles — registration & inspections",
    layer: "service",
  },
  {
    id: "bike_shop",
    label: "Bike Shop",
    color: "#3d8fc4",
    hint: "Staffed repairs, parts, pump stations",
    layer: "service",
  },
  {
    id: "restroom",
    label: "Restrooms",
    color: "#3d8fc4",
    hint: "Porta-potties, banked toilets, wash",
    layer: "service",
  },
  {
    id: "set",
    label: "Set",
    color: "#c8ff00",
    hint: "Who’s playing right now — live music / DJ sets on the playa",
    layer: "set",
  },
];

export const SIDEQUEST_LAYER_KINDS = SIDEQUESTER_BEACON_KINDS.filter(
  (k): k is BeaconKindMeta & { id: SidequestLayerKind; layer: "sidequest" } =>
    k.layer === "sidequest",
);

export const SERVICE_LAYER_KINDS = SIDEQUESTER_BEACON_KINDS.filter(
  (k): k is BeaconKindMeta & { id: ServiceLayerKind; layer: "service" } =>
    k.layer === "service",
);

export const SET_LAYER_KINDS = SIDEQUESTER_BEACON_KINDS.filter(
  (k): k is BeaconKindMeta & { id: SetLayerKind; layer: "set" } =>
    k.layer === "set",
);

/** Directory categories for the Resources hub (filter → list → pin). */
export type ResourceCategoryId =
  | "infrastructure"
  | "sideburns"
  | "party"
  | "mine";

export type ResourceCategory = {
  id: ResourceCategoryId;
  label: string;
  kinds: readonly SidequesterBeaconKind[];
};

export const RESOURCE_CATEGORIES: readonly ResourceCategory[] = [
  {
    id: "infrastructure",
    label: "City",
    kinds: ["med_tent", "ranger", "dmv", "restroom", "bike_shop"],
  },
  {
    id: "mine",
    label: "My beacons",
    /** Filtered by createdBy device id — kinds listed for docs only. */
    kinds: [],
  },
  {
    id: "sideburns",
    label: "Sideburns",
    kinds: ["sidequest", "general", "weird", "popup_event", "quest"],
  },
  {
    id: "party",
    label: "Party",
    /** Invite/join codes — not a pin list. */
    kinds: [],
  },
] as const;

export function resourceCategoryById(
  id: ResourceCategoryId,
): ResourceCategory | undefined {
  return RESOURCE_CATEGORIES.find((c) => c.id === id);
}

/** Directory / list label for a pin kind (My beacons, Sideburns, etc.). */
export function beaconDirectoryLabel(kind: SidequesterBeaconKind): string {
  if (kind === "sidequest" || kind === "general" || kind === "weird") {
    return "Sideburns";
  }
  if (kind === "popup_event") return "Meet up";
  if (kind === "quest") return "Quest";
  if (kind === "food") return "Food";
  if (kind === "set") return "Set";
  if (kind === "service") return "Service";
  if (
    kind === "med_tent" ||
    kind === "ranger" ||
    kind === "dmv" ||
    kind === "bike_shop" ||
    kind === "restroom"
  ) {
    return beaconKindMeta(kind).label;
  }
  return beaconKindMeta(kind).label;
}

export function beaconsInResourceCategory(
  beacons: SidequesterBeacon[],
  categoryId: ResourceCategoryId,
  deviceId?: string,
): SidequesterBeacon[] {
  if (categoryId === "party") return [];
  if (categoryId === "mine") {
    const id =
      deviceId ??
      (typeof window !== "undefined" ? getSidequesterDeviceId() : "");
    return beacons
      .filter(
        (b) =>
          Boolean(id) &&
          b.createdBy === id &&
          !b.id.startsWith("demo-"),
      )
      .sort((a, b) => {
        const kindCmp = a.kind.localeCompare(b.kind);
        if (kindCmp !== 0) return kindCmp;
        return a.details.localeCompare(b.details);
      });
  }
  const category = resourceCategoryById(categoryId);
  if (!category) return [];
  const kindSet = new Set<string>(category.kinds);
  return beacons
    .filter((b) => kindSet.has(b.kind))
    .sort((a, b) => {
      const kindCmp = a.kind.localeCompare(b.kind);
      if (kindCmp !== 0) return kindCmp;
      return a.details.localeCompare(b.details);
    });
}

export function beaconMapLayer(kind: SidequesterBeaconKind): BeaconMapLayer {
  return beaconKindMeta(kind).layer;
}

export function isFoodBeacon(kind: SidequesterBeaconKind): boolean {
  return kind === "food";
}

export function isServiceBeacon(kind: SidequesterBeaconKind): kind is ServiceLayerKind {
  return beaconMapLayer(kind) === "service";
}

/** Festival infrastructure (City layer) — not user-dropped camp services. */
export const CITY_SERVICE_KIND_IDS = [
  "med_tent",
  "ranger",
  "dmv",
  "bike_shop",
  "restroom",
] as const satisfies readonly ServiceLayerKind[];

export type CityServiceKind = (typeof CITY_SERVICE_KIND_IDS)[number];

export function isCityServiceKind(
  kind: SidequesterBeaconKind,
): kind is CityServiceKind {
  return (CITY_SERVICE_KIND_IDS as readonly string[]).includes(kind);
}

export function isSidequestBeacon(kind: SidequesterBeaconKind): kind is SidequestLayerKind {
  return beaconMapLayer(kind) === "sidequest";
}

export function isSetBeacon(kind: SidequesterBeaconKind): kind is SetLayerKind {
  return beaconMapLayer(kind) === "set";
}

/** Live set pins only — who’s playing right now. */
export function isLiveSetBeacon(beacon: SidequesterBeacon): boolean {
  return isSetBeacon(beacon.kind) && Boolean(beacon.live);
}

/** Set pin visible on the Sets layer (live now or scheduled). */
export function isVisibleSetBeacon(beacon: SidequesterBeacon): boolean {
  return (
    isSetBeacon(beacon.kind) &&
    (Boolean(beacon.live) || Boolean(beacon.startsAt))
  );
}

const DEVICE_ID_KEY = "artelier.sidequester.device-id.v1";

/** Stable per-browser id so location confirms can exclude the creator. */
export function getSidequesterDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `device-ephemeral-${Date.now()}`;
  }
}

export function isBeaconLocationConfirmed(
  beacon: Pick<SidequesterBeacon, "locationConfirmations">,
): boolean {
  return (beacon.locationConfirmations?.length ?? 0) > 0;
}

/** True when this device may add a location confirmation (not creator, not already). */
export function canConfirmBeaconLocation(
  beacon: Pick<
    SidequesterBeacon,
    "createdBy" | "locationConfirmations"
  >,
  deviceId: string,
): boolean {
  if (!deviceId || deviceId === "server") return false;
  if (beacon.createdBy && beacon.createdBy === deviceId) return false;
  return !(beacon.locationConfirmations ?? []).some(
    (c) => c.deviceId === deviceId,
  );
}

/**
 * True when this device may manually remove the pin.
 * Timed expiry / prune still clears pins for everyone.
 */
export function canRemoveBeacon(
  beacon: Pick<SidequesterBeacon, "createdBy">,
  deviceId: string,
): boolean {
  if (!deviceId || deviceId === "server") return false;
  if (!beacon.createdBy) return false;
  return beacon.createdBy === deviceId;
}

export function confirmBeaconLocation(
  beacon: SidequesterBeacon,
  deviceId: string,
): SidequesterBeacon {
  if (!canConfirmBeaconLocation(beacon, deviceId)) return beacon;
  const next: BeaconLocationConfirmation = {
    deviceId,
    confirmedAt: new Date().toISOString(),
  };
  return {
    ...beacon,
    locationConfirmations: [...(beacon.locationConfirmations ?? []), next],
  };
}

/**
 * Flip scheduled sets to live once their start time has passed.
 * Returns the same array reference when nothing changed.
 */
export function promoteScheduledSets(
  beacons: SidequesterBeacon[],
  nowMs: number = Date.now(),
): SidequesterBeacon[] {
  let changed = false;
  const next = beacons.map((b) => {
    if (!isSetBeacon(b.kind) || b.live || !b.startsAt) return b;
    const start = new Date(b.startsAt).getTime();
    if (Number.isNaN(start) || start > nowMs) return b;
    changed = true;
    return { ...b, live: true };
  });
  return changed ? next : beacons;
}

/** Single-pin open asks (completion toggle) — includes legacy general / weird. */
export function isKindnessBeacon(kind: SidequesterBeaconKind): boolean {
  return kind === "sidequest" || kind === "general" || kind === "weird";
}

/** Multi-stop route quests (linked thread). */
export function isRouteQuestKind(kind: SidequesterBeaconKind): boolean {
  return kind === "quest";
}

/** Kinds that carry sponsor / reward fields. */
export function isQuestBeacon(kind: SidequesterBeaconKind): boolean {
  return isKindnessBeacon(kind) || isRouteQuestKind(kind);
}

export type QuestStats = {
  /** Quests currently on the map. */
  total: number;
  /** Quests this device has completed. */
  completedHere: number;
  /** Completions reported across everyone. */
  completions: number;
  /** Quests carrying a sponsor. */
  sponsored: number;
  /** Share of on-map quests this device has finished, 0–1. */
  rate: number;
};

export function questStats(
  beacons: SidequesterBeacon[],
  locallyCompletedIds: ReadonlySet<string> = new Set(),
): QuestStats {
  const quests = beacons.filter((b) => isQuestBeacon(b.kind));
  const completedHere = quests.filter(
    (b) =>
      locallyCompletedIds.has(b.id) ||
      (isRouteQuestKind(b.kind) && Boolean(b.completedAt)),
  ).length;
  const completions = quests.reduce((sum, b) => sum + (b.completions ?? 0), 0);
  const sponsored = quests.filter((b) => Boolean(b.sponsor?.trim())).length;
  return {
    total: quests.length,
    completedHere,
    completions,
    sponsored,
    rate: quests.length ? completedHere / quests.length : 0,
  };
}

/**
 * Adjust the shared completion counter without marking the pin done for everyone.
 */
export function adjustBeaconCompletions(
  beacon: SidequesterBeacon,
  delta: 1 | -1,
): SidequesterBeacon {
  const completions = beacon.completions ?? 0;
  return {
    ...beacon,
    completedAt: null,
    completions: Math.max(0, completions + delta),
  };
}

/**
 * Toggles this device's completion of a quest and keeps the reported
 * completion tally in step, so sponsors see a real finish count.
 * Prefer device-local completion + `adjustBeaconCompletions` for synced pins.
 */
export function toggleBeaconCompletion(
  beacon: SidequesterBeacon,
): SidequesterBeacon {
  const wasComplete = Boolean(beacon.completedAt);
  const completions = beacon.completions ?? 0;
  return {
    ...beacon,
    completedAt: wasComplete ? null : new Date().toISOString(),
    completions: wasComplete ? Math.max(0, completions - 1) : completions + 1,
  };
}

const STORAGE_KEY = "artelier.sidequester.beacons.v1";
/** Device-local: Sideburns pins this walker marked complete (hidden on their map). */
const LOCAL_COMPLETED_KEY = "artelier.sidequester.completed-beacons.v1";
/** One-shot: wipe stored sidequest / food / set pins; keep services. */
const CLEANUP_NON_SERVICE_KEY = "artelier.sidequester.cleared-non-service.v1";

export type LocalBeaconCompletions = Record<string, string>;

export function loadLocalBeaconCompletions(): LocalBeaconCompletions {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_COMPLETED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: LocalBeaconCompletions = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id === "string" && typeof at === "string") out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLocalBeaconCompletions(
  completions: LocalBeaconCompletions,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_COMPLETED_KEY, JSON.stringify(completions));
}

/**
 * Move legacy on-beacon `completedAt` into device-local storage so sync
 * does not hide the pin for everyone.
 */
export function migrateBeaconCompletionsToLocal(
  beacons: SidequesterBeacon[],
  existing: LocalBeaconCompletions = loadLocalBeaconCompletions(),
): {
  beacons: SidequesterBeacon[];
  localCompletions: LocalBeaconCompletions;
} {
  let changed = false;
  const localCompletions = { ...existing };
  const next = beacons.map((beacon) => {
    if (!isKindnessBeacon(beacon.kind) || !beacon.completedAt) return beacon;
    if (!localCompletions[beacon.id]) {
      localCompletions[beacon.id] = beacon.completedAt;
    }
    changed = true;
    return { ...beacon, completedAt: null };
  });
  if (changed) saveLocalBeaconCompletions(localCompletions);
  return { beacons: changed ? next : beacons, localCompletions };
}

export function isBeaconCompletedLocally(
  beaconId: string,
  localCompletions: LocalBeaconCompletions,
): boolean {
  return Boolean(localCompletions[beaconId]);
}

export function beaconKindMeta(kind: SidequesterBeaconKind) {
  return (
    SIDEQUESTER_BEACON_KINDS.find((k) => k.id === kind) ??
    SIDEQUESTER_BEACON_KINDS[0]
  );
}

export function formatBeaconStartsAt(startsAt: string | null | undefined): string | null {
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Remaining time label for timed beacons, e.g. "42m left". */
export function formatBeaconTimeRemaining(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return null;
  const remaining = end - nowMs;
  if (remaining <= 0) return "Expired";
  const totalMinutes = Math.ceil(remaining / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m left`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m left` : `${hours}h left`;
}

export function isBeaconExpired(
  beacon: Pick<SidequesterBeacon, "expiresAt">,
  nowMs: number = Date.now(),
): boolean {
  if (!beacon.expiresAt) return false;
  const end = new Date(beacon.expiresAt).getTime();
  if (Number.isNaN(end)) return false;
  return end <= nowMs;
}

export function pruneExpiredBeacons(
  beacons: SidequesterBeacon[],
  nowMs: number = Date.now(),
): SidequesterBeacon[] {
  return beacons.filter((b) => !isBeaconExpired(b, nowMs));
}

/** Value for `<input type="datetime-local" />` from an ISO string. */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function loadSidequesterBeacons(): SidequesterBeacon[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    let beacons: SidequesterBeacon[] = [];
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        beacons = parsed.filter(isBeacon).map(normalizeBeacon);
      }
    }
    beacons = pruneExpiredBeacons(beacons);
    // One-time cleanup: remove user/demo sidequests, food, and sets.
    // Projects (Supabase) and services stay. New sets can be added afterward.
    if (!window.localStorage.getItem(CLEANUP_NON_SERVICE_KEY)) {
      beacons = beacons.filter((b) => isServiceBeacon(b.kind));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(beacons));
      window.localStorage.setItem(CLEANUP_NON_SERVICE_KEY, "1");
    }
    return beacons;
  } catch {
    return [];
  }
}

export function saveSidequesterBeacons(beacons: SidequesterBeacon[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(pruneExpiredBeacons(beacons)),
  );
}

export function createSidequesterBeacon(input: {
  kind: SidequesterBeaconKind;
  details: string;
  lat: number;
  lng: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  live?: boolean;
  sponsor?: string | null;
  reward?: string | null;
  questThreadId?: string | null;
  imageUrl?: string | null;
  place?: string | null;
  createdBy?: string | null;
  principle?: BurningManPrinciple | null;
  description?: string | null;
}): SidequesterBeacon {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `beacon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  const expiresAt =
    input.expiresAt !== undefined
      ? input.expiresAt
      : input.kind === "tech_support"
        ? new Date(Date.now() + TECH_SUPPORT_TIMEOUT_MS).toISOString()
        : null;
  const details = input.details.trim();
  // Fold legacy general / weird into the combined Sidequest kind.
  const kind: SidequesterBeaconKind =
    input.kind === "general" || input.kind === "weird"
      ? "sidequest"
      : input.kind;
  const isSet = isSetBeacon(kind);
  const hasQuestFields = isQuestBeacon(kind);
  const live =
    (isSidequestBeacon(kind) || isSet) && Boolean(input.live);
  const startsAt =
    kind === "popup_event" || (isSet && !live)
      ? (input.startsAt ?? null)
      : null;
  return {
    id,
    kind,
    details,
    lat: input.lat,
    lng: input.lng,
    createdAt,
    startsAt,
    expiresAt,
    live,
    sponsor: hasQuestFields ? (input.sponsor?.trim() || null) : null,
    reward: hasQuestFields ? (input.reward?.trim() || null) : null,
    questThreadId: isRouteQuestKind(kind)
      ? (input.questThreadId ?? null)
      : null,
    completedAt: null,
    completions: isKindnessBeacon(kind) ? 0 : undefined,
    updates: isServiceBeacon(kind) || isSet ? [] : undefined,
    imageUrl: isSet ? (input.imageUrl?.trim() || null) : null,
    place: isSet ? (input.place?.trim() || null) : null,
    createdBy: input.createdBy?.trim() || null,
    locationConfirmations: isSet ? [] : undefined,
    principle: isKindnessBeacon(kind)
      ? input.principle && isBurningManPrinciple(input.principle)
        ? input.principle
        : null
      : undefined,
    description: isKindnessBeacon(kind)
      ? input.description?.trim() || null
      : undefined,
  };
}

export function appendBeaconUpdate(
  beacon: SidequesterBeacon,
  text: string,
): SidequesterBeacon {
  const trimmed = text.trim();
  if (!trimmed) return beacon;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `update-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const next: BeaconUpdate = {
    id,
    text: trimmed,
    createdAt: new Date().toISOString(),
  };
  return {
    ...beacon,
    updates: [...(beacon.updates ?? []), next],
  };
}

/** Compact clock label for update timelines (e.g. 2:14p). */
export function formatBeaconUpdateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const h12 = hours % 12 || 12;
  const suffix = hours < 12 ? "a" : "p";
  return `${h12}:${minutes.toString().padStart(2, "0")}${suffix}`;
}

/** Backfill expiresAt for older tech_support pins that predate timeouts. */
function normalizeBeaconTimeouts(beacon: SidequesterBeacon): SidequesterBeacon {
  if (beacon.kind !== "tech_support") return beacon;
  if (beacon.expiresAt) return beacon;
  const created = new Date(beacon.createdAt).getTime();
  if (Number.isNaN(created)) return beacon;
  return {
    ...beacon,
    expiresAt: new Date(created + TECH_SUPPORT_TIMEOUT_MS).toISOString(),
  };
}

/** Fold legacy General / Weirdness into Sidequest; keep completion fields. */
function normalizeLegacySidequestKinds(
  beacon: SidequesterBeacon,
): SidequesterBeacon {
  if (beacon.kind !== "general" && beacon.kind !== "weird") return beacon;
  return {
    ...beacon,
    kind: "sidequest",
    completions: beacon.completions ?? 0,
    principle: isBurningManPrinciple(beacon.principle)
      ? beacon.principle
      : (beacon.principle ?? null),
  };
}

function normalizeBeacon(beacon: SidequesterBeacon): SidequesterBeacon {
  return normalizeLegacySidequestKinds(normalizeBeaconTimeouts(beacon));
}

function isBeacon(value: unknown): value is SidequesterBeacon {
  if (!value || typeof value !== "object") return false;
  const b = value as Partial<SidequesterBeacon>;
  const startsAtOk =
    b.startsAt === undefined ||
    b.startsAt === null ||
    typeof b.startsAt === "string";
  const expiresAtOk =
    b.expiresAt === undefined ||
    b.expiresAt === null ||
    typeof b.expiresAt === "string";
  const liveOk = b.live === undefined || typeof b.live === "boolean";
  const optionalString = (value: unknown) =>
    value === undefined || value === null || typeof value === "string";
  const questOk =
    optionalString(b.sponsor) &&
    optionalString(b.reward) &&
    optionalString(b.description) &&
    optionalString(b.questThreadId) &&
    optionalString(b.completedAt) &&
    (b.completions === undefined || typeof b.completions === "number");
  const setOk = optionalString(b.imageUrl) && optionalString(b.place);
  const createdByOk = optionalString(b.createdBy);
  const principleOk =
    b.principle === undefined ||
    b.principle === null ||
    isBurningManPrinciple(b.principle);
  const confirmationsOk =
    b.locationConfirmations === undefined ||
    (Array.isArray(b.locationConfirmations) &&
      b.locationConfirmations.every(
        (c) =>
          c &&
          typeof c === "object" &&
          typeof (c as BeaconLocationConfirmation).deviceId === "string" &&
          typeof (c as BeaconLocationConfirmation).confirmedAt === "string",
      ));
  const updatesOk =
    b.updates === undefined ||
    (Array.isArray(b.updates) &&
      b.updates.every(
        (u) =>
          u &&
          typeof u === "object" &&
          typeof (u as BeaconUpdate).id === "string" &&
          typeof (u as BeaconUpdate).text === "string" &&
          typeof (u as BeaconUpdate).createdAt === "string",
      ));
  return (
    questOk &&
    setOk &&
    createdByOk &&
    principleOk &&
    confirmationsOk &&
    updatesOk &&
    typeof b.id === "string" &&
    typeof b.kind === "string" &&
    SIDEQUESTER_BEACON_KINDS.some((k) => k.id === b.kind) &&
    typeof b.details === "string" &&
    typeof b.lat === "number" &&
    typeof b.lng === "number" &&
    typeof b.createdAt === "string" &&
    startsAtOk &&
    expiresAtOk &&
    liveOk
  );
}
