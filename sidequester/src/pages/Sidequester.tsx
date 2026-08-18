import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Disc3,
  Heart,
  Layers,
  MapPin,
  Plus,
  Search,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  PlayaMap,
  QUEST_GUARDRAILS,
  appendBeaconUpdate,
  adjustBeaconCompletions,
  beaconDirectoryLabel,
  beaconKindMeta,
  beaconMapLayer,
  beaconsInResourceCategory,
  BURNING_MAN_PRINCIPLES,
  canConfirmBeaconLocation,
  canRemoveBeacon,
  clockRadiusToLatLng,
  completeQuestStop,
  confirmBeaconLocation,
  createQuestThread,
  createSidequesterBeacon,
  deleteRemoteBeacon,
  fetchPresenceByCodes,
  fetchRemoteBeacons,
  followShareCode,
  formatShareCode,
  getOrCreateShareCode,
  formatBeaconStartsAt,
  formatBeaconTimeRemaining,
  formatBeaconUpdateTime,
  formatPlacementLabel,
  fromDatetimeLocalValue,
  getSidequesterDeviceId,
  loadFollowedShareCodes,
  loadShareLocationEnabled,
  PRESENCE_STALE_MS,
  publishPresence,
  saveShareLocationEnabled,
  unfollowShareCode,
  isBeaconCompletedLocally,
  isBeaconLocationConfirmed,
  isBurningManPrinciple,
  isCityServiceKind,
  isFoodBeacon,
  isKindnessBeacon,
  isQuestBeacon,
  isRouteQuestKind,
  isServiceBeacon,
  isSetBeacon,
  isSidequestBeacon,
  isUserServiceKind,
  CITY_SERVICE_KIND_IDS,
  isVisibleSetBeacon,
  listBurningManFacets,
  listBurningManMapPlacements,
  loadLocalBeaconCompletions,
  loadQuestProgress,
  loadQuestThreads,
  loadSidequesterBeacons,
  manCenterForYear,
  mergeLocalAndRemoteBeacons,
  migrateBeaconCompletionsToLocal,
  progressFor,
  promoteScheduledSets,
  pruneExpiredBeacons,
  RESOURCE_CATEGORIES,
  resourceCategoryById,
  saveLocalBeaconCompletions,
  saveQuestProgress,
  saveQuestThreads,
  saveSidequesterBeacons,
  serviceIconForKind,
  upsertRemoteBeacon,
  upsertRemoteBeacons,
  visibleQuestPins,
  type BeaconUpdate,
  type BurningManFacets,
  type BurningManMapPlacements,
  type BurningManPrinciple,
  type BurningManProject,
  type LocalBeaconCompletions,
  type PlayaFriendPresence,
  type PlayaHuntPin,
  type PlayaMapDataMode,
  type QuestThread,
  type QuestThreadProgress,
  type ResourceCategoryId,
  type ServiceLayerKind,
  type SidequestLayerKind,
  type SidequesterBeacon,
  type SidequesterBeaconKind,
} from "@artelier/playa-core";
import { LegalAckBanner } from "@/components/LegalAckBanner";
import {
  QuestComposer,
  type DraftQuestStop,
  type MissionCompletion,
} from "@/components/quest/QuestComposer";
import { QuestPlayDetail } from "@/components/quest/QuestPlayDetail";
import { useSensorPermissionGate } from "@/components/SensorPermissionGate";
import {
  mergeSidequesterDemoBeacons,
  rememberDeletedDemoBeacon,
} from "@/lib/sidequesterDemoBeacons";
import {
  OFFICIAL_2026_MAP_ENABLED,
  applyOfficialInfrastructureBeacons,
  loadOfficial2026MapData,
  type Official2026MapData,
} from "@/lib/officialMapData";
import { useUserLocation } from "@/lib/useUserLocation";


/**
 * Layer-control standard:
 * - LAYER_SURFACE = frosted cream chrome (inactive).
 * - LAYER_SURFACE_ON = solid light cream (Sidequests selected + filter column).
 * - Accent fills mark Projects / Services on-state.
 * - Sidequests: full tennis-green when on + collapsed; nested green in cream when filters open.
 */
/** Frosted cream (rgba — works without color-mix on older Safari). */
const LAYER_SURFACE = "rgba(244, 240, 232, 0.42)";
const LAYER_SURFACE_ON = "#f4f0e8";
const LAYER_COLOR_PROJECTS = "#5a5f66";
const LAYER_COLOR_SERVICES = "#3d8fc4";
/** Camp services layer — purple. */
const LAYER_COLOR_CAMP_SERVICE = "#8b5fbf";
/** Tennis-ball green with a mint lean. */
const LAYER_COLOR_SIDEQUESTS = "#d4f05c";
/** Sets layer on-state — acid lime. */
const LAYER_COLOR_SETS = "#c8ff00";
/** User-built main quests (multi-stop threads). */
const LAYER_COLOR_HUNT = "#c44569";
const LAYER_SHADOW =
  "0 1px 3px rgba(23, 19, 15, 0.16), 0 0 0 1px rgba(23, 19, 15, 0.04)";

/** Playa geometry / Man spike year for map rings. */
const PLAYA_EVENT_YEAR = 2026;
const PENDING_BEACON_UPLOADS_KEY = "sideburns.pending-beacon-uploads.v1";

function loadPendingBeaconUploadIds(): Set<string> {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(PENDING_BEACON_UPLOADS_KEY) ?? "[]",
    ) as unknown;
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function savePendingBeaconUploadIds(ids: Set<string>) {
  window.localStorage.setItem(
    PENDING_BEACON_UPLOADS_KEY,
    JSON.stringify([...ids]),
  );
}

function markBeaconUploadPending(id: string) {
  const ids = loadPendingBeaconUploadIds();
  ids.add(id);
  savePendingBeaconUploadIds(ids);
}

function clearBeaconUploadPending(id: string) {
  const ids = loadPendingBeaconUploadIds();
  if (!ids.delete(id)) return;
  savePendingBeaconUploadIds(ids);
}

const SIDEBAR_STICKY =
  "lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:overscroll-contain scrollbar-none";

const ALL_SIDEQUEST_KINDS_VISIBLE: Record<SidequestLayerKind, boolean> = {
  general: true,
  sidequest: true,
  quest: true,
  tech_support: true,
  bike_stuff: true,
  popup_event: true,
  weird: true,
};

/** All map filters in the single Layers group (small filled marks, no square chrome). */
const LAYER_FILTER_ITEMS: Array<{
  id:
    | SidequestLayerKind
    | "food"
    | "set"
    | "camp_service"
    | "projects"
    | "city";
  label: string;
  color: string;
  icon?: LucideIcon;
  imageSrc?: string;
  glyph?: string;
  /** Solid mark — fills with layer color, flips white when on. */
  filled?: boolean;
}> = [
  {
    id: "projects",
    label: "Projects",
    color: LAYER_COLOR_PROJECTS,
    imageSrc: "/icons/projects-eye.svg",
  },
  {
    id: "city",
    label: "City",
    color: LAYER_COLOR_SERVICES,
    imageSrc: "/icons/city-layer.svg",
  },
  {
    id: "sidequest",
    label: beaconKindMeta("sidequest").label,
    color: beaconKindMeta("sidequest").color,
    imageSrc: "/icons/sidequest-mark.png",
  },
  {
    id: "popup_event",
    label: beaconKindMeta("popup_event").label,
    color: beaconKindMeta("popup_event").color,
    imageSrc: "/icons/meetup-mark.png",
  },
  {
    id: "camp_service",
    label: beaconKindMeta("service").label,
    color: LAYER_COLOR_CAMP_SERVICE,
    icon: Heart,
    filled: true,
  },
  {
    id: "set",
    label: beaconKindMeta("set").label,
    color: LAYER_COLOR_SETS,
    imageSrc: "/icons/set-mark.png",
  },
  {
    id: "food",
    label: beaconKindMeta("food").label,
    color: beaconKindMeta("food").color,
    imageSrc: "/icons/food-mark.png",
  },
];

const SIDEQUEST_FILTER_KIND_IDS = LAYER_FILTER_ITEMS.filter(
  (
    item,
  ): item is typeof item & { id: SidequestLayerKind } =>
    item.id !== "food" &&
    item.id !== "set" &&
    item.id !== "camp_service" &&
    item.id !== "projects" &&
    item.id !== "city",
).map((item) => item.id);

/** Map filter: legacy general / weird count as Sidequest. */
function matchesSidequestFilter(
  kind: SidequesterBeaconKind,
  visible: Record<SidequestLayerKind, boolean>,
): boolean {
  if (kind === "general" || kind === "weird") {
    return visible.sidequest;
  }
  if (!(SIDEQUEST_FILTER_KIND_IDS as readonly string[]).includes(kind)) {
    return true;
  }
  return visible[kind as SidequestLayerKind];
}

const ALL_SERVICE_KINDS_VISIBLE: Record<ServiceLayerKind, boolean> = {
  service: true,
  med_tent: true,
  ranger: true,
  dmv: true,
  bike_shop: true,
  restroom: true,
};

/** City = festival infra; heart Service = user-dropped only (independent toggles). */
function isServiceKindVisible(
  kind: ServiceLayerKind,
  showCityServices: boolean,
  visibleServiceKinds: Record<ServiceLayerKind, boolean>,
): boolean {
  if (isUserServiceKind(kind)) return visibleServiceKinds.service;
  return showCityServices && visibleServiceKinds[kind];
}

/** Kinds offered in the Add a beacon composer (visual chip picker). */
const COMPOSER_KIND_IDS = [
  "sidequest",
  "popup_event",
  "service",
  "set",
  "food",
] as const satisfies readonly SidequesterBeaconKind[];

/** Icons for composer chips — same marks as the map layer filters. */
const COMPOSER_KIND_MARKS: Record<
  (typeof COMPOSER_KIND_IDS)[number],
  { imageSrc?: string; icon?: LucideIcon }
> = {
  sidequest: { imageSrc: "/icons/sidequest-mark.png" },
  popup_event: { imageSrc: "/icons/meetup-mark.png" },
  set: { imageSrc: "/icons/set-mark.png" },
  service: { icon: Heart },
  food: { imageSrc: "/icons/food-mark.png" },
};

/** Composer-only labels (map filters can keep shorter names). */
const COMPOSER_KIND_LABELS: Partial<
  Record<(typeof COMPOSER_KIND_IDS)[number], string>
> = {
  set: "Music",
};

const ADMIN_COMPOSER_CHIP_IDS = [
  ...COMPOSER_KIND_IDS.slice(0, 3),
  "city",
  ...COMPOSER_KIND_IDS.slice(3),
] as const;

type ComposerChipId =
  | (typeof COMPOSER_KIND_IDS)[number]
  | "city";

/** Owner-only delete on the public map; admin can remove any beacon. */
function mayRemoveBeacon(beacon: SidequesterBeacon, admin: boolean): boolean {
  if (admin) return true;
  if (isCityServiceKind(beacon.kind)) return false;
  return canRemoveBeacon(beacon, getSidequesterDeviceId());
}

const EXPIRE_QUICK_HOURS = [12, 24, 48, 72] as const;
const EXPIRE_HOUR_VALUES = Array.from({ length: 73 }, (_, i) => i); // 0–72h

function formatPostedAgo(createdAt: string, nowMs: number): string | null {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return null;
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - createdMs) / 1000));
  if (elapsedSeconds < 60) return "Posted just now";
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `Posted ${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Posted ${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `Posted ${elapsedDays}d ago`;
  const elapsedWeeks = Math.floor(elapsedDays / 7);
  if (elapsedWeeks < 5) return `Posted ${elapsedWeeks}w ago`;
  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) return `Posted ${elapsedMonths}mo ago`;
  const elapsedYears = Math.floor(elapsedDays / 365);
  return `Posted ${elapsedYears}y ago`;
}
const EXPIRE_MINUTE_VALUES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const EXPIRE_PICKER_ITEM_PX = 40;

/** Sheet positions, mobile only. Peek keeps the map dominant. */
type SheetSnap = "peek" | "half" | "full";

const SHEET_HEIGHT: Record<SheetSnap, string> = {
  peek: "0px",
  half: "36%",
  full: "70%",
};

/** Full expansion when tapping the peek tab / grabber. */
const SHEET_FULL_CSS = "70%";

/** Floating peek tab height — used for map control insets (no white card). */
const SHEET_PEEK_PX = 56;
const SHEET_HALF_RATIO = 0.36;
/** Map padding when the drawer is fully open (info card / pin detail). */
const SHEET_FULL_RATIO = 0.7;
/** Top search / layers row — keep selected pins below this chrome. */
const MAP_TOP_CHROME_PX = 88;
/** Cancel bar: p-4 top + min-h-12 button (bottom pad is safe-area). */
const PLACING_CANCEL_CHROME_PX = 64;

function sheetHeightPx(
  snap: SheetSnap,
  viewportHeight: number,
  fullRatio = SHEET_FULL_RATIO,
): number {
  if (snap === "peek") return SHEET_PEEK_PX;
  if (snap === "half") return viewportHeight * SHEET_HALF_RATIO;
  return viewportHeight * fullRatio;
}

function readSafeAreaBottom(): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)";
  document.body.appendChild(probe);
  const value = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return value;
}

/** Viewport height + home-indicator inset for map chrome layout. */
function useViewportMetrics() {
  const [metrics, setMetrics] = useState(() => ({
    height:
      typeof window !== "undefined"
        ? (window.visualViewport?.height ?? window.innerHeight)
        : 800,
    safeBottom: 0,
  }));
  useEffect(() => {
    let timer = 0;
    const measure = () => {
      // Debounce visualViewport thrash (URL bar / keyboard) so sheet + map
      // padding don't reflow every frame.
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const vv = window.visualViewport;
        setMetrics({
          height: vv?.height ?? window.innerHeight,
          safeBottom: readSafeAreaBottom(),
        });
      }, 80);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, []);
  return metrics;
}

/** Desktop keeps the three-column layout; below `lg` we go map-first. */
function useCompactLayout() {
  const [compact, setCompact] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    const onChange = (e: MediaQueryListEvent) => setCompact(e.matches);
    setCompact(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return compact;
}

/**
 * Sidequester — mobile-first playa map.
 * Compact: full-bleed map with a Google-Maps-style bottom sheet over it.
 * Desktop: chrome sidebar + map plane + floating selection card.
 */
export default function Sidequester({ admin = false }: { admin?: boolean } = {}) {
  const { beforeLocate, beforeCompass, prompt: sensorPrompt } =
    useSensorPermissionGate();
  const compact = useCompactLayout();
  const { height: viewportHeight, safeBottom } = useViewportMetrics();
  const userLocation = useUserLocation();
  const [facets, setFacets] = useState<BurningManFacets | null>(null);
  const [placements, setPlacements] = useState<BurningManMapPlacements>({
    years: [],
    mapped: [],
    unmapped: [],
  });
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapDataMode, setMapDataMode] =
    useState<PlayaMapDataMode>("legacy");
  const [officialMapData, setOfficialMapData] =
    useState<Official2026MapData | null>(null);
  const officialMapDataRef = useRef<Official2026MapData | null>(null);
  const mapDataModeRef = useRef<PlayaMapDataMode>("legacy");
  const [beacons, setBeacons] = useState<SidequesterBeacon[]>([]);
  const [localCompletions, setLocalCompletions] =
    useState<LocalBeaconCompletions>({});
  const [questThreads, setQuestThreads] = useState<QuestThread[]>([]);
  const [questProgress, setQuestProgress] = useState<QuestThreadProgress[]>(
    [],
  );
  const [selectedBeaconId, setSelectedBeaconId] = useState<string | null>(null);
  const [selectedHuntPinId, setSelectedHuntPinId] = useState<string | null>(
    null,
  );
  const [selectedQuestThreadId, setSelectedQuestThreadId] = useState<
    string | null
  >(null);
  const [selectedProject, setSelectedProject] = useState<BurningManProject | null>(
    null,
  );
  const [kind, setKind] = useState<SidequesterBeaconKind>("sidequest");
  const [details, setDetails] = useState("");
  const [description, setDescription] = useState("");
  const [reward, setReward] = useState("");
  const [principle, setPrinciple] = useState<BurningManPrinciple | "">("");
  /** Sideburns form: multi-stop Quest mode (left = Mission). */
  const [sideburnsQuestMode, setSideburnsQuestMode] = useState(false);
  /** Quest: after Next, open first-pin setup (before any stop is placed). */
  const [questSetupStarted, setQuestSetupStarted] = useState(false);
  const [setPlace, setSetPlace] = useState("");
  const [setLive, setSetLive] = useState(true);
  const [eventStartsAt, setEventStartsAt] = useState("");
  /** Stops for a Quest badge (route-style). */
  const [questStops, setQuestStops] = useState<DraftQuestStop[]>([]);
  const [questEpilogue, setQuestEpilogue] = useState("");
  const [missionTitle, setMissionTitle] = useState("");
  const [missionDetails, setMissionDetails] = useState("");
  const [missionCompletion, setMissionCompletion] =
    useState<MissionCompletion>(null);
  const [missionAnswer, setMissionAnswer] = useState("");
  const [missionClueImage, setMissionClueImage] = useState<string | null>(null);
  const [placingMode, setPlacingMode] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  /** Minutes until expiry; `null` = no expiration. */
  const [expireMinutes, setExpireMinutes] = useState<number | null>(60);
  const [formError, setFormError] = useState("");
  const [beaconComposerOpen, setBeaconComposerOpen] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showBeacons, setShowBeacons] = useState(true);
  const [showFood, setShowFood] = useState(true);
  const [showServices, setShowServices] = useState(admin);
  const [showSets, setShowSets] = useState(false);
  const [resourceCategoryId, setResourceCategoryId] =
    useState<ResourceCategoryId>("infrastructure");
  /** When set, map shows only this resource pin. */
  const [resourceIsolateId, setResourceIsolateId] = useState<string | null>(
    null,
  );
  /** Resources hub is browsing a category — map shows that category’s pins. */
  const [resourcesMapMode, setResourcesMapMode] = useState(false);
  const [myShareCode] = useState(() => getOrCreateShareCode());
  const [shareLocationOn, setShareLocationOn] = useState(() =>
    loadShareLocationEnabled(),
  );
  const [followedCodes, setFollowedCodes] = useState(() =>
    loadFollowedShareCodes(),
  );
  const [friendPresences, setFriendPresences] = useState<PlayaFriendPresence[]>(
    [],
  );
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [visibleBeaconKinds, setVisibleBeaconKinds] = useState(
    ALL_SIDEQUEST_KINDS_VISIBLE,
  );
  const [visibleServiceKinds, setVisibleServiceKinds] = useState(
    ALL_SERVICE_KINDS_VISIBLE,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("peek");
  const [mapControlsHost, setMapControlsHost] = useState<HTMLDivElement | null>(
    null,
  );
  const [locateHost, setLocateHost] = useState<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  /** Tombstones so sync polls can't resurrect a pin we just deleted. */
  const deletedBeaconIdsRef = useRef<Set<string>>(new Set());

  const applyMapInventory = useCallback((rows: SidequesterBeacon[]) => {
    const withDemos = mergeSidequesterDemoBeacons(rows);
    return applyOfficialInfrastructureBeacons(
      withDemos,
      officialMapDataRef.current?.toiletBeacons ?? [],
      officialMapDataRef.current?.safetyBeacons ?? [],
      mapDataModeRef.current === "official-2026",
    );
  }, []);

  useEffect(() => {
    if (!OFFICIAL_2026_MAP_ENABLED) return;
    let cancelled = false;
    loadOfficial2026MapData()
      .then((data) => {
        if (cancelled) return;
        officialMapDataRef.current = data;
        mapDataModeRef.current = "official-2026";
        setOfficialMapData(data);
        setMapDataMode("official-2026");
        setBeacons((previous) =>
          applyOfficialInfrastructureBeacons(
            mergeSidequesterDemoBeacons(previous),
            data.toiletBeacons,
            data.safetyBeacons,
            true,
          ),
        );
      })
      .catch((error) => {
        console.warn(
          "[sideburns map] official 2026 assets unavailable; using legacy map",
          error,
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMapReady(true);
    const migrated = migrateBeaconCompletionsToLocal(
      loadSidequesterBeacons(),
      loadLocalBeaconCompletions(),
    );
    setLocalCompletions(migrated.localCompletions);
    const local = applyMapInventory(migrated.beacons);
    setBeacons(promoteScheduledSets(local));
    setQuestThreads(loadQuestThreads());
    setQuestProgress(loadQuestProgress());

    let cancelled = false;

    const pullRemote = async (opts?: { pushPending?: boolean }) => {
      try {
        const remote = await fetchRemoteBeacons();
        if (cancelled) return;
        const remoteIds = new Set(remote.map((b) => b.id));
        const pendingUploadIds = loadPendingBeaconUploadIds();
        // Drop tombstones once the remote side no longer has them.
        for (const id of [...deletedBeaconIdsRef.current]) {
          if (!remote.some((b) => b.id === id)) {
            deletedBeaconIdsRef.current.delete(id);
          }
        }
        const deleted = deletedBeaconIdsRef.current;
        // Once a UUID pin has reached the shared database, remote absence is
        // authoritative. Keep a missing local UUID only when this device has
        // explicitly queued that new pin for its first upload.
        const localForMerge = loadSidequesterBeacons().filter(
          (b) =>
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              b.id,
            ) ||
            remoteIds.has(b.id) ||
            pendingUploadIds.has(b.id),
        );
        const mergedRaw = mergeLocalAndRemoteBeacons(
          localForMerge,
          remote,
        ).filter((b) => !deleted.has(b.id));
        const again = migrateBeaconCompletionsToLocal(
          mergedRaw,
          loadLocalBeaconCompletions(),
        );
        setLocalCompletions(again.localCompletions);
        const merged = applyMapInventory(again.beacons);
        setBeacons(promoteScheduledSets(merged));
        if (opts?.pushPending) {
          const pending = merged.filter(
            (b) =>
              !remoteIds.has(b.id) &&
              !deleted.has(b.id) &&
              pendingUploadIds.has(b.id),
          );
          if (pending.length) {
            void upsertRemoteBeacons(pending).then((result) => {
              if (result.ok) {
                for (const beacon of pending) {
                  clearBeaconUploadPending(beacon.id);
                }
              }
            });
          }
        }
      } catch (err) {
        console.warn("[sideburns sync] pull failed", err);
      }
    };

    void pullRemote({ pushPending: true });
    // Other devices' adds only show up if we keep pulling — one-shot load
    // made it look like only the first writer's pins were "shared".
    const pollId = window.setInterval(() => {
      void pullRemote({ pushPending: true });
    }, 12_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [applyMapInventory]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const nextNow = Date.now();
      setNowMs(nextNow);
      setBeacons((prev) => {
        const promoted = promoteScheduledSets(prev, nextNow);
        const next = pruneExpiredBeacons(promoted, nextNow);
        if (promoted === prev && next.length === prev.length) return prev;
        return next;
      });
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (
      selectedBeaconId &&
      !beacons.some((b) => b.id === selectedBeaconId)
    ) {
      setSelectedBeaconId(null);
    }
  }, [beacons, selectedBeaconId]);
  useEffect(() => {
    listBurningManFacets().then(setFacets).catch(() => setFacets(null));
  }, []);

  const selectedYear = facets?.years[0] ?? null;
  /** Man spike year + optional BM art facet year. */
  const selectedYears = useMemo(() => {
    const years = [PLAYA_EVENT_YEAR];
    if (selectedYear != null && selectedYear !== PLAYA_EVENT_YEAR) {
      years.push(selectedYear);
    }
    return years;
  }, [selectedYear]);

  useEffect(() => {
    let active = true;
    if (!selectedYear) {
      setPlacements({ years: [], mapped: [], unmapped: [] });
      setLoading(false);
      return;
    }
    const years = [selectedYear];
    setLoading(true);
    listBurningManMapPlacements({ years })
      .then((rows) => {
        if (active) setPlacements(rows);
      })
      .catch(() => {
        if (active) {
          setPlacements({ years, mapped: [], unmapped: [] });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedYear]);

  useEffect(() => {
    saveSidequesterBeacons(beacons);
  }, [beacons]);

  useEffect(() => {
    saveLocalBeaconCompletions(localCompletions);
  }, [localCompletions]);

  useEffect(() => {
    saveQuestThreads(questThreads);
  }, [questThreads]);

  useEffect(() => {
    saveQuestProgress(questProgress);
  }, [questProgress]);

  const selectedBeacon = useMemo(
    () => beacons.find((b) => b.id === selectedBeaconId) ?? null,
    [beacons, selectedBeaconId],
  );
  const questPinRows = useMemo(
    () => visibleQuestPins(questThreads, questProgress),
    [questThreads, questProgress],
  );
  const selectedQuestThread = useMemo(
    () =>
      questThreads.find((t) => t.id === selectedQuestThreadId) ?? null,
    [questThreads, selectedQuestThreadId],
  );
  const selectedQuestProgress = useMemo(
    () =>
      selectedQuestThread
        ? progressFor(questProgress, selectedQuestThread.id)
        : null,
    [questProgress, selectedQuestThread],
  );
  const mapHuntPins = useMemo((): PlayaHuntPin[] => {
    const drafting = isRouteQuestKind(kind) && (beaconComposerOpen || placingMode);
    const live = questPinRows.map((pin) => ({
      id: pin.id,
      lat: pin.lat,
      lng: pin.lng,
      title: pin.title,
      kind: pin.active ? "riddle" : "chest",
      done: pin.done,
      emphasized: pin.active,
    }));
    const drafts = drafting
      ? questStops.map((stop, index) => ({
          id: `draft-${stop.key}`,
          lat: stop.lat,
          lng: stop.lng,
          title: stop.clue || `Beat ${index + 1}`,
          kind: "character",
          done: false,
          emphasized: false,
        }))
      : [];
    return [...live, ...drafts];
  }, [kind, beaconComposerOpen, placingMode, questPinRows, questStops]);
  const selectedHuntPin = useMemo(
    () => mapHuntPins.find((p) => p.id === selectedHuntPinId) ?? null,
    [mapHuntPins, selectedHuntPinId],
  );

  const resolvedMappedPlacements = useMemo(
    () =>
      placements.mapped.map((point) => {
        if (point.kind === "exact" || point.project.event_year !== 2026) {
          return point;
        }
        const { clock_hour, clock_minute, distance_feet } = point.project;
        if (
          typeof clock_hour !== "number" ||
          typeof clock_minute !== "number" ||
          typeof distance_feet !== "number"
        ) {
          return point;
        }
        const position = clockRadiusToLatLng(
          clock_hour,
          clock_minute,
          distance_feet,
          manCenterForYear(2026, mapDataMode),
        );
        return { ...point, ...position };
      }),
    [placements.mapped, mapDataMode],
  );

  const selectedMappedPoint = useMemo(() => {
    if (!selectedProject) return null;
    return (
      resolvedMappedPlacements.find(
        (p) => p.project.slug === selectedProject.slug,
      ) ??
      null
    );
  }, [resolvedMappedPlacements, selectedProject]);

  const isSetComposer = isSetBeacon(kind);
  const isOpenSidequestComposer = isKindnessBeacon(kind);
  /** Quest pin builder — after Next (or once stops exist). */
  const questBuilding =
    isOpenSidequestComposer && sideburnsQuestMode && questSetupStarted;
  const isRouteQuestComposer = questBuilding || isRouteQuestKind(kind);
  /** Mission form, or Quest before tapping Next. */
  const isSideburnsSetupForm =
    isOpenSidequestComposer && (!sideburnsQuestMode || !questSetupStarted);
  const canPlace = isRouteQuestComposer
    ? details.trim().length >= QUEST_GUARDRAILS.titleMin &&
      missionTitle.trim().length >= QUEST_GUARDRAILS.clueMin &&
      (missionCompletion !== "phrase" ||
        missionAnswer.trim().length >= QUEST_GUARDRAILS.answerMin) &&
      questStops.length < QUEST_GUARDRAILS.maxStops
    : isCityServiceKind(kind) || details.trim().length >= 2;
  const canStartQuest =
    sideburnsQuestMode && details.trim().length >= QUEST_GUARDRAILS.titleMin;
  const composerActive = beaconComposerOpen || placingMode;
  const mapPoints = showProjects ? resolvedMappedPlacements : [];
  const searchHits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [] as Array<
      | { kind: "project"; project: BurningManProject; lat: number; lng: number }
      | { kind: "beacon"; beacon: SidequesterBeacon }
    >;
    const projectHits = resolvedMappedPlacements
      .filter((p) => {
        const title = p.project.title.toLowerCase();
        const artist = (p.project.artist_name_raw ?? "").toLowerCase();
        return title.includes(q) || artist.includes(q);
      })
      .slice(0, 5)
      .map((p) => ({
        kind: "project" as const,
        project: p.project,
        lat: p.lat,
        lng: p.lng,
      }));
    const beaconHits = beacons
      .filter((b) => {
        const meta = beaconKindMeta(b.kind);
        return (
          b.details.toLowerCase().includes(q) ||
          meta.label.toLowerCase().includes(q) ||
          (b.description ?? "").toLowerCase().includes(q) ||
          (b.sponsor ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 5)
      .map((b) => ({ kind: "beacon" as const, beacon: b }));
    return [...projectHits, ...beaconHits].slice(0, 8);
  }, [searchQuery, resolvedMappedPlacements, beacons]);

  const mapBeacons = beacons.filter((b) => {
    // Completed Sideburns drop off this device's map only.
    if (
      isKindnessBeacon(b.kind) &&
      isBeaconCompletedLocally(b.id, localCompletions)
    ) {
      return false;
    }
    const layer = beaconMapLayer(b.kind);
    const layerOn =
      layer === "food"
        ? showBeacons && showFood
        : layer === "service"
          ? isServiceKindVisible(
              b.kind as ServiceLayerKind,
              showServices,
              visibleServiceKinds,
            )
          : layer === "set"
            ? showSets && isVisibleSetBeacon(b)
            : showBeacons &&
              b.kind !== "tech_support" &&
              matchesSidequestFilter(b.kind, visibleBeaconKinds);

    if (resourceIsolateId) {
      return b.id === resourceIsolateId && layerOn;
    }
    if (resourcesMapMode) {
      if (resourceCategoryId === "mine") {
        return (
          b.createdBy === getSidequesterDeviceId() &&
          !b.id.startsWith("demo-") &&
          layerOn
        );
      }
      const category = resourceCategoryById(resourceCategoryId);
      return Boolean(category?.kinds.includes(b.kind)) && layerOn;
    }
    return layerOn;
  });
  const visibleOfficialToiletAreas = useMemo(() => {
    if (mapDataMode !== "official-2026" || !officialMapData) return [];
    const visibleIds = new Set(mapBeacons.map((beacon) => beacon.id));
    return officialMapData.toiletAreas.filter((area) => visibleIds.has(area.id));
  }, [mapBeacons, mapDataMode, officialMapData]);
  const needsEventTime = kind === "popup_event";
  const needsSetStartTime = isSetComposer && !setLive;
  const isSingleSideburnsComposer = isSideburnsSetupForm;
  const liveCount = beacons.filter(
    (b) => isSidequestBeacon(b.kind) && b.live,
  ).length;

  const hasSelection = Boolean(
    selectedBeacon ||
      selectedProject ||
      selectedQuestThread ||
      selectedHuntPin,
  );
  const selectionKey =
    selectedBeacon?.id ??
    selectedQuestThread?.id ??
    selectedHuntPin?.id ??
    selectedProject?.slug ??
    "";

  // Fresh selection / composer opens the sheet at extended height.
  useEffect(() => {
    if (!compact) return;
    if (selectionKey) setSheetSnap("full");
  }, [compact, selectionKey]);

  useEffect(() => {
    if (!compact) return;
    if (composerActive && !placingMode) setSheetSnap("full");
  }, [compact, composerActive, placingMode]);

  // Placing a pin needs the map, so drop the sheet out of the way.
  useEffect(() => {
    if (compact && placingMode) setSheetSnap("peek");
  }, [compact, placingMode]);

  useEffect(() => {
    if (!selectedBeaconId) return;
    const selected = beacons.find((b) => b.id === selectedBeaconId);
    if (!selected) return;
    const layer = beaconMapLayer(selected.kind);
    let layerOn = false;
    if (layer === "food") layerOn = showBeacons && showFood;
    else if (layer === "service") {
      layerOn = isServiceKindVisible(
        selected.kind as ServiceLayerKind,
        showServices,
        visibleServiceKinds,
      );
    } else if (layer === "set") {
      layerOn = showSets && isVisibleSetBeacon(selected);
    } else {
      layerOn =
        showBeacons &&
        matchesSidequestFilter(selected.kind, visibleBeaconKinds);
    }
    let visible = layerOn;
    if (resourceIsolateId) {
      visible = selected.id === resourceIsolateId && layerOn;
    } else if (resourcesMapMode) {
      if (resourceCategoryId === "mine") {
        visible =
          selected.createdBy === getSidequesterDeviceId() &&
          !selected.id.startsWith("demo-") &&
          layerOn;
      } else {
        const category = resourceCategoryById(resourceCategoryId);
        visible = Boolean(category?.kinds.includes(selected.kind)) && layerOn;
      }
    }
    if (!visible) {
      setSelectedBeaconId(null);
      if (resourceIsolateId === selected.id) setResourceIsolateId(null);
    }
  }, [
    beacons,
    selectedBeaconId,
    resourceIsolateId,
    resourcesMapMode,
    resourceCategoryId,
    showBeacons,
    showFood,
    showServices,
    showSets,
    visibleBeaconKinds,
    visibleServiceKinds,
  ]);

  const toggleProjects = () => {
    setShowProjects((prev) => {
      const next = !prev;
      if (!next) setSelectedProject(null);
      return next;
    });
  };

  const toggleBeacons = () => {
    setShowBeacons((prev) => {
      const next = !prev;
      if (!next && placingMode && isSidequestBeacon(kind)) {
        setPlacingMode(false);
      }
      return next;
    });
  };

  const toggleFood = () => {
    setShowFood((prev) => {
      const next = !prev;
      if (next) setShowBeacons(true);
      if (!next && placingMode && isFoodBeacon(kind)) {
        setPlacingMode(false);
      }
      return next;
    });
  };

  const toggleServices = () => {
    setShowServices((prev) => {
      const next = !prev;
      // City only owns festival infrastructure — not user heart-services.
      if (
        !next &&
        placingMode &&
        isServiceBeacon(kind) &&
        !isUserServiceKind(kind)
      ) {
        setPlacingMode(false);
      }
      // Leaving resource isolate/browse so the master City switch owns the map.
      if (!next) {
        setResourceIsolateId(null);
        setResourcesMapMode(false);
      }
      return next;
    });
  };

  const toggleSets = () => {
    setShowSets((prev) => !prev);
  };

  const toggleCampService = () => {
    setVisibleServiceKinds((prev) => {
      const nextOn = !prev.service;
      if (!nextOn && placingMode && kind === "service") {
        setPlacingMode(false);
      }
      return { ...prev, service: nextOn };
    });
  };

  const toggleBeaconKind = (beaconKind: SidequestLayerKind) => {
    setVisibleBeaconKinds((prev) => {
      const nextOn = !prev[beaconKind];
      if (nextOn) setShowBeacons(true);
      return {
        ...prev,
        [beaconKind]: nextOn,
      };
    });
  };

  const showAllBeaconKinds = () => {
    setVisibleBeaconKinds(ALL_SIDEQUEST_KINDS_VISIBLE);
  };

  const toggleServiceKind = (serviceKind: ServiceLayerKind) => {
    setVisibleServiceKinds((prev) => ({
      ...prev,
      [serviceKind]: !prev[serviceKind],
    }));
  };

  const resetQuestDraft = () => {
    setQuestStops([]);
    setQuestEpilogue("");
    setMissionTitle("");
    setMissionDetails("");
    setMissionCompletion(null);
    setMissionAnswer("");
    setMissionClueImage(null);
    setQuestSetupStarted(false);
    setFormError("");
  };

  const startPlacing = () => {
    if (isRouteQuestComposer) {
      if (!canPlace) {
        setFormError(
          !details.trim()
            ? "Name the adventure first."
            : !missionTitle.trim()
              ? "Write the clue for this pin."
              : missionCompletion === "phrase" && !missionAnswer.trim()
                ? "Add the magic phrase."
                : "Place this pin on the playa.",
        );
        setBeaconComposerOpen(true);
        return;
      }
      setFormError("");
      setShowBeacons(true);
      setVisibleBeaconKinds((prev) =>
        prev.quest ? prev : { ...prev, quest: true },
      );
      setPlacingMode(true);
      setSelectedBeaconId(null);
      setSelectedHuntPinId(null);
      setSelectedQuestThreadId(null);
      setSelectedProject(null);
      setBeaconComposerOpen(true);
      return;
    }
    if (!canPlace) {
      setFormError(
        isSetComposer
          ? "Add who’s playing before dropping a set."
          : "Add a short note before dropping a pin.",
      );
      setBeaconComposerOpen(true);
      return;
    }
    if (needsEventTime && !fromDatetimeLocalValue(eventStartsAt)) {
      setFormError("Pick a start time for the happening.");
      setBeaconComposerOpen(true);
      return;
    }
    if (needsSetStartTime && !fromDatetimeLocalValue(eventStartsAt)) {
      setFormError("Pick when this set goes live.");
      setBeaconComposerOpen(true);
      return;
    }
    setFormError("");
    const layer = beaconMapLayer(kind);
    if (layer === "set") {
      setShowSets(true);
    } else if (layer === "food") {
      setShowBeacons(true);
      setShowFood(true);
    } else if (layer === "service") {
      if (isUserServiceKind(kind as ServiceLayerKind)) {
        setVisibleServiceKinds((prev) =>
          prev.service ? prev : { ...prev, service: true },
        );
      } else {
        setShowServices(true);
        setVisibleServiceKinds((prev) =>
          prev[kind as ServiceLayerKind]
            ? prev
            : { ...prev, [kind as ServiceLayerKind]: true },
        );
      }
    } else {
      setShowBeacons(true);
      setVisibleBeaconKinds((prev) =>
        prev[kind as SidequestLayerKind]
          ? prev
          : { ...prev, [kind as SidequestLayerKind]: true },
      );
    }
    setPlacingMode(true);
    setSelectedBeaconId(null);
    setSelectedHuntPinId(null);
    setSelectedQuestThreadId(null);
    setSelectedProject(null);
    setBeaconComposerOpen(true);
  };

  const cancelPlacing = () => {
    setPlacingMode(false);
    setFormError("");
  };

  const commitBeaconAt = (lat: number, lng: number, expiresAt: string | null) => {
    const scheduledStart =
      needsEventTime || needsSetStartTime
        ? fromDatetimeLocalValue(eventStartsAt)
        : null;
    const beacon = createSidequesterBeacon({
      kind,
      details: details.trim() || beaconKindMeta(kind).label,
      lat,
      lng,
      startsAt: scheduledStart,
      expiresAt,
      live: isSetComposer ? setLive : undefined,
      place: isSetComposer ? setPlace : undefined,
      description: isSingleSideburnsComposer ? description : undefined,
      principle: isOpenSidequestComposer
        ? principle || null
        : undefined,
      createdBy: getSidequesterDeviceId(),
    });
    setBeacons((prev) => [beacon, ...prev]);
    markBeaconUploadPending(beacon.id);
    void upsertRemoteBeacon(beacon).then((result) => {
      if (result.ok) clearBeaconUploadPending(beacon.id);
    });
    setSelectedBeaconId(beacon.id);
    setSelectedHuntPinId(null);
    setSelectedProject(null);
    setPendingDrop(null);
    setDetails("");
    setDescription("");
    setReward("");
    setPrinciple("");
    setSetPlace("");
    setSetLive(true);
    setEventStartsAt("");
    setFormError("");
    setBeaconComposerOpen(false);
    if (isSetComposer) setShowSets(true);
    if (compact) setSheetSnap("full");
  };

  const placeQuestStopAt = (latlng: { lat: number; lng: number }) => {
    const check =
      missionCompletion === "phrase"
        ? ({ type: "answer", answer: missionAnswer.trim() } as const)
        : missionCompletion === "photo"
          ? ({ type: "photo" } as const)
          : ({ type: "presence" } as const);
    const freeAction =
      missionCompletion == null ? missionAnswer.trim() : "";
    const detailBit = missionDetails.trim().slice(0, QUEST_GUARDRAILS.hintMax);
    const stop: DraftQuestStop = {
      key:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `stop-${Date.now()}`,
      clue: missionTitle.trim(),
      details: missionDetails.trim(),
      lat: latlng.lat,
      lng: latlng.lng,
      check,
      hint: freeAction
        ? [freeAction, detailBit].filter(Boolean).join(" — ").slice(
            0,
            QUEST_GUARDRAILS.hintMax,
          )
        : detailBit,
      completion: missionCompletion,
      clueImage: missionClueImage,
    };
    setQuestStops((prev) => [...prev, stop]);
    setMissionTitle("");
    setMissionDetails("");
    setMissionCompletion(null);
    setMissionAnswer("");
    setMissionClueImage(null);
    setPlacingMode(false);
    setFormError("");
    setBeaconComposerOpen(true);
    if (compact) setSheetSnap("full");
  };

  const publishQuestThread = () => {
    if (questThreads.length >= QUEST_GUARDRAILS.maxLocalThreads) {
      setFormError(
        `Local limit is ${QUEST_GUARDRAILS.maxLocalThreads} quests — finish or clear one.`,
      );
      return;
    }
    const pitch = questEpilogue.trim().slice(0, QUEST_GUARDRAILS.pitchMax);
    const result = createQuestThread({
      title: details,
      pitch,
      reward,
      sponsor: null,
      stops: questStops.map((s) => ({
        clue: s.clue,
        lat: s.lat,
        lng: s.lng,
        check: s.check,
        hint: s.hint || s.details || undefined,
        clueImage: s.clueImage,
      })),
      live: true,
    });
    if (result.ok === false) {
      setFormError(result.issues[0]?.message ?? "Couldn’t publish that quest.");
      return;
    }
    const thread = result.thread;
    const first = thread.stops[0];
    const hub = createSidequesterBeacon({
      kind: "quest",
      details: thread.title,
      lat: first.lat,
      lng: first.lng,
      expiresAt: null,
      live: true,
      sponsor: null,
      reward: thread.reward,
      createdBy: getSidequesterDeviceId(),
      questThreadId: thread.id,
    });
    setQuestThreads((prev) => [thread, ...prev]);
    setBeacons((prev) => [hub, ...prev]);
    markBeaconUploadPending(hub.id);
    void upsertRemoteBeacon(hub).then((result) => {
      if (result.ok) clearBeaconUploadPending(hub.id);
    });
    setDetails("");
    setReward("");
    resetQuestDraft();
    setSideburnsQuestMode(false);
    setShowBeacons(true);
    setBeaconComposerOpen(false);
    setSelectedQuestThreadId(thread.id);
    setSelectedHuntPinId(first?.id ?? null);
    setSelectedBeaconId(null);
    setSelectedProject(null);
    if (compact) setSheetSnap("full");
  };

  const placeBeacon = (latlng: { lat: number; lng: number }) => {
    if (isRouteQuestComposer) {
      placeQuestStopAt(latlng);
      return;
    }
    if (!canPlace) return;
    if (needsEventTime && !fromDatetimeLocalValue(eventStartsAt)) return;
    if (needsSetStartTime && !fromDatetimeLocalValue(eventStartsAt)) return;
    setPlacingMode(false);
    setFormError("");
    // Sets and City infra drop immediately as live pins — no expiry modal.
    if (isSetComposer || isCityServiceKind(kind)) {
      commitBeaconAt(latlng.lat, latlng.lng, null);
      return;
    }
    setPendingDrop({ lat: latlng.lat, lng: latlng.lng });
    setExpireMinutes(60);
  };

  const activatePendingBeacon = () => {
    if (!pendingDrop || !canPlace) return;
    commitBeaconAt(
      pendingDrop.lat,
      pendingDrop.lng,
      expireMinutes == null
        ? null
        : new Date(Date.now() + expireMinutes * 60 * 1000).toISOString(),
    );
  };

  const cancelPendingDrop = () => {
    setPendingDrop(null);
    setBeaconComposerOpen(true);
    if (compact) setSheetSnap("full");
  };

  const removeBeacon = (id: string) => {
    const beacon = beacons.find((b) => b.id === id);
    if (!beacon || !mayRemoveBeacon(beacon, admin)) return;

    deletedBeaconIdsRef.current.add(id);
    clearBeaconUploadPending(id);
    rememberDeletedDemoBeacon(id);
    const nextBeacons = beacons.filter((b) => b.id !== id);
    // Persist immediately so a sync poll can't reload a stale local copy.
    saveSidequesterBeacons(nextBeacons);
    setBeacons(nextBeacons);
    if (selectedBeaconId === id) setSelectedBeaconId(null);

    // Quest hub pins are only the entry point — stop pins live on the thread.
    const threadId = beacon.questThreadId;
    if (isRouteQuestKind(beacon.kind) && threadId) {
      setQuestThreads((prev) => {
        const next = prev.filter((t) => t.id !== threadId);
        saveQuestThreads(next);
        return next;
      });
      setQuestProgress((prev) => {
        const next = prev.filter((p) => p.threadId !== threadId);
        saveQuestProgress(next);
        return next;
      });
      if (selectedQuestThreadId === threadId) {
        setSelectedQuestThreadId(null);
        setSelectedHuntPinId(null);
      }
    }

    void deleteRemoteBeacon(id);
  };

  const toggleComplete = (id: string) => {
    const beacon = beacons.find((b) => b.id === id);
    if (!beacon || !isKindnessBeacon(beacon.kind)) return;
    const wasDone = isBeaconCompletedLocally(id, localCompletions);
    setLocalCompletions((prev) => {
      const next = { ...prev };
      if (wasDone) delete next[id];
      else next[id] = new Date().toISOString();
      return next;
    });
    setBeacons((prev) => {
      const next = prev.map((b) =>
        b.id === id ? adjustBeaconCompletions(b, wasDone ? -1 : 1) : b,
      );
      const updated = next.find((b) => b.id === id);
      if (updated) void upsertRemoteBeacon(updated);
      return next;
    });
    if (!wasDone && selectedBeaconId === id) {
      setSelectedBeaconId(null);
    }
  };

  const postBeaconUpdate = (id: string, text: string) => {
    setBeacons((prev) => {
      const next = prev.map((b) =>
        b.id === id ? appendBeaconUpdate(b, text) : b,
      );
      const updated = next.find((b) => b.id === id);
      if (updated) void upsertRemoteBeacon(updated);
      return next;
    });
  };

  const confirmSetLocation = (id: string) => {
    const deviceId = getSidequesterDeviceId();
    setBeacons((prev) => {
      const next = prev.map((b) =>
        b.id === id ? confirmBeaconLocation(b, deviceId) : b,
      );
      const updated = next.find((b) => b.id === id);
      if (updated) void upsertRemoteBeacon(updated);
      return next;
    });
  };

  const selectProject = (project: BurningManProject) => {
    if (placingMode) return;
    setSelectedProject(project);
    setSelectedBeaconId(null);
    setSelectedHuntPinId(null);
    setSelectedQuestThreadId(null);
    setBeaconComposerOpen(false);
    if (compact) setSheetSnap("full");
  };

  const selectQuestThread = (threadId: string) => {
    if (placingMode) return;
    const thread = questThreads.find((t) => t.id === threadId);
    if (!thread) return;
    setSelectedQuestThreadId(threadId);
    const pins = visibleQuestPins([thread], questProgress);
    const active = pins.find((p) => p.active) ?? pins[pins.length - 1];
    setSelectedHuntPinId(active?.id ?? thread.stops[0]?.id ?? null);
    setSelectedBeaconId(null);
    setSelectedProject(null);
    setBeaconComposerOpen(false);
    if (compact) setSheetSnap("full");
  };

  const selectBeacon = (
    beacon: SidequesterBeacon,
    options?: { isolate?: boolean },
  ) => {
    if (placingMode) return;
    if (isRouteQuestKind(beacon.kind) && beacon.questThreadId) {
      setResourceIsolateId(null);
      setResourcesMapMode(false);
      selectQuestThread(beacon.questThreadId);
      return;
    }
    const isolate = Boolean(options?.isolate);
    setResourceIsolateId(isolate ? beacon.id : null);
    setResourcesMapMode(isolate);
    const layer = beaconMapLayer(beacon.kind);
    if (layer === "food") {
      setShowBeacons(true);
      setShowFood(true);
    } else if (layer === "service") {
      const serviceKind = beacon.kind as ServiceLayerKind;
      if (isUserServiceKind(serviceKind)) {
        setVisibleServiceKinds((prev) =>
          prev.service ? prev : { ...prev, service: true },
        );
      } else {
        setShowServices(true);
        setVisibleServiceKinds((prev) =>
          prev[serviceKind] ? prev : { ...prev, [serviceKind]: true },
        );
      }
    } else if (layer === "set") {
      setShowSets(true);
    } else {
      setShowBeacons(true);
      const layerKind = beacon.kind as SidequestLayerKind;
      setVisibleBeaconKinds((prev) =>
        prev[layerKind] ? prev : { ...prev, [layerKind]: true },
      );
    }
    setSelectedBeaconId(beacon.id);
    setSelectedHuntPinId(null);
    setSelectedQuestThreadId(null);
    setSelectedProject(null);
    setBeaconComposerOpen(false);
    if (compact) setSheetSnap("full");
  };

  const browseResourceCategory = (categoryId: ResourceCategoryId) => {
    setResourceCategoryId(categoryId);
    setResourceIsolateId(null);
    setSelectedBeaconId(null);
    setSelectedHuntPinId(null);
    setSelectedQuestThreadId(null);
    setSelectedProject(null);

    if (categoryId === "party") {
      setResourcesMapMode(false);
      return;
    }

    setResourcesMapMode(true);

    if (categoryId === "mine") {
      setShowBeacons(true);
      setShowFood(true);
      setShowServices(true);
      setShowSets(true);
      setVisibleBeaconKinds(ALL_SIDEQUEST_KINDS_VISIBLE);
      setVisibleServiceKinds(ALL_SERVICE_KINDS_VISIBLE);
      return;
    }

    const category = resourceCategoryById(categoryId);
    if (!category) return;
    for (const kind of category.kinds) {
      const layer = beaconMapLayer(kind);
      if (layer === "service") {
        const serviceKind = kind as ServiceLayerKind;
        if (isUserServiceKind(serviceKind)) {
          setVisibleServiceKinds((prev) =>
            prev.service ? prev : { ...prev, service: true },
          );
        } else {
          setShowServices(true);
          setVisibleServiceKinds((prev) =>
            prev[serviceKind] ? prev : { ...prev, [serviceKind]: true },
          );
        }
      } else if (layer === "food") {
        setShowBeacons(true);
        setShowFood(true);
      } else if (layer === "set") {
        setShowSets(true);
      } else if (layer === "sidequest") {
        setShowBeacons(true);
        if (kind === "general" || kind === "weird") {
          setVisibleBeaconKinds((prev) =>
            prev.sidequest ? prev : { ...prev, sidequest: true },
          );
        } else if (
          kind === "sidequest" ||
          kind === "popup_event" ||
          kind === "quest" ||
          kind === "tech_support" ||
          kind === "bike_stuff"
        ) {
          setVisibleBeaconKinds((prev) =>
            prev[kind] ? prev : { ...prev, [kind]: true },
          );
        }
      }
    }
  };

  const selectHuntPin = (pin: PlayaHuntPin | { id: string }) => {
    if (placingMode) return;
    if (pin.id.startsWith("draft-")) {
      setKind("sidequest");
      setSideburnsQuestMode(true);
      setBeaconComposerOpen(true);
      setSelectedQuestThreadId(null);
      setSelectedHuntPinId(null);
      if (compact) setSheetSnap("full");
      return;
    }
    const row = questPinRows.find((p) => p.id === pin.id);
    if (!row) return;
    setSelectedQuestThreadId(row.threadId);
    setSelectedHuntPinId(pin.id);
    setSelectedBeaconId(null);
    setSelectedProject(null);
    setBeaconComposerOpen(false);
    if (compact) setSheetSnap("full");
  };

  const completeSelectedQuestStop = (
    stopId: string,
    guess?: string,
    options?: { photoCaptured?: boolean },
  ): { ok: true; finished: boolean } | { ok: false; reason: string } => {
    if (!selectedQuestThread) {
      return { ok: false, reason: "No quest selected." };
    }
    const current = progressFor(questProgress, selectedQuestThread.id);
    const result = completeQuestStop(
      selectedQuestThread,
      current,
      stopId,
      guess,
      userLocation,
      options,
    );
    if (!result.ok) return result;
    setQuestProgress((prev) => {
      const without = prev.filter((p) => p.threadId !== selectedQuestThread.id);
      return [...without, result.progress];
    });
    if (!result.finished) {
      const nextStop = selectedQuestThread.stops.find(
        (s) => !result.progress.completedStopIds.includes(s.id),
      );
      if (nextStop) setSelectedHuntPinId(nextStop.id);
    }
    return { ok: true, finished: result.finished };
  };

  const clearSelection = () => {
    setSelectedProject(null);
    setSelectedBeaconId(null);
    setSelectedHuntPinId(null);
    setSelectedQuestThreadId(null);
    setResourceIsolateId(null);
    setResourcesMapMode(false);
    if (compact) setSheetSnap("peek");
  };

  const selectedBeaconIndex = useMemo(() => {
    if (!selectedBeaconId) return -1;
    return beacons.findIndex((b) => b.id === selectedBeaconId);
  }, [beacons, selectedBeaconId]);

  const stepBeacon = (direction: -1 | 1) => {
    const next = selectedBeaconIndex + direction;
    if (next < 0 || next >= beacons.length) return;
    selectBeacon(beacons[next]);
  };

  const beaconStepper =
    selectedBeacon && beacons.length > 1 && selectedBeaconIndex >= 0
      ? {
          index: selectedBeaconIndex,
          total: beacons.length,
          onPrev:
            selectedBeaconIndex > 0 ? () => stepBeacon(-1) : undefined,
          onNext:
            selectedBeaconIndex < beacons.length - 1
              ? () => stepBeacon(1)
              : undefined,
        }
      : null;

  const detailPane =
    selectedQuestThread && selectedQuestProgress ? (
      <QuestPlayDetail
        thread={selectedQuestThread}
        progress={selectedQuestProgress}
        location={userLocation}
        onCompleteStop={completeSelectedQuestStop}
        onClose={clearSelection}
        compact={compact}
      />
    ) : (
    <DetailPane
      selectedBeacon={selectedBeacon}
      selectedProject={selectedProject}
      nowMs={nowMs}
      completedLocally={
        selectedBeacon
          ? isBeaconCompletedLocally(selectedBeacon.id, localCompletions)
          : false
      }
      onClear={clearSelection}
      beaconStepper={beaconStepper}
      onRemoveBeacon={
        selectedBeacon && mayRemoveBeacon(selectedBeacon, admin)
          ? () => removeBeacon(selectedBeacon.id)
          : undefined
      }
      removeLabel={admin ? "Remove permanently" : undefined}
      onToggleComplete={
        selectedBeacon && isKindnessBeacon(selectedBeacon.kind)
          ? () => toggleComplete(selectedBeacon.id)
          : undefined
      }
      onPostUpdate={
        selectedBeacon &&
        (isServiceBeacon(selectedBeacon.kind) ||
          isSetBeacon(selectedBeacon.kind))
          ? (text) => postBeaconUpdate(selectedBeacon.id, text)
          : undefined
      }
      onConfirmLocation={
        selectedBeacon &&
        isSetBeacon(selectedBeacon.kind) &&
        canConfirmBeaconLocation(selectedBeacon, getSidequesterDeviceId())
          ? () => confirmSetLocation(selectedBeacon.id)
          : undefined
      }
      hideHeader={compact}
    />
    );

  const publishMyPresence = useCallback(
    async (lat: number, lng: number) => {
      if (!shareLocationOn) return;
      const result = await publishPresence({ lat, lng });
      if (result.ok === false) {
        setPresenceError(result.error);
        return;
      }
      setPresenceError(null);
    },
    [shareLocationOn],
  );

  // Share location: watch GPS and upsert under this device's short code.
  useEffect(() => {
    if (!shareLocationOn) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPresenceError("Location is unavailable on this device.");
      return;
    }
    let lastSent = 0;
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const now = Date.now();
        if (now - lastSent < 12_000) return;
        lastSent = now;
        void publishMyPresence(coords.latitude, coords.longitude);
      },
      (err) => {
        setPresenceError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission is off — turn it on to share."
            : "Could not read your location.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [shareLocationOn, publishMyPresence]);

  // Poll followed friends' GPS.
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      if (!followedCodes.length) {
        if (!cancelled) setFriendPresences([]);
        return;
      }
      const rows = await fetchPresenceByCodes(followedCodes);
      if (cancelled) return;
      const now = Date.now();
      setFriendPresences(
        rows.map((row) => ({
          code: formatShareCode(row.shareCode),
          lat: row.lat,
          lng: row.lng,
          label: row.label,
          updatedAt: row.updatedAt,
          stale: now - new Date(row.updatedAt).getTime() > PRESENCE_STALE_MS,
        })),
      );
    };
    void pull();
    const id = window.setInterval(() => void pull(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [followedCodes]);

  const setSharing = (enabled: boolean) => {
    setShareLocationOn(enabled);
    saveShareLocationEnabled(enabled);
    if (!enabled) setPresenceError(null);
  };

  const addFriendCode = (code: string) => {
    const next = followShareCode(code);
    setFollowedCodes(next);
  };

  const removeFriendCode = (code: string) => {
    setFollowedCodes(unfollowShareCode(code));
  };

  const questHub = (
    <QuestHub
      beacons={beacons}
      selectedBeaconId={selectedBeaconId}
      resourceCategoryId={resourceCategoryId}
      nowMs={nowMs}
      myShareCode={myShareCode}
      shareLocationOn={shareLocationOn}
      followedCodes={followedCodes}
      friendPresences={friendPresences}
      presenceError={presenceError}
      onSelectResource={(beacon) => selectBeacon(beacon, { isolate: true })}
      onBrowseResourceCategory={browseResourceCategory}
      onRemove={removeBeacon}
      allowRemove={(beacon) => mayRemoveBeacon(beacon, admin)}
      onShareLocationChange={setSharing}
      onFollowFriend={addFriendCode}
      onUnfollowFriend={removeFriendCode}
    />
  );

  const composer = composerActive ? (
    <BeaconComposer
      admin={admin}
      kind={kind}
      details={details}
      description={description}
      principle={principle}
      setPlace={setPlace}
      setLive={setLive}
      eventStartsAt={eventStartsAt}
      placingMode={placingMode}
      canPlace={canPlace}
      formError={formError}
      needsEventTime={needsEventTime}
      needsSetStartTime={needsSetStartTime}
      isSingleSideburns={isSingleSideburnsComposer}
      isOpenSidequest={isOpenSidequestComposer}
      questMode={sideburnsQuestMode}
      showQuestBuilder={questBuilding}
      canStartQuest={canStartQuest}
      isSet={isSetComposer}
      questForm={
        questBuilding ? (
          <QuestComposer
            questName={details}
            epilogue={questEpilogue}
            reward={reward}
            stops={questStops}
            missionTitle={missionTitle}
            missionDetails={missionDetails}
            missionCompletion={missionCompletion}
            missionAnswer={missionAnswer}
            missionClueImage={missionClueImage}
            placingMode={placingMode}
            formError={formError}
            hideNameField
            initialCard="mission"
            onQuestNameChange={setDetails}
            onEpilogueChange={setQuestEpilogue}
            onRewardChange={setReward}
            onMissionTitleChange={setMissionTitle}
            onMissionDetailsChange={setMissionDetails}
            onMissionCompletionChange={setMissionCompletion}
            onMissionAnswerChange={setMissionAnswer}
            onMissionClueImageChange={setMissionClueImage}
            onRemoveStop={(key) =>
              setQuestStops((prev) => prev.filter((s) => s.key !== key))
            }
            onPlacePin={startPlacing}
            onCancelPlacing={cancelPlacing}
            onPublish={publishQuestThread}
          />
        ) : null
      }
      onKindChange={(next) => {
        setKind(next);
        setSideburnsQuestMode(false);
        setQuestSetupStarted(false);
        if (next !== "popup_event" && !isSetBeacon(next)) setEventStartsAt("");
        if (!isQuestBeacon(next)) {
          setReward("");
        }
        if (!isKindnessBeacon(next)) {
          setPrinciple("");
          setDescription("");
        }
        resetQuestDraft();
        if (isSetBeacon(next)) {
          setSetLive(true);
          setEventStartsAt("");
        }
        setFormError("");
      }}
      onQuestModeChange={(on) => {
        setSideburnsQuestMode(on);
        if (!on) {
          setQuestSetupStarted(false);
          resetQuestDraft();
        }
        setFormError("");
      }}
      onQuestNext={() => {
        if (!canStartQuest) {
          setFormError("Name the adventure first.");
          return;
        }
        setFormError("");
        setQuestSetupStarted(true);
        setShowBeacons(true);
        setVisibleBeaconKinds((prev) =>
          prev.quest ? prev : { ...prev, quest: true },
        );
      }}
      onDetailsChange={setDetails}
      onDescriptionChange={setDescription}
      onPrincipleChange={setPrinciple}
      onSetPlaceChange={setSetPlace}
      onSetLiveChange={(next) => {
        setSetLive(next);
        if (next) setEventStartsAt("");
      }}
      onEventStartsAtChange={setEventStartsAt}
      onStartPlacing={startPlacing}
      onCancelPlacing={cancelPlacing}
    />
  ) : (
    <button
      type="button"
      onClick={() => setBeaconComposerOpen(true)}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#3f454c] px-4 py-2.5 text-[11px] uppercase tracking-widest text-[#f4f0e8] transition-opacity hover:opacity-90"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden />
      Add a beacon
    </button>
  );

  const composerSheetOpen =
    composerActive && !placingMode && !hasSelection;
  /** Full snap uses ~70% — peek tab / grabber open straight to it. */
  const sheetFullRatio = SHEET_FULL_RATIO;
  const sheetFullCss = SHEET_FULL_CSS;
  // Sheet covers the home indicator; placing chrome needs an explicit safe-area pad.
  const mapBottomInset = compact
    ? placingMode
      ? PLACING_CANCEL_CHROME_PX + Math.max(16, safeBottom)
      : sheetHeightPx(sheetSnap, viewportHeight, sheetFullRatio)
    : 0;
  // Leaflet pad: [[top, left], [bottom, right]]. Bottom = sheet so the selected
  // pin centers in the visible map band above the card (~30% when full).
  const mapEdgePadding: [[number, number], [number, number]] = compact
    ? [
        [MAP_TOP_CHROME_PX, 28],
        [Math.max(mapBottomInset, SHEET_PEEK_PX), 16],
      ]
    : [
        [16, 24],
        [24, 340],
      ];

  const openBeaconComposer = () => {
    setSelectedProject(null);
    setSelectedBeaconId(null);
    setSelectedHuntPinId(null);
    setSelectedQuestThreadId(null);
    setBeaconComposerOpen(true);
    if (compact) setSheetSnap("full");
  };

  const addBeaconFab = !placingMode ? (
    <button
      type="button"
      aria-label="Add a beacon"
      title="Add a beacon"
      onClick={openBeaconComposer}
      className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#3f454c] text-[#f4f0e8] shadow-[0_1px_4px_rgba(0,0,0,0.28)]"
    >
      <Plus className="h-5 w-5" strokeWidth={2.25} aria-hidden />
    </button>
  ) : null;

  const layerToolbar = (
    <LayerToolbar
      showProjects={showProjects}
      showFood={showFood}
      showServices={showServices}
      showSets={showSets}
      showCampService={visibleServiceKinds.service}
      visibleBeaconKinds={visibleBeaconKinds}
      onToggleProjects={toggleProjects}
      onToggleFood={toggleFood}
      onToggleServices={toggleServices}
      onToggleSets={toggleSets}
      onToggleCampService={toggleCampService}
      onToggleBeaconKind={toggleBeaconKind}
      hidden={placingMode}
      collapseFilters={compact && sheetSnap !== "peek"}
    />
  );

  const mapTopChrome = (
    <MapTopChrome
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      searchFocused={searchFocused}
      onSearchFocusedChange={setSearchFocused}
      searchHits={searchHits}
      onSelectProject={(project) => {
        setSearchQuery("");
        setSearchFocused(false);
        selectProject(project);
      }}
      onSelectBeacon={(beacon) => {
        setSearchQuery("");
        setSearchFocused(false);
        selectBeacon(beacon);
      }}
      layerToolbar={layerToolbar}
      hidden={placingMode}
      admin={admin}
    />
  );

  const map = mapReady ? (
    <PlayaMap
      points={mapPoints}
      mapDataMode={mapDataMode}
      officialStreetPolygons={officialMapData?.streetPolygons ?? []}
      officialStreetLines={officialMapData?.streetLines ?? []}
      officialTrashFencePolygons={officialMapData?.trashFencePolygons ?? []}
      officialToiletAreas={visibleOfficialToiletAreas}
      selectedProject={
        showProjects ? (selectedMappedPoint?.project ?? selectedProject) : null
      }
      years={selectedYears}
      onSelect={selectProject}
      loading={loading}
      beacons={mapBeacons}
      selectedBeaconId={selectedBeaconId}
      onSelectBeacon={selectBeacon}
      huntPins={mapHuntPins}
      selectedHuntPinId={selectedHuntPinId}
      onSelectHuntPin={selectHuntPin}
      placingMode={placingMode}
      onPlace={placeBeacon}
      hidePinMessages
      bottomInset={mapBottomInset}
      /* Desktop: zoom/locate float above the map edge. Mobile locate sits in the tab row. */
      controlsBottom={16}
      edgePadding={mapEdgePadding}
      controlsPortal={compact ? mapControlsHost : null}
      hideZoom={compact}
      locatePortal={compact ? locateHost : null}
      aboveLocate={compact ? null : addBeaconFab}
      beforeLocate={beforeLocate}
      beforeCompass={beforeCompass}
      friendPresences={friendPresences}
      onUserLocation={(loc) => {
        if (loc) void publishMyPresence(loc.lat, loc.lng);
      }}
    />
  ) : (
    <div className="flex h-full items-center justify-center border border-foreground/20 text-sm text-foreground/60">
      Preparing Sidequester…
    </div>
  );

  if (compact) {
    return (
      <>
        <div className="relative h-[100dvh] w-full overflow-hidden bg-[#17130f]">
          <div className="absolute inset-0 z-0">{map}</div>

          {/* Soft edge silhouette over the map. */}
          <div
            className="pointer-events-none absolute inset-0 z-[510]"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 78% 72% at 50% 46%, transparent 58%, rgba(23, 19, 15, 0.28) 100%)",
              boxShadow: "inset 0 0 40px 8px rgba(23, 19, 15, 0.22)",
            }}
          />

          {/* Map zoom / locate — under the info card, above the map. */}
          <div
            ref={setMapControlsHost}
            className="pointer-events-none absolute inset-0 z-[530]"
          />

          {/*
            Locate/compass stay fixed at the peek chrome height — never track
            sheet snap. z under the sheet so the info card covers them when open.
          */}
          {!placingMode && !pendingDrop ? (
            <div
              ref={setLocateHost}
              className="pointer-events-auto absolute bottom-0 right-[max(0.75rem,env(safe-area-inset-right))] z-[555] overflow-visible pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            />
          ) : null}

          {/* Floating top chrome — map selector, search, layer icons. */}
          {mapTopChrome}

          {placingMode ? (
            <div className="absolute inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[560]">
              <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-[#17130f]/88 px-3 py-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-md">
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-medium text-[#fff0f4]"
                  style={{ backgroundColor: LAYER_COLOR_HUNT }}
                  aria-hidden
                >
                  {isRouteQuestComposer ? questStops.length + 1 : "·"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-[#f8f5ee]">
                    {isRouteQuestComposer
                      ? missionTitle.trim() || "This beat"
                      : "Drop your pin"}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-[#f8f5ee]/55">
                    {isRouteQuestComposer
                      ? "Tap the playa to set it"
                      : "Tap the map"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cancelPlacing}
                  aria-label="Cancel placement"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#f8f5ee]/80"
                >
                  <X className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ) : null}

          <BottomSheet
            snap={sheetSnap}
            fullHeightCss={sheetFullCss}
            onSnapChange={(next) => {
              // Expand tab / drag up from peek → quest log (not composer).
              if (sheetSnap === "peek" && next !== "peek") {
                setSelectedProject(null);
                setSelectedBeaconId(null);
                setSelectedHuntPinId(null);
                setSelectedQuestThreadId(null);
                setBeaconComposerOpen(false);
                setFormError("");
              }
              setSheetSnap(next);
            }}
            onClose={() => {
              setSelectedProject(null);
              setSelectedBeaconId(null);
              setSelectedHuntPinId(null);
              setSelectedQuestThreadId(null);
              setBeaconComposerOpen(false);
              setFormError("");
              setSheetSnap("peek");
            }}
            hidden={placingMode || Boolean(pendingDrop)}
            title={hasSelection ? "Selection" : "Sideburns"}
            headerLeading={
              beaconStepper ? (
                <BeaconStepControls stepper={beaconStepper} />
              ) : composerActive && !hasSelection ? (
                <p className="truncate text-[11px] font-medium uppercase tracking-widest text-[#3f454c]/75">
                  Add a beacon
                </p>
              ) : null
            }
            chromeLeading={addBeaconFab}
            chromeTrailing={null}
            peek={
              hasSelection ? (
                <SelectionPeek
                  selectedBeacon={selectedBeacon}
                  selectedProject={selectedProject}
                  selectedHuntPin={selectedHuntPin}
                  completedLocally={
                    selectedBeacon
                      ? isBeaconCompletedLocally(
                          selectedBeacon.id,
                          localCompletions,
                        )
                      : false
                  }
                />
              ) : null
            }
          >
            {hasSelection ? (
              detailPane
            ) : composerActive ? (
              composer
            ) : (
              questHub
            )}
          </BottomSheet>

          {pendingDrop ? (
            <ExpireModal
              expireMinutes={expireMinutes}
              onExpireMinutesChange={setExpireMinutes}
              onActivate={activatePendingBeacon}
              onCancel={cancelPendingDrop}
            />
          ) : null}

          <LegalAckBanner />
          {sensorPrompt}
        </div>
      </>
    );
  }

  return (
    <>

      <div className="mx-auto max-w-[1650px] px-4 md:px-8 py-8 md:py-10">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[280px_minmax(0,1fr)_300px] lg:gap-0 lg:divide-x lg:divide-foreground/20">
          {/* Column 1 */}
          <aside
            className={`space-y-6 lg:pr-8 ${SIDEBAR_STICKY}`}
            aria-label="Sidequester"
          >
            {composer}
            {questHub}
          </aside>

          {/* Columns 2–3: map + overlay detail card */}
          <div className="relative h-[min(78dvh,820px)] min-w-0 lg:col-span-2 lg:pl-8">
            <div className="absolute inset-0 z-0 h-full min-h-0 overflow-hidden border border-foreground/20 bg-[#17130f] lg:left-8 lg:border-0">
              {map}
            </div>

            <div
              className={`absolute inset-x-0 top-0 z-30 transition-opacity ${
                hasSelection ? "pr-[328px]" : ""
              }`}
            >
              {mapTopChrome}
            </div>

            {hasSelection && (
              <aside
                className="absolute bottom-4 right-4 top-4 z-20 w-[300px] overflow-y-auto overscroll-contain scrollbar-none rounded-2xl border border-[#3f454c]/10 bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,0.22)]"
                aria-label="Selection details"
              >
                {detailPane}
              </aside>
            )}

            {pendingDrop ? (
              <ExpireModal
                expireMinutes={expireMinutes}
                onExpireMinutesChange={setExpireMinutes}
                onActivate={activatePendingBeacon}
                onCancel={cancelPendingDrop}
              />
            ) : null}

            <LegalAckBanner />
            {sensorPrompt}
          </div>
        </div>
      </div>
    </>
  );
}

const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Drag-to-snap bottom sheet layered over the map.
 * Peek is a floating expand tab (+ optional map action); half/full slide up as a white card.
 */
function BottomSheet({
  snap,
  onSnapChange,
  onClose,
  peek,
  children,
  title,
  headerLeading = null,
  chromeLeading = null,
  chromeTrailing = null,
  fullHeightCss = null,
  hidden = false,
}: {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Fixed top-right X — closes sheet (and clears selection when provided). */
  onClose: () => void;
  peek: ReactNode;
  children: ReactNode;
  title: string;
  /** Optional control in the grabber row, top-left (e.g. beacon pager). */
  headerLeading?: ReactNode;
  /** Left-side control in the peek tab row (e.g. add beacon). */
  chromeLeading?: ReactNode;
  /** Right-side control in the peek tab row (e.g. locate me). */
  chromeTrailing?: ReactNode;
  /** Override height when snap is full (e.g. project / composer). */
  fullHeightCss?: string | null;
  hidden?: boolean;
}) {
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartRef = useRef<number | null>(null);
  const draggedRef = useRef(false);

  const order: SheetSnap[] = ["peek", "half", "full"];
  const isPeek = snap === "peek";
  const sheetOpen = !isPeek && !hidden;

  const step = useCallback(
    (direction: 1 | -1) => {
      const index = order.indexOf(snap);
      const next = order[Math.min(order.length - 1, Math.max(0, index + direction))];
      if (next !== snap) onSnapChange(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, onSnapChange],
  );

  const onPointerDown = (e: ReactPointerEvent) => {
    dragStartRef.current = e.clientY;
    draggedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (dragStartRef.current === null) return;
    const offset = e.clientY - dragStartRef.current;
    if (Math.abs(offset) > 6) draggedRef.current = true;
    setDragOffset(offset);
  };

  const endDrag = () => {
    if (dragStartRef.current === null) return;
    const offset = dragOffset;
    dragStartRef.current = null;
    setDragOffset(0);
    if (offset > 44) step(-1);
    else if (offset < -44) step(1);
  };

  const onGrabberClick = () => {
    if (draggedRef.current) return;
    // Tab always expands to full; tap again to dismiss (no half shrink).
    if (snap === "full") onSnapChange("peek");
    else onSnapChange("full");
  };

  const sheetHeight = isPeek
    ? SHEET_HEIGHT.half
    : snap === "full" && fullHeightCss
      ? fullHeightCss
      : SHEET_HEIGHT[snap];
  const sheetTransform = dragOffset
    ? `translateY(${Math.max(dragOffset, -80)}px)`
    : sheetOpen
      ? "translateY(0)"
      : "translateY(105%)";

  return (
    <>
      {/* Map chrome row — expand tab centered, optional action bottom-right. */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-[561] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[opacity,transform] duration-[380ms] ${
          isPeek && !hidden
            ? "opacity-100"
            : "translate-y-4 opacity-0"
        }`}
        style={{ transitionTimingFunction: SHEET_EASE }}
      >
        <div className="relative flex min-h-11 items-center justify-center">
          {chromeLeading ? (
            <div className="pointer-events-auto absolute left-0 top-1/2 -translate-y-1/2">
              {chromeLeading}
            </div>
          ) : null}
          <button
            type="button"
            aria-label="Expand panel"
            onClick={onGrabberClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="pointer-events-auto flex min-h-11 w-32 touch-none items-center justify-center"
            style={{
              transform: dragOffset
                ? `translateY(${Math.max(dragOffset, -80)}px)`
                : undefined,
            }}
          >
            <span
              className="h-1.5 w-14 rounded-full bg-[#f4f0e8]/85 shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
              aria-hidden
            />
          </button>
          {chromeTrailing ? (
            <div className="absolute bottom-0 right-0 overflow-visible">
              {chromeTrailing}
            </div>
          ) : null}
        </div>
      </div>

      {/* White info card — slides up from below the map. */}
      <section
        aria-label={title}
        aria-hidden={!sheetOpen}
        className={`absolute inset-x-0 bottom-0 z-[560] flex flex-col overflow-hidden rounded-t-[1.75rem] border border-b-0 border-[#3f454c]/10 bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.22)] will-change-transform overscroll-contain ${
          sheetOpen ? "" : "pointer-events-none"
        }`}
        style={{
          height: sheetHeight,
          maxHeight: "100%",
          transform: sheetTransform,
          transitionProperty: dragOffset ? "none" : "transform, height",
          transitionDuration: dragOffset ? "0ms" : "380ms",
          transitionTimingFunction: SHEET_EASE,
        }}
      >
        <div className="relative shrink-0 px-4 pb-1 pt-2">
          {headerLeading ? (
            <div className="absolute left-4 top-2 z-[1] flex h-11 max-w-[calc(50%-2.5rem)] items-center">
              {headerLeading}
            </div>
          ) : null}
          <button
            type="button"
            aria-label={snap === "full" ? "Collapse panel" : "Expand panel"}
            onClick={onGrabberClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="mx-auto flex min-h-11 w-full max-w-[10rem] touch-none items-center justify-center"
          >
            <span className="h-1 w-12 rounded-full bg-[#3f454c]/20" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="absolute right-3 top-2 inline-flex h-11 w-11 items-center justify-center text-[#3f454c]/55 hover:text-[#3f454c]"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        {peek ? (
          <div className="shrink-0 px-4 pb-2">{peek}</div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(2rem,env(safe-area-inset-bottom))] scrollbar-none">
          {children}
        </div>
      </section>
    </>
  );
}

type BeaconStepper = {
  index: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
};

function BeaconStepControls({
  stepper,
  className = "",
}: {
  stepper: BeaconStepper;
  className?: string;
}) {
  return (
    <div className={`flex shrink-0 items-center ${className}`}>
      <button
        type="button"
        onClick={stepper.onPrev}
        disabled={!stepper.onPrev}
        aria-label="Previous beacon"
        className="inline-flex h-11 w-11 items-center justify-center text-[#3f454c]/70 disabled:opacity-25"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
      <span className="min-w-[2.25rem] text-center text-[10px] tabular-nums uppercase tracking-widest text-[#3f454c]/45">
        {stepper.index + 1}/{stepper.total}
      </span>
      <button
        type="button"
        onClick={stepper.onNext}
        disabled={!stepper.onNext}
        aria-label="Next beacon"
        className="inline-flex h-11 w-11 items-center justify-center text-[#3f454c]/70 disabled:opacity-25"
      >
        <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

/** One-line summary of the current selection, shown in the sheet's peek row. */
function SelectionPeek({
  selectedBeacon,
  selectedProject,
  selectedHuntPin = null,
  completedLocally = false,
}: {
  selectedBeacon: SidequesterBeacon | null;
  selectedProject: BurningManProject | null;
  selectedHuntPin?: PlayaHuntPin | null;
  completedLocally?: boolean;
}) {
  if (selectedHuntPin) {
    return (
      <div className="flex min-w-0 items-center gap-3 pr-10">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[#c44569]"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-foreground/55">
            Main quest
            {selectedHuntPin.done ? (
              <span className="text-[#1f6b4f]">· Done</span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate text-sm">{selectedHuntPin.title}</p>
        </div>
      </div>
    );
  }

  const meta = selectedBeacon ? beaconKindMeta(selectedBeacon.kind) : null;
  const serviceKind =
    selectedBeacon && isServiceBeacon(selectedBeacon.kind)
      ? (selectedBeacon.kind as ServiceLayerKind)
      : null;
  const isSet = selectedBeacon ? isSetBeacon(selectedBeacon.kind) : false;
  const place =
    selectedBeacon?.details?.trim() &&
    selectedBeacon.details.trim().toLowerCase() !== meta?.label.toLowerCase()
      ? selectedBeacon.details.trim()
      : null;

  return (
    <div className="flex min-w-0 items-center gap-3 pr-10">
      {serviceKind ? (
        <ServiceKindBadge kind={serviceKind} />
      ) : isSet ? (
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: LAYER_COLOR_SETS }}
          aria-hidden
        >
          <Disc3 className="h-4 w-4 text-[#f4f0e8]" strokeWidth={1.75} />
        </span>
      ) : meta ? (
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: meta.color }}
          aria-hidden
        />
      ) : null}
      <div className="min-w-0 flex-1">
        {serviceKind ? (
          <>
            <p className="truncate text-sm font-medium leading-tight">
              {meta?.label}
            </p>
            {place ? (
              <p className="mt-0.5 truncate text-[11px] text-foreground/55">
                {place}
              </p>
            ) : null}
          </>
        ) : isSet ? (
          <>
            <p className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-foreground/55">
              {selectedBeacon?.live ? "Now playing" : "Up next"}
              {selectedBeacon?.live ? (
                <span className="text-[#c6e85a]">· Live</span>
              ) : null}
              {selectedBeacon ? (
                <SetLocationBadge
                  confirmed={isBeaconLocationConfirmed(selectedBeacon)}
                />
              ) : null}
              {selectedBeacon?.id.startsWith("demo-") ? (
                <span className="text-foreground/40">· Demo</span>
              ) : null}
            </p>
            <p className="mt-0.5 truncate text-sm">
              {selectedBeacon?.details?.trim() || "Live set"}
            </p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-foreground/55">
              {meta ? meta.label : selectedProject?.event_year}
              {selectedBeacon?.live ? (
                <span className="text-[#b8dc42]">· Live</span>
              ) : null}
              {selectedBeacon && completedLocally ? (
                <span className="text-foreground/45">· Done</span>
              ) : null}
            </p>
            <p className="mt-0.5 truncate text-sm">
              {selectedBeacon
                ? selectedBeacon.details || "(no details)"
                : selectedProject?.title}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function SetLocationBadge({
  confirmed,
}: {
  confirmed: boolean;
}) {
  return (
    <span
      className={
        confirmed
          ? "rounded-sm bg-[#3f7a3f]/15 px-1.5 py-0.5 text-[#3f7a3f]"
          : "rounded-sm bg-[#3f454c]/10 px-1.5 py-0.5 text-[#3f454c]/55"
      }
    >
      {confirmed ? "Confirmed" : "Unconfirmed"}
    </span>
  );
}

function ServiceKindBadge({
  kind,
  size = 36,
}: {
  kind: ServiceLayerKind;
  size?: number;
}) {
  const Icon = serviceIconForKind(kind);
  const user = isUserServiceKind(kind);
  const glyph = Math.round(size * 0.48);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.22)]"
      style={{
        width: size,
        height: size,
        backgroundColor: user ? "#f4f0e8" : "#3d8fc4",
        color: user ? "#3f454c" : "#ffffff",
        boxShadow: `0 0 0 1.5px ${user ? "#8b5fbf" : "#3d8fc4"}, 0 1px 3px rgba(0,0,0,0.22)`,
      }}
      aria-hidden
    >
      {user ? (
        <Heart
          size={glyph}
          strokeWidth={0}
          fill="#3f454c"
          stroke="none"
        />
      ) : Icon ? (
        <Icon size={glyph} />
      ) : null}
    </span>
  );
}

function ServiceUpdateTimeline({
  updates,
  onPostUpdate,
}: {
  updates: BeaconUpdate[];
  onPostUpdate?: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const chronological = [...updates].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const submit = () => {
    const text = draft.trim();
    if (!text || !onPostUpdate) return;
    onPostUpdate(text);
    setDraft("");
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-widest text-foreground/45">
          Updates
        </p>
        {chronological.length === 0 ? (
          <p className="text-sm text-foreground/45">No updates yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {chronological.map((update) => (
              <li
                key={update.id}
                className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2 text-sm leading-snug"
              >
                <span className="tabular-nums text-[11px] text-foreground/45">
                  {formatBeaconUpdateTime(update.createdAt)}
                </span>
                <span className="text-foreground/80">{update.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {onPostUpdate ? (
        <form
          className="border-t border-[#3f454c]/10 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="sr-only" htmlFor="service-update-input">
            Post an update
          </label>
          <div className="flex items-end gap-2">
            <input
              id="service-update-input"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Post an update…"
              className="min-h-11 min-w-0 flex-1 border-0 border-b border-[#3f454c]/15 bg-transparent px-0 py-2 text-[16px] text-[#3f454c] placeholder:text-[#3f454c]/35 focus:border-[#3f454c]/40 focus:outline-none focus:ring-0"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="inline-flex min-h-11 shrink-0 items-center px-1 text-[11px] uppercase tracking-widest text-[#3d8fc4] disabled:opacity-30"
            >
              Post
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/**
 * Home hub: category directory for the info card.
 */
function QuestHub({
  beacons,
  selectedBeaconId,
  resourceCategoryId,
  nowMs,
  myShareCode,
  shareLocationOn,
  followedCodes,
  friendPresences,
  presenceError,
  onSelectResource,
  onBrowseResourceCategory,
  onRemove,
  allowRemove,
  onShareLocationChange,
  onFollowFriend,
  onUnfollowFriend,
}: {
  beacons: SidequesterBeacon[];
  selectedBeaconId: string | null;
  resourceCategoryId: ResourceCategoryId;
  nowMs: number;
  myShareCode: string;
  shareLocationOn: boolean;
  followedCodes: string[];
  friendPresences: PlayaFriendPresence[];
  presenceError: string | null;
  onSelectResource: (beacon: SidequesterBeacon) => void;
  onBrowseResourceCategory: (categoryId: ResourceCategoryId) => void;
  onRemove: (id: string) => void;
  allowRemove: (beacon: SidequesterBeacon) => boolean;
  onShareLocationChange: (enabled: boolean) => void;
  onFollowFriend: (code: string) => void;
  onUnfollowFriend: (code: string) => void;
}) {
  return (
    <div className="space-y-2.5" aria-label="Sideburns hub">
      <ResourcesPanel
        beacons={beacons}
        categoryId={resourceCategoryId}
        selectedBeaconId={selectedBeaconId}
        nowMs={nowMs}
        myShareCode={myShareCode}
        shareLocationOn={shareLocationOn}
        followedCodes={followedCodes}
        friendPresences={friendPresences}
        presenceError={presenceError}
        onCategoryChange={onBrowseResourceCategory}
        onSelect={onSelectResource}
        onRemove={onRemove}
        allowRemove={allowRemove}
        onShareLocationChange={onShareLocationChange}
        onFollowFriend={onFollowFriend}
        onUnfollowFriend={onUnfollowFriend}
      />

      <p className="text-[9px] leading-relaxed text-foreground/35">
        Not affiliated with Burning Man Project.{" "}
        <Link to="/privacy" className="underline underline-offset-2">
          Privacy
        </Link>
      </p>
    </div>
  );
}

function PartyPresencePanel({
  myShareCode,
  shareLocationOn,
  followedCodes,
  friendPresences,
  presenceError,
  onShareLocationChange,
  onFollowFriend,
  onUnfollowFriend,
}: {
  myShareCode: string;
  shareLocationOn: boolean;
  followedCodes: string[];
  friendPresences: PlayaFriendPresence[];
  presenceError: string | null;
  onShareLocationChange: (enabled: boolean) => void;
  onFollowFriend: (code: string) => void;
  onUnfollowFriend: (code: string) => void;
}) {
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);

  const follow = () => {
    const raw = entry.trim();
    if (!raw) return;
    const normalized = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (normalized.length !== 6) {
      setError("Friend codes are 6 characters.");
      return;
    }
    if (normalized === myShareCode.replace(/\s/g, "")) {
      setError("That’s your own code.");
      return;
    }
    onFollowFriend(normalized);
    setEntry("");
    setError(null);
  };

  const presenceByCode = new Map(
    friendPresences.map((f) => [f.code.replace(/\s/g, ""), f]),
  );

  return (
    <section className="space-y-3" aria-label="Party location sharing">
      <p className="text-[12px] leading-relaxed text-foreground/55">
        Share your device code so friends can see you on the map. No account —
        just GPS + a short code.
      </p>

      <div className="space-y-2">
        <h3 className="text-[9px] uppercase tracking-[0.22em] text-foreground/45">
          Your code
        </h3>
        <div className="flex items-center gap-2 rounded-lg border border-[#8a5a2b]/25 bg-[#8a5a2b]/10 px-2.5 py-2">
          <code className="min-w-0 flex-1 font-mono text-[1.35rem] tracking-[0.18em] text-foreground/90">
            {formatShareCode(myShareCode)}
          </code>
          <CopyCodeButton
            value={myShareCode.replace(/\s/g, "")}
            label="Copy device code"
          />
        </div>
        <button
          type="button"
          aria-pressed={shareLocationOn}
          onClick={() => onShareLocationChange(!shareLocationOn)}
          className={`inline-flex min-h-10 w-full items-center justify-center rounded-md px-3 text-[11px] uppercase tracking-widest ${
            shareLocationOn
              ? "bg-[#1f6b4f] text-[#e8f7ef]"
              : "bg-[#8a5a2b] text-[#f7efe3]"
          }`}
        >
          {shareLocationOn ? "Sharing location" : "Share my location"}
        </button>
        {presenceError ? (
          <p className="text-[12px] text-[#a33a2c]">{presenceError}</p>
        ) : shareLocationOn ? (
          <p className="text-[11px] text-foreground/45">
            Live — friends with your code can see you while this stays on.
          </p>
        ) : (
          <p className="text-[11px] text-foreground/45">
            Turn on sharing so your pin appears for anyone following this code.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-foreground/10 pt-3">
        <h3 className="text-[9px] uppercase tracking-[0.22em] text-foreground/45">
          Follow a friend
        </h3>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            follow();
          }}
        >
          <input
            type="text"
            value={entry}
            onChange={(e) => {
              setEntry(e.target.value.toUpperCase());
              setError(null);
            }}
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="done"
            maxLength={8}
            placeholder="Their 6-character code"
            className="min-h-11 w-full rounded-lg border border-foreground/10 bg-background/80 px-3 font-mono text-[13px] tracking-[0.18em] outline-none focus:border-[#8a5a2b]/50"
          />
          {error ? <p className="text-[12px] text-[#a33a2c]">{error}</p> : null}
          <button
            type="submit"
            disabled={entry.trim().length < 6}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[#3f454c] px-3 text-[11px] uppercase tracking-widest text-[#f4f0e8] disabled:opacity-35"
          >
            Show on map
          </button>
        </form>
      </div>

      {followedCodes.length ? (
        <ul className="space-y-1 border-t border-foreground/10 pt-3">
          {followedCodes.map((code) => {
            const presence = presenceByCode.get(code);
            return (
              <li
                key={code}
                className="flex items-center gap-2 rounded-lg bg-[#f4f0e8]/40 px-2.5 py-2"
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: presence
                      ? presence.stale
                        ? "#a89b86"
                        : "#e8912e"
                      : "#3f454c55",
                  }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[13px] tracking-wide text-foreground/80">
                    {formatShareCode(code)}
                  </span>
                  <span className="block text-[10px] uppercase tracking-widest text-foreground/45">
                    {presence
                      ? presence.stale
                        ? "Last seen a while ago"
                        : "Live on map"
                      : "Waiting for share…"}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Stop following ${code}`}
                  onClick={() => onUnfollowFriend(code)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-[#3f454c]/40"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}


function CopyCodeButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#8a5a2b]/70 hover:bg-[#8a5a2b]/15 hover:text-[#8a5a2b]"
    >
      {copied ? (
        <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      ) : (
        <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
      )}
    </button>
  );
}

function MapTopChrome({
  searchQuery,
  onSearchQueryChange,
  searchFocused,
  onSearchFocusedChange,
  searchHits,
  onSelectProject,
  onSelectBeacon,
  layerToolbar,
  hidden = false,
  admin = false,
}: {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchFocused: boolean;
  onSearchFocusedChange: (focused: boolean) => void;
  searchHits: Array<
    | { kind: "project"; project: BurningManProject; lat: number; lng: number }
    | { kind: "beacon"; beacon: SidequesterBeacon }
  >;
  onSelectProject: (project: BurningManProject) => void;
  onSelectBeacon: (beacon: SidequesterBeacon) => void;
  layerToolbar: ReactNode;
  hidden?: boolean;
  admin?: boolean;
}) {
  const showResults = searchFocused && searchQuery.trim().length >= 2;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-0 z-[540] transition-opacity ${
        hidden ? "opacity-0" : ""
      }`}
      aria-hidden={hidden || undefined}
    >
      {/* Keep full-width layout, but only real controls take taps — empty
          space must pass through to the map (camp streets sit under this row). */}
      <div
        className={`flex min-h-11 w-full items-start gap-1 px-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] ${
          hidden ? "pointer-events-none" : ""
        }`}
      >
        <p
          className="pointer-events-none flex w-9 shrink-0 justify-center select-none pt-1.5 font-display text-[1.05rem] uppercase leading-none tracking-[0.22em] text-white/90"
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
          }}
          aria-label={admin ? "Admin" : "Sideburns"}
        >
          {admin ? "ADMIN" : "SIDEBURNS"}
        </p>

        <div className="relative min-w-0 flex-1">
          <label className="sr-only" htmlFor="map-search">
            Search The Playa
          </label>
          <div className="pointer-events-auto flex min-h-11 w-full items-center gap-2 rounded-full bg-[#f4f0e8]/85 px-3">
            <Search
              className="h-3.5 w-3.5 shrink-0 text-[#3f454c]/45"
              strokeWidth={1.75}
              aria-hidden
            />
            <input
              id="map-search"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              onFocus={() => {
                onSearchFocusedChange(true);
              }}
              onBlur={() => {
                // Allow result click before closing.
                window.setTimeout(() => onSearchFocusedChange(false), 120);
              }}
              placeholder="THE PLAYA"
              className="min-w-0 flex-1 appearance-none border-0 bg-transparent text-[16px] text-[#3f454c] outline-none placeholder:text-[11px] placeholder:font-semibold placeholder:uppercase placeholder:tracking-widest placeholder:text-[#3f454c]/45 focus:outline-none focus-visible:outline-none"
            />
            {searchQuery ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onSearchQueryChange("")}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[#3f454c]/45 active:text-[#3f454c]"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </div>

          {showResults ? (
            <ul
              className="pointer-events-auto absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[542] max-h-[min(16rem,45dvh)] overflow-y-auto overscroll-contain rounded-3xl border border-[#3f454c]/10 bg-[#f4f0e8] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
              role="listbox"
              aria-label="Search results"
            >
              {searchHits.length === 0 ? (
                <li className="px-3 py-2.5 text-[12px] text-[#3f454c]/55">
                  No matches
                </li>
              ) : (
                searchHits.map((hit) =>
                  hit.kind === "project" ? (
                    <li key={`p-${hit.project.id}`} role="option">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onSelectProject(hit.project)}
                        className="flex w-full flex-col px-3 py-2.5 text-left hover:bg-[#3f454c]/8 active:bg-[#3f454c]/12"
                      >
                        <span className="text-[13px] font-medium text-[#3f454c]">
                          {hit.project.title}
                        </span>
                        <span className="text-[10px] uppercase tracking-widest text-[#3f454c]/45">
                          Project · {hit.project.event_year}
                        </span>
                      </button>
                    </li>
                  ) : (
                    <li key={`b-${hit.beacon.id}`} role="option">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onSelectBeacon(hit.beacon)}
                        className="flex w-full flex-col px-3 py-2.5 text-left hover:bg-[#3f454c]/8 active:bg-[#3f454c]/12"
                      >
                        <span className="text-[13px] font-medium text-[#3f454c]">
                          {hit.beacon.details.trim() ||
                            beaconKindMeta(hit.beacon.kind).label}
                        </span>
                        <span className="text-[10px] uppercase tracking-widest text-[#3f454c]/45">
                          {beaconKindMeta(hit.beacon.kind).label}
                        </span>
                      </button>
                    </li>
                  ),
                )
              )}
            </ul>
          ) : null}
        </div>

        <div
          className={`pointer-events-auto w-11 shrink-0 ${
            hidden ? "pointer-events-none" : ""
          }`}
        >
          {layerToolbar}
        </div>
      </div>
    </div>
  );
}

/** Top-bar layer icons — one collapsible Layers group. */
function LayerToolbar({
  showProjects,
  showFood,
  showServices,
  showSets,
  showCampService,
  visibleBeaconKinds,
  onToggleProjects,
  onToggleFood,
  onToggleServices,
  onToggleSets,
  onToggleCampService,
  onToggleBeaconKind,
  hidden = false,
  collapseFilters = false,
}: {
  showProjects: boolean;
  showFood: boolean;
  showServices: boolean;
  showSets: boolean;
  showCampService: boolean;
  visibleBeaconKinds: Record<SidequestLayerKind, boolean>;
  onToggleProjects: () => void;
  onToggleFood: () => void;
  onToggleServices: () => void;
  onToggleSets: () => void;
  onToggleCampService: () => void;
  onToggleBeaconKind: (kind: SidequestLayerKind) => void;
  hidden?: boolean;
  /** Collapse the group when the bottom sheet covers the map. */
  collapseFilters?: boolean;
}) {
  const [layersOpen, setLayersOpen] = useState(false);
  useEffect(() => {
    if (collapseFilters) setLayersOpen(false);
  }, [collapseFilters]);

  const anyLayerOn =
    showProjects ||
    showServices ||
    showFood ||
    showSets ||
    showCampService ||
    Object.values(visibleBeaconKinds).some(Boolean);

  const isOn = (id: (typeof LAYER_FILTER_ITEMS)[number]["id"]) => {
    if (id === "projects") return showProjects;
    if (id === "city") return showServices;
    if (id === "food") return showFood;
    if (id === "set") return showSets;
    if (id === "camp_service") return showCampService;
    return visibleBeaconKinds[id];
  };

  const onToggle = (id: (typeof LAYER_FILTER_ITEMS)[number]["id"]) => {
    if (id === "projects") onToggleProjects();
    else if (id === "city") onToggleServices();
    else if (id === "food") onToggleFood();
    else if (id === "set") onToggleSets();
    else if (id === "camp_service") onToggleCampService();
    else onToggleBeaconKind(id);
  };

  return (
    <div
      aria-label="Map layers"
      className={`relative flex flex-col items-center transition-opacity ${
        hidden ? "pointer-events-none opacity-0" : ""
      }`}
    >
      <div
        className="flex w-11 flex-col items-center"
        style={
          layersOpen
            ? {
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
                borderBottomLeftRadius: 9999,
                borderBottomRightRadius: 9999,
                overflow: "hidden",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                boxShadow: LAYER_SHADOW,
              }
            : undefined
        }
      >
        <LayerIconButton
          label={layersOpen ? "Hide map layers" : "Map layers"}
          active={anyLayerOn}
          accent={LAYER_COLOR_PROJECTS}
          icon={Layers}
          chrome={layersOpen ? "surface" : "ghost"}
          framed={layersOpen && anyLayerOn}
          connected={layersOpen}
          onClick={() => setLayersOpen((open) => !open)}
        />

        <div
          className={`flex w-full flex-col items-center gap-1 overflow-hidden transition-[max-height,opacity,padding] duration-300 ease-out ${
            layersOpen
              ? "max-h-[32rem] px-1 pb-1.5 pt-1 opacity-100"
              : "pointer-events-none max-h-0 opacity-0"
          }`}
          style={layersOpen ? { backgroundColor: LAYER_SURFACE_ON } : undefined}
          aria-label="Layer filters"
          aria-hidden={!layersOpen}
        >
          {LAYER_FILTER_ITEMS.map((item, index) => (
            <HexFilterButton
              key={item.id}
              label={item.label}
              color={item.color}
              icon={item.icon}
              imageSrc={item.imageSrc}
              glyph={item.glyph}
              filled={item.filled}
              on={isOn(item.id)}
              visible={layersOpen}
              index={index}
              onClick={() => onToggle(item.id)}
            />
          ))}
          <button
            type="button"
            aria-label="Hide map layers"
            title="Hide layers"
            onClick={() => setLayersOpen(false)}
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#3f454c]/70"
          >
            <ChevronUp className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
function iconColorOnAccent(hex: string): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return "#ffffff";
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.62 ? "#17130f" : "#ffffff";
}

function LayerIconButton({
  label,
  active,
  accent,
  icon: Icon,
  imageSrc,
  onClick,
  connected = false,
  chrome = "accent",
  framed = false,
}: {
  label: string;
  active: boolean;
  accent: string;
  icon?: LucideIcon;
  /** Optional raster mark (e.g. City skyline). */
  imageSrc?: string;
  onClick: () => void;
  /** Joined to a filter strip below — keep top radius, square off the bottom. */
  connected?: boolean;
  /** `surface` = cream chrome; `accent` = solid fill when on; `ghost` = no chrome. */
  chrome?: "accent" | "surface" | "ghost";
  /** Nested accent square inside the cream control (filters open). */
  framed?: boolean;
}) {
  const outerBg =
    chrome === "ghost"
      ? "transparent"
      : chrome === "surface" || framed
        ? active || framed
          ? LAYER_SURFACE_ON
          : LAYER_SURFACE
        : active
          ? accent
          : LAYER_SURFACE;

  const ink =
    chrome === "ghost"
      ? "#ffffff"
      : framed || (active && chrome === "accent")
        ? iconColorOnAccent(accent)
        : "#3d3833";

  const mark = imageSrc ? (
    <img
      src={imageSrc}
      alt=""
      aria-hidden
      className="h-7 w-7 rounded-[6px] object-contain"
      style={
        // Black-on-transparent marks (e.g. Projects) need invert on dark fills.
        active && chrome === "accent" && !framed
          ? { filter: "brightness(0) invert(1)" }
          : undefined
      }
    />
  ) : Icon ? (
    <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.5} aria-hidden />
  ) : null;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`inline-flex h-11 w-11 items-center justify-center transition-colors ${
        connected ? "rounded-none rounded-t-[14px]" : "rounded-[14px]"
      }`}
      style={{
        backgroundColor: outerBg,
        color: framed ? undefined : ink,
        boxShadow:
          chrome === "ghost" || connected || framed ? "none" : LAYER_SHADOW,
        ...(connected
          ? {
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
            }
          : null),
      }}
    >
      {framed ? (
        <span
          aria-hidden
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px]"
          style={{
            backgroundColor: accent,
            color: iconColorOnAccent(accent),
          }}
        >
          {mark}
        </span>
      ) : (
        mark
      )}
    </button>
  );
}

/** General filter mark — diamond waypoint over a sky disc (see brand reference). */
function WaypointMark({ on }: { on: boolean }) {
  const ink = "#17130f";
  const sky = on ? "#7ec8e8" : "transparent";
  const gold = on ? "#e8a812" : "transparent";
  const leaf = on ? "#5a9a3a" : "transparent";
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[1.15rem] w-[1.15rem]">
      <circle
        cx="12"
        cy="12"
        r="7.1"
        fill={sky}
        stroke={ink}
        strokeWidth="1.65"
      />
      <path
        d="M12 3.15 L18.35 12 L5.65 12 Z"
        fill={gold}
        stroke={ink}
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path
        d="M5.65 12 L18.35 12 L12 20.85 Z"
        fill={leaf}
        stroke={ink}
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="3.15"
        x2="12"
        y2="5.2"
        stroke={ink}
        strokeWidth="1.65"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HexFilterButton({
  label,
  color,
  icon: Icon,
  imageSrc,
  glyph,
  filled = false,
  on,
  visible,
  index,
  onClick,
}: {
  label: string;
  color: string;
  icon?: LucideIcon;
  imageSrc?: string;
  glyph?: string;
  filled?: boolean;
  on: boolean;
  visible: boolean;
  index: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onClick}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center bg-transparent transition-[opacity,transform] duration-300 ease-out"
      style={{
        opacity: visible ? (on ? 1 : 0.38) : 0,
        transform: visible
          ? "translateY(0) scale(1)"
          : "translateY(-10px) scale(0.85)",
        transitionDelay: visible ? `${index * 35}ms` : "0ms",
      }}
    >
      {glyph === "waypoint" ? (
        <WaypointMark on={on} />
      ) : glyph ? (
        <span
          className="text-[11px] font-semibold leading-none tracking-tight"
          style={{ color: on ? color : "#3f454c" }}
          aria-hidden
        >
          {glyph}
        </span>
      ) : imageSrc && filled ? (
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: on ? color : "transparent" }}
          aria-hidden
        >
          <span
            className="block h-3.5 w-3.5"
            style={{
              backgroundColor: on ? "#ffffff" : color,
              WebkitMask: `url(${imageSrc}) center / contain no-repeat`,
              mask: `url(${imageSrc}) center / contain no-repeat`,
            }}
          />
        </span>
      ) : imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          aria-hidden
          className="h-4 w-4 object-contain"
          style={{
            opacity: on ? 1 : 0.45,
            filter: on ? "none" : "grayscale(0.2)",
          }}
        />
      ) : Icon && filled ? (
        <Icon
          className="h-3.5 w-3.5"
          strokeWidth={0}
          fill="#3f454c"
          stroke="none"
          aria-hidden
        />
      ) : Icon ? (
        <Icon
          className="h-3.5 w-3.5"
          strokeWidth={on ? 1.75 : 2}
          stroke={on ? color : "#3f454c"}
          fill="none"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

function BeaconComposer({
  admin = false,
  kind,
  details,
  description,
  principle,
  setPlace,
  setLive,
  eventStartsAt,
  placingMode,
  canPlace,
  formError,
  needsEventTime,
  needsSetStartTime,
  isSingleSideburns,
  isOpenSidequest,
  questMode,
  showQuestBuilder,
  canStartQuest,
  isSet,
  questForm,
  onKindChange,
  onQuestModeChange,
  onQuestNext,
  onDetailsChange,
  onDescriptionChange,
  onPrincipleChange,
  onSetPlaceChange,
  onSetLiveChange,
  onEventStartsAtChange,
  onStartPlacing,
  onCancelPlacing,
}: {
  admin?: boolean;
  kind: SidequesterBeaconKind;
  details: string;
  description: string;
  principle: BurningManPrinciple | "";
  setPlace: string;
  setLive: boolean;
  eventStartsAt: string;
  placingMode: boolean;
  canPlace: boolean;
  formError: string;
  needsEventTime: boolean;
  needsSetStartTime: boolean;
  isSingleSideburns: boolean;
  isOpenSidequest: boolean;
  questMode: boolean;
  /** True once Next opens the multi-stop builder. */
  showQuestBuilder: boolean;
  canStartQuest: boolean;
  isSet: boolean;
  questForm: ReactNode;
  onKindChange: (kind: SidequesterBeaconKind) => void;
  onQuestModeChange: (value: boolean) => void;
  onQuestNext: () => void;
  onDetailsChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPrincipleChange: (value: BurningManPrinciple | "") => void;
  onSetPlaceChange: (value: string) => void;
  onSetLiveChange: (value: boolean) => void;
  onEventStartsAtChange: (value: string) => void;
  onStartPlacing: () => void;
  onCancelPlacing: () => void;
}) {
  const composerChips: readonly ComposerChipId[] = admin
    ? ADMIN_COMPOSER_CHIP_IDS
    : COMPOSER_KIND_IDS;
  const citySelected = isCityServiceKind(kind);
  return (
    <section aria-label="Add a beacon">
      <div
        className="scrollbar-none flex touch-pan-x snap-x snap-proximity flex-nowrap gap-1 overflow-x-auto overscroll-x-contain pb-1"
        role="listbox"
        aria-label="Beacon type"
      >
        {composerChips.map((id) => {
          const isCityChip = id === "city";
          const meta = isCityChip
            ? { label: "City", color: LAYER_COLOR_SERVICES }
            : beaconKindMeta(id);
          const mark = isCityChip
            ? { imageSrc: "/icons/city-layer.svg" as const, icon: undefined }
            : COMPOSER_KIND_MARKS[id];
          const label = isCityChip
            ? "City"
            : (COMPOSER_KIND_LABELS[id] ?? meta.label);
          const active = isCityChip
            ? citySelected
            : kind === id || (id === "sidequest" && isRouteQuestKind(kind));
          const ink = iconColorOnAccent(meta.color);
          const Icon = mark.icon;
          return (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={active}
              disabled={placingMode}
              onClick={() => {
                if (id === "city") {
                  onKindChange(isCityServiceKind(kind) ? kind : "med_tent");
                  return;
                }
                onKindChange(id);
              }}
              className={`inline-flex h-9 shrink-0 snap-start items-center gap-1.5 rounded-full px-2.5 text-[11px] uppercase tracking-widest transition-colors disabled:opacity-50 ${
                active ? "" : "bg-[#3f454c]/10 text-[#3f454c]/75"
              }`}
              style={
                active
                  ? { backgroundColor: meta.color, color: ink }
                  : undefined
              }
            >
              {mark.imageSrc ? (
                <img
                  src={mark.imageSrc}
                  alt=""
                  aria-hidden
                  className="h-3.5 w-3.5 object-contain"
                  style={
                    active
                      ? {
                          filter:
                            ink === "#ffffff"
                              ? "brightness(0) invert(1)"
                              : "brightness(0)",
                        }
                      : { filter: "brightness(0)", opacity: 0.55 }
                  }
                />
              ) : Icon ? (
                <Icon
                  className="h-3.5 w-3.5"
                  strokeWidth={0}
                  fill={active ? "currentColor" : "#3f454c"}
                  stroke="none"
                  aria-hidden
                />
              ) : null}
              {label}
            </button>
          );
        })}
      </div>

      {citySelected ? (
        <div
          className="scrollbar-none mt-2 flex touch-pan-x snap-x snap-proximity flex-nowrap gap-1 overflow-x-auto overscroll-x-contain pb-1"
          role="listbox"
          aria-label="City pin type"
        >
          {CITY_SERVICE_KIND_IDS.map((id) => {
            const meta = beaconKindMeta(id);
            const active = kind === id;
            const ink = iconColorOnAccent(meta.color);
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={active}
                disabled={placingMode}
                onClick={() => onKindChange(id)}
                className={`inline-flex h-9 shrink-0 snap-start items-center gap-1.5 rounded-full px-2.5 text-[11px] uppercase tracking-widest transition-colors disabled:opacity-50 ${
                  active ? "" : "bg-[#3f454c]/10 text-[#3f454c]/75"
                }`}
                style={
                  active
                    ? { backgroundColor: meta.color, color: ink }
                    : undefined
                }
              >
                <ServiceKindBadge kind={id} size={18} />
                {meta.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {isOpenSidequest ? (
        <div className="mt-2.5 space-y-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-foreground/55">
              Name
            </span>
            <input
              type="text"
              value={details}
              onChange={(e) => onDetailsChange(e.target.value)}
              disabled={placingMode || showQuestBuilder}
              placeholder="What is this called?"
              className="mt-1 w-full rounded-xl border border-[#3f454c]/15 bg-[#f4f0e8] px-3 py-2 text-base text-[#3f454c] outline-none placeholder:text-[#3f454c]/35 focus:border-[#3f454c]/40 disabled:opacity-60"
            />
          </label>

          <div className="inline-flex items-center gap-2">
            <span
              className={`text-[10px] uppercase tracking-widest ${
                questMode ? "text-[#3f454c]/45" : "text-[#ff6b9d]"
              }`}
            >
              Mission
            </span>
            <button
              type="button"
              role="switch"
              disabled={placingMode || showQuestBuilder}
              aria-checked={questMode}
              aria-label={questMode ? "Quest mode" : "Mission mode"}
              title={questMode ? "Quest" : "Mission"}
              onClick={() => onQuestModeChange(!questMode)}
              className={`relative inline-flex h-8 w-[3.25rem] shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                questMode ? "bg-[#c44569]" : "bg-[#3f454c]/20"
              }`}
            >
              <span
                className={`absolute top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#f4f0e8] shadow-sm transition-transform ${
                  questMode
                    ? "translate-x-[1.4rem] text-[#c44569]"
                    : "translate-x-0.5 text-[#3f454c]/45"
                }`}
              >
                <Star
                  className="h-3.5 w-3.5"
                  strokeWidth={1.75}
                  fill={questMode ? "currentColor" : "none"}
                  aria-hidden
                />
              </span>
            </button>
            <span
              className={`text-[10px] uppercase tracking-widest ${
                questMode ? "text-[#c44569]" : "text-[#3f454c]/45"
              }`}
            >
              Quest
            </span>
          </div>
        </div>
      ) : null}

      {isOpenSidequest && showQuestBuilder ? (
        <div className="mt-3">{questForm}</div>
      ) : isSet ? (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-foreground/55">
              Who’s playing
            </span>
            <input
              type="text"
              value={details}
              onChange={(e) => onDetailsChange(e.target.value)}
              disabled={placingMode}
              placeholder="DJ, band, or set name"
              className="mt-1.5 w-full rounded-xl border border-[#3f454c]/15 bg-[#f4f0e8] px-3 py-2.5 text-base text-[#3f454c] outline-none placeholder:text-[#3f454c]/35 focus:border-[#3f454c]/40"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-foreground/55">
              Camp / stage (optional)
            </span>
            <input
              type="text"
              value={setPlace}
              onChange={(e) => onSetPlaceChange(e.target.value)}
              disabled={placingMode}
              placeholder="e.g. Robot Heart · 2:30 & Esplanade"
              className="mt-1.5 w-full rounded-xl border border-[#3f454c]/15 bg-[#f4f0e8] px-3 py-2.5 text-base text-[#3f454c] outline-none placeholder:text-[#3f454c]/35 focus:border-[#3f454c]/40"
            />
          </label>
          <button
            type="button"
            disabled={placingMode}
            aria-pressed={setLive}
            onClick={() => onSetLiveChange(!setLive)}
            className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-[12px] uppercase tracking-widest disabled:opacity-50 ${
              setLive
                ? "bg-[#c8ff00] text-[#17130f]"
                : "bg-[#3f454c]/8 text-[#3f454c]/70"
            }`}
          >
            <span>{setLive ? "Live now" : "Not live yet"}</span>
            <Disc3 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
          {needsSetStartTime ? (
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-foreground/55">
                Goes live
              </span>
              <input
                type="datetime-local"
                value={eventStartsAt}
                onChange={(e) => onEventStartsAtChange(e.target.value)}
                disabled={placingMode}
                className="mt-1.5 w-full rounded-xl border border-[#3f454c]/15 bg-[#f4f0e8] px-3 py-2.5 text-base text-[#3f454c] outline-none focus:border-[#3f454c]/40"
              />
            </label>
          ) : null}
        </div>
      ) : (
        <>
          {needsEventTime ? (
            <label className="mt-3 block">
              <span className="text-[10px] uppercase tracking-widest text-foreground/55">
                Starts
              </span>
              <input
                type="datetime-local"
                value={eventStartsAt}
                onChange={(e) => onEventStartsAtChange(e.target.value)}
                disabled={placingMode}
                className="mt-1.5 w-full rounded-xl border border-[#3f454c]/15 bg-[#f4f0e8] px-3 py-2.5 text-base text-[#3f454c] outline-none focus:border-[#3f454c]/40"
              />
            </label>
          ) : null}

          {isOpenSidequest ? null : (
            <label className="mt-3 block">
              <span className="text-[10px] uppercase tracking-widest text-foreground/55">
                {citySelected ? "Location" : "Details"}
              </span>
              <textarea
                value={details}
                onChange={(e) => onDetailsChange(e.target.value)}
                disabled={placingMode}
                rows={3}
                placeholder={
                  needsEventTime
                    ? "What’s the meetup?"
                    : citySelected
                      ? "Where is this? e.g. 3:00 Plaza"
                      : "What should people find or do here?"
                }
                className="mt-1.5 w-full resize-none rounded-xl border border-[#3f454c]/15 bg-[#f4f0e8] px-3 py-2.5 text-base text-[#3f454c] outline-none placeholder:text-[#3f454c]/35 focus:border-[#3f454c]/40"
              />
            </label>
          )}

          {isSingleSideburns ? (
            <label className="mt-2 block">
              <span className="text-[10px] uppercase tracking-widest text-foreground/55">
                Description
              </span>
              <textarea
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                disabled={placingMode}
                rows={2}
                placeholder="What should people know?"
                className="mt-1 w-full resize-none rounded-xl border border-[#3f454c]/15 bg-[#f4f0e8] px-3 py-2 text-base text-[#3f454c] outline-none placeholder:text-[#3f454c]/35 focus:border-[#3f454c]/40"
              />
            </label>
          ) : null}

          {isSingleSideburns && !questMode ? (
            <label className="mt-2 block">
              <span className="text-[10px] uppercase tracking-widest text-foreground/55">
                Principle
              </span>
              <select
                value={principle}
                onChange={(e) => {
                  const next = e.target.value;
                  onPrincipleChange(
                    next && isBurningManPrinciple(next) ? next : "",
                  );
                }}
                disabled={placingMode}
                className="mt-1 w-full appearance-none rounded-xl border border-[#3f454c]/15 bg-[#f4f0e8] px-3 py-2 text-base text-[#3f454c] outline-none focus:border-[#3f454c]/40 disabled:opacity-50"
              >
                <option value="">Tag a principle (optional)</option>
                {BURNING_MAN_PRINCIPLES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </>
      )}

      {showQuestBuilder ? null : formError ? (
        <p className="mt-2 text-xs text-[#a83223]">{formError}</p>
      ) : null}

      {showQuestBuilder ? null : (
        <div className="mt-2 flex flex-col gap-1.5">
          {placingMode ? (
            <button
              type="button"
              onClick={onCancelPlacing}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-[#3f454c]/25 bg-[#f4f0e8] px-3 py-2 text-[11px] uppercase tracking-widest text-[#3f454c] hover:border-[#3f454c]/50"
            >
              Cancel placement
            </button>
          ) : questMode && isOpenSidequest ? (
            <button
              type="button"
              onClick={onQuestNext}
              disabled={!canStartQuest}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#c44569] px-3 py-2 text-[11px] uppercase tracking-widest text-[#f4f0e8] hover:opacity-90 disabled:bg-[#3f454c]/25 disabled:text-[#3f454c]/40 disabled:hover:opacity-100"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartPlacing}
              disabled={!canPlace}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-widest hover:opacity-90 disabled:bg-[#3f454c]/25 disabled:text-[#3f454c]/40 disabled:hover:opacity-100"
              style={
                canPlace
                  ? {
                      backgroundColor: isSet
                        ? LAYER_COLOR_SETS
                        : citySelected
                          ? LAYER_COLOR_SERVICES
                          : "#3f454c",
                      color: "#f4f0e8",
                    }
                  : undefined
              }
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {isSet
                ? "Place set on map"
                : citySelected
                  ? "Place city pin on map"
                  : "Place on map"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ExpireScrollColumn({
  values,
  value,
  label,
  disabled,
  onChange,
}: {
  values: readonly number[];
  value: number;
  label: string;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const suppressScrollRef = useRef(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const index = Math.max(0, values.indexOf(value));
    suppressScrollRef.current = true;
    el.scrollTop = index * EXPIRE_PICKER_ITEM_PX;
    const id = window.setTimeout(() => {
      suppressScrollRef.current = false;
    }, 80);
    return () => window.clearTimeout(id);
  }, [value, values]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el || disabled || suppressScrollRef.current) return;
    const index = Math.min(
      values.length - 1,
      Math.max(0, Math.round(el.scrollTop / EXPIRE_PICKER_ITEM_PX)),
    );
    const next = values[index];
    if (next !== value) onChange(next);
  };

  return (
    <div className={`min-w-0 flex-1 ${disabled ? "opacity-35" : ""}`}>
      <p className="mb-1.5 text-center text-[10px] uppercase tracking-widest text-[#3f454c]/45">
        {label}
      </p>
      <div className="relative h-[120px] overflow-hidden rounded-xl bg-[#f4f0e8]">
        <div
          className="pointer-events-none absolute inset-x-2 top-1/2 z-[1] h-10 -translate-y-1/2 rounded-lg border border-[#3f454c]/15 bg-white/55"
          aria-hidden
        />
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto overscroll-contain scroll-smooth scrollbar-none"
          style={{
            touchAction: "pan-y",
            scrollSnapType: "y mandatory",
            paddingTop: EXPIRE_PICKER_ITEM_PX,
            paddingBottom: EXPIRE_PICKER_ITEM_PX,
          }}
          aria-label={label}
          aria-disabled={disabled}
        >
          {values.map((item) => (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => onChange(item)}
              className={`flex w-full items-center justify-center text-lg tabular-nums tracking-wide ${
                item === value
                  ? "font-medium text-[#3f454c]"
                  : "text-[#3f454c]/40"
              }`}
              style={{
                height: EXPIRE_PICKER_ITEM_PX,
                scrollSnapAlign: "center",
              }}
            >
              {item.toString().padStart(2, "0")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpireModal({
  expireMinutes,
  onExpireMinutesChange,
  onActivate,
  onCancel,
}: {
  expireMinutes: number | null;
  onExpireMinutesChange: (minutes: number | null) => void;
  onActivate: () => void;
  onCancel: () => void;
}) {
  const noExpiration = expireMinutes == null;
  const total = expireMinutes ?? 60;
  const hours = Math.min(72, Math.floor(total / 60));
  const minutes = EXPIRE_MINUTE_VALUES.includes(total % 60)
    ? total % 60
    : Math.round((total % 60) / 5) * 5;

  const setDuration = (nextHours: number, nextMinutes: number) => {
    const h = Math.max(0, Math.min(72, nextHours));
    const m = EXPIRE_MINUTE_VALUES.includes(nextMinutes) ? nextMinutes : 0;
    const total = h * 60 + m;
    onExpireMinutesChange(total === 0 ? 5 : total);
  };

  const endsLabel =
    expireMinutes == null
      ? null
      : new Date(Date.now() + expireMinutes * 60 * 1000).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });

  return (
    <div className="absolute inset-0 z-[580] flex items-end justify-center bg-[#17130f]/45 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 backdrop-blur-[2px] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose expiration"
        className="w-full max-w-sm rounded-2xl border border-[#3f454c]/10 bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.28)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#3f454c]/55">
              Expires in
            </p>
            <p className="mt-1 text-[11px] text-[#3f454c]/45">
              {noExpiration
                ? "No expiration"
                : endsLabel
                  ? `Until ${endsLabel}`
                  : null}
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 pt-0.5">
            <span className="text-[10px] uppercase tracking-widest text-[#3f454c]/55">
              No exp.
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={noExpiration}
              aria-label="No expiration"
              onClick={() =>
                onExpireMinutesChange(noExpiration ? hours * 60 + minutes || 60 : null)
              }
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${
                noExpiration ? "bg-[#3f454c]" : "bg-[#3f454c]/20"
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  noExpiration ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>
        </div>

        <div className="mt-4 flex items-start gap-3">
          <ExpireScrollColumn
            label="Hours"
            values={EXPIRE_HOUR_VALUES}
            value={hours}
            disabled={noExpiration}
            onChange={(h) => setDuration(h, minutes)}
          />
          <ExpireScrollColumn
            label="Minutes"
            values={EXPIRE_MINUTE_VALUES}
            value={minutes}
            disabled={noExpiration}
            onChange={(m) => setDuration(hours, m)}
          />
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {EXPIRE_QUICK_HOURS.map((h) => {
            const active = !noExpiration && hours === h && minutes === 0;
            return (
              <button
                key={h}
                type="button"
                onClick={() => onExpireMinutesChange(h * 60)}
                className={`inline-flex min-h-10 min-w-[3.25rem] items-center justify-center rounded-[10px] px-3 text-[11px] uppercase tracking-widest transition-colors ${
                  active
                    ? "bg-[#3f454c] text-[#f4f0e8]"
                    : "bg-[#f4f0e8] text-[#3f454c]/70 hover:text-[#3f454c]"
                }`}
              >
                {h}h
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onActivate}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#3f454c] px-4 text-[11px] uppercase tracking-widest text-[#f4f0e8] hover:opacity-90"
          >
            Activate
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full text-[11px] uppercase tracking-widest text-[#3f454c]/55 hover:text-[#3f454c]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ResourcesPanel({
  beacons,
  categoryId,
  selectedBeaconId,
  nowMs,
  myShareCode,
  shareLocationOn,
  followedCodes,
  friendPresences,
  presenceError,
  onCategoryChange,
  onSelect,
  onRemove,
  allowRemove,
  onShareLocationChange,
  onFollowFriend,
  onUnfollowFriend,
}: {
  beacons: SidequesterBeacon[];
  categoryId: ResourceCategoryId;
  selectedBeaconId: string | null;
  nowMs: number;
  myShareCode: string;
  shareLocationOn: boolean;
  followedCodes: string[];
  friendPresences: PlayaFriendPresence[];
  presenceError: string | null;
  onCategoryChange: (categoryId: ResourceCategoryId) => void;
  onSelect: (beacon: SidequesterBeacon) => void;
  onRemove: (id: string) => void;
  allowRemove: (beacon: SidequesterBeacon) => boolean;
  onShareLocationChange: (enabled: boolean) => void;
  onFollowFriend: (code: string) => void;
  onUnfollowFriend: (code: string) => void;
}) {
  const listed = beaconsInResourceCategory(beacons, categoryId);
  const category = resourceCategoryById(categoryId);

  return (
    <section aria-label="Resources" className="space-y-2.5">
      <div
        className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 scrollbar-none"
        role="listbox"
        aria-label="Resource category"
      >
        {RESOURCE_CATEGORIES.map((item) => {
          const active = item.id === categoryId;
          const count =
            item.id === "party"
              ? null
              : beaconsInResourceCategory(beacons, item.id).length;
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onCategoryChange(item.id)}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[10px] uppercase tracking-widest ${
                active
                  ? "bg-[#3d8fc4] text-[#f4f0e8]"
                  : "bg-[#3f454c]/8 text-[#3f454c]/70"
              }`}
            >
              {item.label}
              {count !== null ? (
                <span className="tabular-nums opacity-70">{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {categoryId === "party" ? (
        <PartyPresencePanel
          myShareCode={myShareCode}
          shareLocationOn={shareLocationOn}
          followedCodes={followedCodes}
          friendPresences={friendPresences}
          presenceError={presenceError}
          onShareLocationChange={onShareLocationChange}
          onFollowFriend={onFollowFriend}
          onUnfollowFriend={onUnfollowFriend}
        />
      ) : listed.length === 0 ? (
        <p className="text-[12px] text-foreground/55">
          {categoryId === "mine"
            ? "Pins you drop land here."
            : `Nothing in ${category?.label ?? "this category"} yet.`}
        </p>
      ) : (
        <ul className="space-y-1">
          {listed.map((beacon) => {
            const meta = beaconKindMeta(beacon.kind);
            const directoryLabel = beaconDirectoryLabel(beacon.kind);
            const isQuest = beacon.kind === "quest";
            const accent = isQuest ? "#c44569" : meta.color;
            const active = beacon.id === selectedBeaconId;
            const remainingLabel = formatBeaconTimeRemaining(
              beacon.expiresAt,
              nowMs,
            );
            const serviceKind = isServiceBeacon(beacon.kind)
              ? (beacon.kind as ServiceLayerKind)
              : null;
            return (
              <li key={beacon.id}>
                <div
                  className={`flex items-center gap-0.5 rounded-lg px-1.5 ${
                    active
                      ? isQuest
                        ? "bg-[#c44569]/12 ring-1 ring-[#c44569]/25"
                        : "bg-white/70 ring-1 ring-[#3f454c]/12"
                      : isQuest
                        ? "bg-[#c44569]/10"
                        : "bg-[#f4f0e8]/40"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(beacon)}
                    className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 py-2 text-left"
                  >
                    {serviceKind ? (
                      <ServiceKindBadge kind={serviceKind} size={32} />
                    ) : isQuest ? (
                      <span
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: accent, color: "#fff0f4" }}
                        aria-hidden
                      >
                        <Star className="h-3.5 w-3.5" strokeWidth={2} />
                      </span>
                    ) : (
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: accent }}
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`flex items-center gap-1.5 text-[10px] uppercase tracking-widest ${
                          isQuest ? "text-[#c44569]" : "text-foreground/50"
                        }`}
                      >
                        {directoryLabel}
                        {beacon.live ? (
                          <span className="text-[#8fb000]">· Live</span>
                        ) : null}
                        {remainingLabel ? (
                          <span className="text-foreground/40">
                            · {remainingLabel}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`mt-0.5 block truncate text-[13px] ${
                          isQuest
                            ? "font-medium text-[#c44569]"
                            : "text-foreground/80"
                        }`}
                      >
                        {beacon.details || directoryLabel}
                      </span>
                    </span>
                  </button>
                  {allowRemove(beacon) ? (
                    <button
                      type="button"
                      aria-label="Remove resource"
                      onClick={() => onRemove(beacon.id)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-[#3f454c]/35"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function DetailPane({
  selectedBeacon,
  selectedProject,
  nowMs,
  completedLocally = false,
  onClear,
  onRemoveBeacon,
  removeLabel = "Remove beacon",
  onToggleComplete,
  onPostUpdate,
  onConfirmLocation,
  beaconStepper = null,
  hideHeader = false,
}: {
  selectedBeacon: SidequesterBeacon | null;
  selectedProject: BurningManProject | null;
  nowMs: number;
  /** This device marked the Sideburns pin complete. */
  completedLocally?: boolean;
  onClear: () => void;
  onRemoveBeacon?: () => void;
  removeLabel?: string;
  onToggleComplete?: () => void;
  onPostUpdate?: (text: string) => void;
  onConfirmLocation?: () => void;
  beaconStepper?: BeaconStepper | null;
  /** The mobile sheet already shows kind + close in its peek row. */
  hideHeader?: boolean;
}) {
  if (selectedBeacon) {
    const meta = beaconKindMeta(selectedBeacon.kind);
    const startsLabel = formatBeaconStartsAt(selectedBeacon.startsAt);
    const remainingLabel = formatBeaconTimeRemaining(
      selectedBeacon.expiresAt,
      nowMs,
    );
    const done = completedLocally || Boolean(selectedBeacon.completedAt);
    const serviceKind = isServiceBeacon(selectedBeacon.kind)
      ? (selectedBeacon.kind as ServiceLayerKind)
      : null;
    const isSet = isSetBeacon(selectedBeacon.kind);
    const place =
      selectedBeacon.details?.trim() &&
      selectedBeacon.details.trim().toLowerCase() !== meta.label.toLowerCase()
        ? selectedBeacon.details.trim()
        : null;
    const updates = selectedBeacon.updates ?? [];
    const bandName = selectedBeacon.details?.trim() || "Live set";
    const setPlace = selectedBeacon.place?.trim() || null;
    const locationConfirmed = isBeaconLocationConfirmed(selectedBeacon);
    const confirmCount = selectedBeacon.locationConfirmations?.length ?? 0;
    const postedAgo = isKindnessBeacon(selectedBeacon.kind)
      ? formatPostedAgo(selectedBeacon.createdAt, nowMs)
      : null;

    return (
      <div className="space-y-2.5">
        {hideHeader ? null : (
          <div className="flex items-start gap-2">
            {beaconStepper ? (
              <BeaconStepControls stepper={beaconStepper} className="-ml-2" />
            ) : null}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {serviceKind ? (
                <ServiceKindBadge kind={serviceKind} size={40} />
              ) : isSet ? (
                <span
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: LAYER_COLOR_SETS }}
                  aria-hidden
                >
                  <Disc3 className="h-4 w-4 text-[#f4f0e8]" strokeWidth={1.75} />
                </span>
              ) : (
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden
                />
              )}
              <div className="min-w-0">
                {serviceKind ? (
                  <>
                    <h3 className="font-display text-xl leading-tight tracking-[0.03em]">
                      {meta.label}
                    </h3>
                    {place ? (
                      <p className="mt-0.5 text-[12px] text-foreground/55">
                        {place}
                      </p>
                    ) : null}
                  </>
                ) : isSet ? (
                  <>
                    <p className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-foreground/55">
                      {selectedBeacon.live ? "Now playing" : "Up next"}
                      {selectedBeacon.live ? (
                        <span className="text-[#c6e85a]">· Live</span>
                      ) : startsLabel ? (
                        <span>· {startsLabel}</span>
                      ) : null}
                      <SetLocationBadge confirmed={locationConfirmed} />
                      {selectedBeacon.id.startsWith("demo-") ? (
                        <span className="text-foreground/40">· Demo</span>
                      ) : null}
                    </p>
                    <h3 className="mt-1 font-display text-xl leading-tight tracking-[0.03em]">
                      {bandName}
                    </h3>
                  </>
                ) : (
                  <>
                    <p className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-foreground/55">
                      {meta.label}
                      {selectedBeacon.live ? (
                        <span className="text-[#b8dc42]">· Live</span>
                      ) : null}
                    </p>
                    <h3 className="mt-1 font-display text-xl leading-tight tracking-[0.03em]">
                      {selectedBeacon.details?.trim() || meta.label}
                    </h3>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear selection"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[#3f454c]/55 hover:text-[#3f454c]"
            >
              <X className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>
        )}

        {postedAgo ? (
          <p className="text-[10px] uppercase tracking-widest tabular-nums text-foreground/45">
            {postedAgo}
          </p>
        ) : null}

        {isSet ? (
          <>
            {selectedBeacon.imageUrl ? (
              <div className="aspect-[16/10] overflow-hidden rounded-xl bg-[#17130f]/10">
                <img
                  src={selectedBeacon.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
            {hideHeader ? (
              <div>
                <p className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-foreground/50">
                  {selectedBeacon.live ? "Now playing" : "Up next"}
                  {selectedBeacon.live ? (
                    <span className="text-[#c6e85a]">· Live</span>
                  ) : startsLabel ? (
                    <span>· {startsLabel}</span>
                  ) : null}
                  <SetLocationBadge confirmed={locationConfirmed} />
                  {selectedBeacon.id.startsWith("demo-") ? (
                    <span className="text-foreground/40">· Demo</span>
                  ) : null}
                </p>
                <h3 className="font-display text-2xl leading-tight tracking-[0.03em]">
                  {bandName}
                </h3>
                {setPlace ? (
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] text-foreground/60">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {setPlace}
                  </p>
                ) : null}
              </div>
            ) : setPlace ? (
              <p className="flex items-center gap-1.5 text-[12px] text-foreground/60">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {setPlace}
              </p>
            ) : null}
            {onConfirmLocation ? (
              <button
                type="button"
                onClick={onConfirmLocation}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#3f454c]/20 bg-[#f4f0e8] px-3 py-2 text-[11px] uppercase tracking-widest text-[#3f454c] hover:border-[#3f454c]/40"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                Confirm location
              </button>
            ) : locationConfirmed ? (
              <p className="text-[10px] uppercase tracking-widest tabular-nums text-[#3f7a3f]/80">
                Location confirmed
                {confirmCount > 1 ? ` · ${confirmCount} checks` : ""}
              </p>
            ) : (
              <p className="text-[10px] uppercase tracking-widest text-foreground/45">
                Waiting for someone else to confirm
              </p>
            )}
            <ServiceUpdateTimeline
              updates={updates}
              onPostUpdate={onPostUpdate}
            />
          </>
        ) : serviceKind ? (
          <ServiceUpdateTimeline
            updates={updates}
            onPostUpdate={onPostUpdate}
          />
        ) : (
          <>
            {(selectedBeacon.description ||
              selectedBeacon.sponsor ||
              selectedBeacon.principle ||
              startsLabel ||
              remainingLabel) && (
              <div className="space-y-1">
                {selectedBeacon.description ? (
                  <p className="text-sm leading-relaxed text-foreground/75">
                    {selectedBeacon.description}
                  </p>
                ) : null}
                {selectedBeacon.sponsor ? (
                  <p className="text-[11px] uppercase tracking-widest text-foreground/55">
                    Presented by · {selectedBeacon.sponsor}
                  </p>
                ) : null}
                {selectedBeacon.principle ? (
                  <p className="text-[11px] uppercase tracking-widest text-foreground/55">
                    Principle · {selectedBeacon.principle}
                  </p>
                ) : null}
                {startsLabel ? (
                  <p className="text-[11px] uppercase tracking-widest text-foreground/55">
                    Starts · {startsLabel}
                  </p>
                ) : null}
                {remainingLabel ? (
                  <p className="text-[11px] uppercase tracking-widest text-foreground/55">
                    Timeout · {remainingLabel}
                  </p>
                ) : null}
              </div>
            )}
            {selectedBeacon.reward ? (
              <p className="border-l-2 border-[#b8dc42] pl-3 text-sm leading-relaxed text-foreground/70">
                Reward · {selectedBeacon.reward}
              </p>
            ) : null}

            {onToggleComplete ? (
              <div className="space-y-2 border-t border-[#3f454c]/10 pt-4">
                <button
                  type="button"
                  onClick={onToggleComplete}
                  aria-pressed={done}
                  className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-widest transition-colors ${
                    done
                      ? "border border-[#3f7a3f]/40 bg-[#f4f0e8] text-[#3f7a3f]"
                      : "bg-[#3f454c] text-[#f4f0e8] hover:opacity-90"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {done ? "Completed — undo" : "Mark complete"}
                </button>
                <p className="text-[10px] uppercase tracking-widest tabular-nums text-foreground/45">
                  {selectedBeacon.completions ?? 0} finishes
                </p>
              </div>
            ) : null}
          </>
        )}

        {onRemoveBeacon ? (
          <button
            type="button"
            onClick={onRemoveBeacon}
            className="inline-flex min-h-11 items-center gap-2 text-[11px] uppercase tracking-widest text-foreground/55 underline-offset-4 hover:text-foreground hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" /> {removeLabel}
          </button>
        ) : null}
      </div>
    );
  }

  if (!selectedProject) return null;

  return (
    <div className="space-y-4">
      {hideHeader ? null : (
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 font-display text-xl leading-tight tracking-[0.03em]">
            {selectedProject.title}
          </h3>
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[#3f454c]/55 hover:text-[#3f454c]"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
      )}

      {selectedProject.hero_image_url ? (
        <div className="aspect-[16/10] overflow-hidden rounded-xl">
          <img
            src={selectedProject.hero_image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}

      <p className="text-[10px] uppercase tracking-widest text-foreground/50">
        {selectedProject.event_year} · {formatPlacementLabel(selectedProject)}
      </p>

      {selectedProject.artist_name_raw ? (
        <p className="text-sm text-foreground/70">{selectedProject.artist_name_raw}</p>
      ) : null}
    </div>
  );
}
