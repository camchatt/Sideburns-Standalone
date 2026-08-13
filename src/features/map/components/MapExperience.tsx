import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppServices } from "@/app/providers";
import { useLocalIdentity } from "@/features/identity/hooks/useLocalIdentity";
import { LocationPrivacyNote } from "@/features/location/components/LocationPrivacyNote";
import { useForegroundLocation } from "@/features/location/hooks/useForegroundLocation";
import { isReadingUsableForProximity } from "@/features/location/utils/locationState";
import { distanceMeters } from "@/features/location/utils/distance";
import { MapRecordDetail } from "@/features/map/components/MapRecordDetail";
import { coordinatesInTestArea, getTestArea, TEST_AREAS, type TestAreaId } from "@/features/map/config/testAreas";
import { PlayaMap } from "@/features/map/components/PlayaMap";
import {
  loadMapRecordsWithLocalSidequests,
  type LoadedMapWithLocal,
} from "@/features/map/services/loadMapRecordsWithLocalSidequests";
import type { MapDataHandle } from "@/features/map/types/map";
import type { PlayaMapRecord } from "@/features/map/types/mapRecord";
import {
  countByCategory,
  countByKind,
  countByMarkerKind,
  DEFAULT_MAP_LAYERS,
  filterMapRecords,
  type MapLayerVisibility,
} from "@/features/map/utils/mapRecordFilters";
import {
  beaconKindLabel,
  CREATABLE_BEACON_KINDS,
  type CreatableBeaconKind,
} from "@/features/map/utils/beaconKinds";
import {
  ART_MARKER_COLOR,
  BEACON_MARKER_COLORS,
  markerColorForRecord,
  SIDEBURN_MARKER_COLOR,
} from "@/features/map/utils/markerStyle";
import type { QuestCategory } from "@/features/sidequests/types/sidequest";
import type { SidequestProgress } from "@/features/sidequests/types/sidequest";
import { presentedByLabel, shouldShowPostAge } from "@/features/sidequests/utils/ownership";
import { formatPostAge } from "@/features/sidequests/utils/postAge";
import { formatDistanceMeters } from "@/features/sidequests/utils/nearbySidequests";
import { buildHandle, fallbackDescriptor, vectorFallbackResource } from "@/features/map/services/mapSessionHelpers";
import { deriveMapRecordTrackingState, type MapRecordTrackingState } from "@/features/map/utils/mapRecordTrackingState";
import { cn } from "@/lib/utils";
import { OfflineMapOnboardingCard } from "@/features/playa-pack/components/OfflineMapOnboardingCard";

const LAYER_DOT = {
  projects: ART_MARKER_COLOR,
  sideburns: SIDEBURN_MARKER_COLOR,
  services: BEACON_MARKER_COLORS.medical,
} as const;
type LayerMenuId = keyof typeof LAYER_DOT;

type SheetMode = "peek" | "browse" | "detail";
type BeaconDraft = {
  kind: CreatableBeaconKind;
  details: string;
  presenter: string;
  reward: string;
  livePin: boolean;
  location: { latitude: number; longitude: number } | null;
};
const EMPTY_BEACON_DRAFT: BeaconDraft = {
  kind: "sideburn",
  details: "",
  presenter: "",
  reward: "",
  livePin: false,
  location: null,
};

export function MapExperience() {
  const { map, mapRecords, data, questCompletions, config, location, syncService, sidequestLifecycle } = useAppServices();
  const { identity, requireDisplayName } = useLocalIdentity();
  const locationSession = useForegroundLocation();
  const [params, setParams] = useSearchParams();
  const activeArea = getTestArea(params.get("area"));
  const [loaded, setLoaded] = useState<LoadedMapWithLocal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [followUser, setFollowUser] = useState(false);
  const [completionCount, setCompletionCount] = useState(0);
  const [progressRows, setProgressRows] = useState<SidequestProgress[]>([]);
  const [mapSession, setMapSession] = useState<MapDataHandle | null>(null);
  const [mapRevision, setMapRevision] = useState(0);
  const [layers, setLayers] = useState<MapLayerVisibility>(DEFAULT_MAP_LAYERS);
  const [activeCategories, setActiveCategories] = useState<Set<QuestCategory> | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode>("peek");
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [creationOpen, setCreationOpen] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  const [beaconDraft, setBeaconDraft] = useState<BeaconDraft>(EMPTY_BEACON_DRAFT);
  const [createError, setCreateError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const livePinUpdateAt = useRef(0);

  useEffect(() => {
    let active = true;
    void Promise.all([questCompletions.list(), sidequestLifecycle.listProgress()]).then(
      ([completions, progress]) => {
        if (!active) return;
        setCompletionCount(completions.length);
        setProgressRows(progress);
      },
    );
    return () => {
      active = false;
    };
  }, [questCompletions, sidequestLifecycle, catalogRevision]);

  useEffect(() => { void mapRecords.interactions.listDismissed().then((ids) => setDismissedIds(new Set(ids))); }, [mapRecords.interactions, catalogRevision]);

  const refreshCompletionCount = () => {
    void Promise.all([questCompletions.list(), sidequestLifecycle.listProgress()]).then(
      ([completions, progress]) => {
        setCompletionCount(completions.length);
        setProgressRows(progress);
      },
    );
  };

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void map
      .resolveSession({ online, area: activeArea.id })
      .then((session) => {
        if (active) setMapSession(session);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setMapSession(
          buildHandle({
            descriptor: fallbackDescriptor("corrupted_pack"),
            status: "corrupted_pack",
            mode: "vector_fallback",
            resource: vectorFallbackResource("corrupted_pack"),
            message: reason instanceof Error ? reason.message : "Unable to resolve map basemap",
          }),
        );
      });
    return () => {
      active = false;
    };
  }, [map, online, activeArea.id, mapRevision]);

  useEffect(() => {
    let active = true;
    void loadMapRecordsWithLocalSidequests({
      primary: mapRecords.primary,
      sample: mapRecords.sample,
      cache: mapRecords.cache,
      listLocalSidequests: () => data.sidequests.getAll(),
    })
      .then((result) => {
        if (active) setLoaded(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load map records");
      });
    return () => {
      active = false;
    };
  }, [mapRecords, data.sidequests, catalogRevision]);

  useEffect(() => {
    if (!data.remoteSyncEnabled || !online) return;
    const timer = window.setInterval(() => setCatalogRevision((value) => value + 1), 10_000);
    return () => window.clearInterval(timer);
  }, [data.remoteSyncEnabled, online]);

  useEffect(() => {
    const coordinates = locationSession.reading?.coordinates;
    if (!coordinates || !isReadingUsableForProximity(locationSession.reading)) return;
    const now = Date.now();
    if (now - livePinUpdateAt.current < 10_000) return;
    const liveRecords = (loaded?.records ?? []).filter((record) => record.origin === "local" && record.livePin && record.testAreaId === activeArea.id && distanceMeters(record.location, coordinates) > 8);
    if (!liveRecords.length) return;
    livePinUpdateAt.current = now;
    void Promise.all(liveRecords.map((record) => data.sidequests.update(record.id, { location: coordinates }))).then(() => {
      void syncService.drain();
      setCatalogRevision((value) => value + 1);
    });
  }, [locationSession.reading, loaded, activeArea.id, data.sidequests, syncService]);

  const areaRecords = useMemo(
    () => (loaded?.records ?? []).filter((record) => !dismissedIds.has(record.id) && coordinatesInTestArea(record.location, activeArea)),
    [loaded, activeArea, dismissedIds],
  );
  const ownedRecords = useMemo(
    () => (loaded?.records ?? []).filter((record) => Boolean(identity?.id) && record.creatorId === identity?.id),
    [loaded, identity?.id],
  );
  const years = useMemo(
    () => Array.from(new Set(areaRecords.map((r) => r.eventYear))).sort((a, b) => b - a),
    [areaRecords],
  );
  // Prefer 2025 when present (Projects / art inventory is year-scoped to 2025).
  const activeYear =
    Number(params.get("year")) || (years.includes(2025) ? 2025 : years[0]) || null;

  const filtered = useMemo(
    () =>
      filterMapRecords({
        records: areaRecords,
        query,
        year: activeYear,
        categories: activeCategories,
        layers,
      }),
    [areaRecords, query, activeYear, activeCategories, layers],
  );

  const mapped = useMemo(() => filtered.filter((r) => r.placementKind === "exact"), [filtered]);
  const approximate = useMemo(() => filtered.filter((r) => r.placementKind === "approximate"), [filtered]);
  const yearRecords = useMemo(
    () => areaRecords.filter((record) => !activeYear || record.eventYear === activeYear),
    [areaRecords, activeYear],
  );
  const kindCounts = useMemo(() => countByKind(yearRecords), [yearRecords]);
  const categoryCounts = useMemo(() => countByCategory(yearRecords.filter((record) => record.recordKind === "sidequest")), [yearRecords]);
  const markerCounts = useMemo(
    () => countByMarkerKind(yearRecords),
    [yearRecords],
  );
  const yearCounts = useMemo(
    () => new Map(years.map((year) => [year, areaRecords.filter((record) => record.eventYear === year).length])),
    [areaRecords, years],
  );
  const livePinCount = useMemo(
    () => yearRecords.filter((record) => record.livePin).length,
    [yearRecords],
  );
  const selected =
    filtered.find((record) => record.slug === params.get("record") || record.id === params.get("record")) ??
    null;

  useEffect(() => {
    if (selected) setSheetMode("detail");
  }, [selected]);

  const distances = useMemo(() => {
    const map = new Map<string, number>();
    const coords = locationSession.reading?.coordinates;
    if (!locationSession.optedIn || !isReadingUsableForProximity(locationSession.reading) || !coords) {
      return map;
    }
    for (const record of filtered) {
      if (record.placementKind !== "exact") continue;
      map.set(record.id, distanceMeters(coords, record.location));
    }
    return map;
  }, [filtered, locationSession.optedIn, locationSession.reading]);

  const trackingById = useMemo(() => {
    const progressBySidequest = new Map(progressRows.map((row) => [row.sidequestId, row]));
    const map = new Map<string, MapRecordTrackingState>();
    for (const record of filtered) {
      if (record.recordKind !== "sidequest") continue;
      const phase = progressBySidequest.get(record.id)?.phase ?? null;
      const distance = distances.get(record.id);
      const inRange = distance != null && distance <= record.radiusMeters;
      map.set(record.id, deriveMapRecordTrackingState({ phase, inRange }));
    }
    return map;
  }, [filtered, progressRows, distances]);

  const selectRecord = (record: PlayaMapRecord) => {
    setFollowUser(false);
    const next = new URLSearchParams(params);
    next.set("record", record.slug);
    if (activeYear) next.set("year", String(activeYear));
    setParams(next, { replace: true });
    setSheetMode("detail");
  };

  const clearSelection = () => {
    const next = new URLSearchParams(params);
    next.delete("record");
    setParams(next, { replace: true });
    setSheetMode("browse");
  };
  const handleRecordDeleted = () => {
    clearSelection();
    setCatalogRevision((value) => value + 1);
  };
  const placeBeacon = (coordinates: { latitude: number; longitude: number }) => {
    setBeaconDraft((draft) => ({ ...draft, location: coordinates }));
    setPlacementMode(false);
    setCreationOpen(true);
    setSheetMode("browse");
  };
  const saveBeacon = async () => {
    setCreateError(null);
    const coordinates = beaconDraft.livePin && locationSession.reading?.coordinates
      ? locationSession.reading.coordinates
      : beaconDraft.location;
    if (!coordinates) { setCreateError("Place the beacon on the map or enable a live location first."); return; }
    try {
      const identity = await requireDisplayName(
        "Choose a burner name before creating a beacon. No email or password required.",
      );
      if (!identity) return;
      const created = await data.sidequests.create({
        title: beaconKindLabel(beaconDraft.kind),
        description: beaconDraft.details.trim(),
        location: coordinates,
        radiusMeters: 30,
        category: beaconDraft.kind === "sideburn" ? "explore" : "service",
        availability: "always",
        difficulty: "easy",
        beaconKind: beaconDraft.kind === "sideburn" ? null : beaconDraft.kind,
        presenter: beaconDraft.presenter.trim() || identity.displayName,
        reward: beaconDraft.reward.trim() || null,
        livePin: beaconDraft.livePin,
        testAreaId: activeArea.id,
        creatorId: identity.id,
        creatorDisplayName: identity.displayName,
        contentOrigin: "user",
      });
      await syncService.drain();
      setCatalogRevision((value) => value + 1);
      setBeaconDraft(EMPTY_BEACON_DRAFT);
      setCreationOpen(false);
      const next = new URLSearchParams(params);
      next.set("record", created.id); next.set("area", activeArea.id); next.set("year", String(new Date().getUTCFullYear()));
      setParams(next, { replace: true });
    } catch (reason: unknown) { setCreateError(reason instanceof Error ? reason.message : "Unable to save beacon"); }
  };

  const selectYear = (year: number) => {
    const next = new URLSearchParams(params);
    next.set("year", String(year));
    next.delete("record");
    setParams(next, { replace: true });
  };
  const selectArea = (areaId: TestAreaId) => {
    const next = new URLSearchParams(params);
    next.set("area", areaId);
    next.delete("record");
    next.delete("year");
    setParams(next, { replace: true });
    setFollowUser(false);
    setSheetMode("peek");
    if (areaId === "winthrop") {
      location.setSimulatedLocation(null);
      if (locationSession.optedIn) locationSession.retry();
    }
  };
  const simulateBlackRockCity = () => {
    location.setSimulatedLocation(getTestArea("black-rock-city").center);
    locationSession.enable();
    setFollowUser(true);
  };

  const handleFollowUserChange = (follow: boolean) => {
    if (follow && !locationSession.optedIn) {
      locationSession.enable();
    }
    setFollowUser(follow);
  };

  const toggleCategory = (category: QuestCategory) => {
    setActiveCategories((prev) => {
      if (!prev) return new Set([category]);
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next.size === 0 ? null : next;
    });
  };
  const sheetExpanded = sheetMode !== "peek";
  const detailOpen = Boolean(selected && sheetMode === "detail");
  const sheetBottomPadding = detailOpen ? 320 : sheetMode === "browse" ? 280 : 160;

  return (
    <section
      className="relative h-[calc(100svh-var(--map-chrome-offset,7.5rem))] min-h-[28rem] bg-[#f8f5ee] text-[#17130f]"
      data-testid="map-experience"
    >
      <div className={cn("absolute inset-0 lg:left-[21rem]", detailOpen && "lg:right-[min(24rem,32vw)]")}>
        {mapSession ? (
          <PlayaMap
            records={filtered}
            selected={selected}
            onSelect={selectRecord}
            mapSession={mapSession}
            userLocation={locationSession.optedIn ? locationSession.reading : null}
            locationState={locationSession.optedIn ? locationSession.state : "prompt_required"}
            followUser={followUser}
            onFollowUserChange={handleFollowUserChange}
            onRetryLocation={locationSession.retry}
            activeArea={activeArea}
            placementMode={placementMode}
            onPlace={placeBeacon}
            sheetBottomPadding={sheetBottomPadding}
            eventYear={activeYear}
            trackingById={trackingById}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[#ebe4d8] text-sm text-[#17130f]/70">
            Loading basemap…
          </div>
        )}
      </div>

      {activeArea.id === "black-rock-city" ? (
        <OfflineMapOnboardingCard playaPacks={data.playaPacks} online={online} onActivated={() => setMapRevision((value) => value + 1)} />
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[600] p-3 lg:left-[21rem]">
        <div className="pointer-events-auto flex max-w-xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 border border-[#17130f]/15 bg-[#f8f5ee]/92 p-2 backdrop-blur-md">
            {config.env.VITE_ENABLE_PROTOTYPE_CONTROLS ? (
              <label className="sr-only" htmlFor="map-test-area">Test area</label>
            ) : null}
            {config.env.VITE_ENABLE_PROTOTYPE_CONTROLS ? (
              <select id="map-test-area" aria-label="Test area" value={activeArea.id} onChange={(event) => selectArea(event.target.value as TestAreaId)} className="min-h-10 border border-[#17130f]/25 bg-[#f8f5ee] px-2 text-xs">
                {TEST_AREAS.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
              </select>
            ) : null}
            <input
              aria-label="Search map"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search art or sideburns"
              className="min-h-10 min-w-[10rem] flex-1 border border-[#17130f]/25 bg-white/50 px-3 text-sm placeholder:text-[#17130f]/45"
            />
            {years.map((year) => (
              <button
                key={year}
                type="button"
                aria-pressed={year === activeYear}
                onClick={() => selectYear(year)}
                className={cn(
                  "min-h-10 border px-3 text-xs",
                  year === activeYear ? "border-[#17130f] bg-[#17130f] text-[#f8f5ee]" : "border-[#17130f]/25",
                )}
              >
                {year} · {yearCounts.get(year) ?? 0}
              </button>
            ))}
            <span className="rounded border border-[#17130f]/20 px-2 py-1 text-[10px] uppercase tracking-widest text-[#17130f]/70">
              {completionCount} done
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {config.env.VITE_ENABLE_PROTOTYPE_CONTROLS && activeArea.id === "black-rock-city" && locationSession.state !== "simulated" ? (
              <button type="button" onClick={simulateBlackRockCity} className="min-h-9 border border-[#17130f]/30 bg-[#f8f5ee]/90 px-3 text-xs">Simulate BRC</button>
            ) : null}
            {!locationSession.optedIn ? (
              <button
                type="button"
                className="min-h-9 border border-[#17130f]/30 bg-[#f8f5ee]/90 px-3 text-xs backdrop-blur-md"
                onClick={() => locationSession.enable()}
                data-testid="map-enable-location"
              >
                Enable location
              </button>
            ) : (
              <button
                type="button"
                className="min-h-9 border border-[#17130f]/30 bg-[#f8f5ee]/90 px-3 text-xs backdrop-blur-md"
                onClick={() => {
                  setFollowUser(false);
                  locationSession.disable();
                }}
              >
                Stop location
              </button>
            )}
            <span className="bg-[#f8f5ee]/85 px-2 py-1 text-[11px] text-[#17130f]/65 backdrop-blur-md">
              {locationSession.stateLabel}
              {loaded ? ` · ${mapped.length} mapped / ${approximate.length} approx` : " · Loading locations"}
            </span>
          </div>
        </div>
      </div>

      <aside
        className={cn(
          "absolute inset-x-0 bottom-0 z-[610] flex flex-col border-t border-[#17130f]/10 bg-[#f8f5ee]/95 text-[#17130f] shadow-[0_-10px_30px_rgba(23,19,15,0.12)] backdrop-blur-md transition-[height] duration-200 ease-out motion-reduce:transition-none lg:inset-y-0 lg:left-0 lg:right-auto lg:h-full lg:w-[21rem] lg:border-r lg:border-t-0 lg:border-[#17130f]/15 lg:bg-[#f8f5ee]/97 lg:shadow-[10px_0_30px_rgba(23,19,15,0.08)]",
          sheetMode === "peek" && "h-[9.5rem]",
          sheetMode === "browse" && "h-[min(52%,28rem)]",
          sheetMode === "detail" && "h-[min(72%,36rem)]",
        )}
        aria-label="Map panel"
        data-testid="map-sheet"
      >
        <div className="flex shrink-0 items-center justify-center pt-2 lg:hidden">
          <button
            type="button"
            className="flex h-8 w-full items-center justify-center"
            aria-label={sheetExpanded ? "Collapse panel" : "Expand panel"}
            onClick={() => setSheetMode((mode) => (mode === "peek" ? "browse" : mode === "detail" ? "detail" : "peek"))}
            data-testid="map-sheet-toggle"
          >
            <span className="h-1 w-10 rounded-full bg-[#17130f]/25" />
          </button>
        </div>

        <div className="hidden shrink-0 border-b border-[#17130f]/10 px-5 pb-5 pt-5 lg:block">
          <p className="text-[10px] uppercase tracking-[.2em] text-[#17130f]/50">Collection</p>
          <h1 className="mt-2 font-display text-3xl tracking-wider">SIDEBURN</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#17130f]/65">
            Discover playa art, take on sideburns, and keep your field log available offline.
          </p>
        </div>

        <div className={cn(
          "flex shrink-0 items-center gap-2 px-4 pb-2 lg:order-last lg:border-t lg:border-[#17130f]/10 lg:px-5 lg:py-4",
          detailOpen && "max-lg:hidden",
        )}>
          <button
            type="button"
            onClick={() => { setCreationOpen((open) => !open); setSheetMode("browse"); setPlacementMode(false); }}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-[#17130f] bg-[#17130f] px-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#f8f5ee]"
            data-testid="map-add-sidequest"
          >
            <span aria-hidden>+</span>
            Add a beacon
          </button>
          <p className="shrink-0 text-[10px] uppercase tracking-widest text-[#17130f]/55">
            {filtered.length} pins
            {livePinCount ? ` · ${livePinCount} live` : ""}
          </p>
        </div>

        <div className="hidden min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:block">
          {creationOpen ? (
            <InlineBeaconForm draft={beaconDraft} setDraft={setBeaconDraft} error={createError} onPlace={() => setPlacementMode(true)} onSave={() => void saveBeacon()} onCancel={() => { setCreationOpen(false); setPlacementMode(false); }} onUseLocation={() => { if (!locationSession.optedIn) locationSession.enable(); const coordinates = locationSession.reading?.coordinates; if (coordinates) setBeaconDraft((draft) => ({ ...draft, location: coordinates })); }} />
          ) : (
            <MapBrowsePanel
              layers={layers}
              setLayers={setLayers}
              kindCounts={kindCounts}
              categoryCounts={categoryCounts}
              markerCounts={markerCounts}
              activeCategories={activeCategories}
              toggleCategory={toggleCategory}
              clearCategories={() => setActiveCategories(null)}
              completionCount={completionCount}
              mapped={mapped}
              approximate={approximate}
              distances={distances}
              selectRecord={selectRecord}
              warning={loaded?.warning ?? null}
              error={error}
              ownedRecords={ownedRecords}
              hiddenIds={dismissedIds}
              progressRows={progressRows}
              onToggleHidden={async (record) => { await mapRecords.interactions.toggleDismissed(record.id); setCatalogRevision((value) => value + 1); }}
              onDelete={async (record) => { await data.sidequests.delete(record.id); setCatalogRevision((value) => value + 1); }}
              onComplete={async (record) => { await sidequestLifecycle.complete({ sidequestId: record.id, reading: locationSession.reading }); refreshCompletionCount(); }}
            />
          )}
        </div>

        <div className="contents lg:hidden">
        {sheetMode === "peek" ? (
          <p className="px-4 pb-3 text-xs text-[#17130f]/60">
            Tap markers for details. Expand for filters and lists.
            {mapSession ? ` Basemap: ${mapSession.status.replace(/_/g, " ")}.` : null}
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {creationOpen ? (
              <InlineBeaconForm draft={beaconDraft} setDraft={setBeaconDraft} error={createError} onPlace={() => setPlacementMode(true)} onSave={() => void saveBeacon()} onCancel={() => { setCreationOpen(false); setPlacementMode(false); }} onUseLocation={() => { if (!locationSession.optedIn) locationSession.enable(); const coordinates = locationSession.reading?.coordinates; if (coordinates) setBeaconDraft((draft) => ({ ...draft, location: coordinates })); }} />
            ) : selected && sheetMode === "detail" ? (
              <MapRecordDetail
                record={selected}
                compact={false}
                onClose={clearSelection}
                onCompletionChange={refreshCompletionCount}
                onDeleted={handleRecordDeleted}
              />
            ) : (
              <MapBrowsePanel
                layers={layers}
                setLayers={setLayers}
                kindCounts={kindCounts}
                categoryCounts={categoryCounts}
                activeCategories={activeCategories}
                markerCounts={markerCounts}
                toggleCategory={toggleCategory}
                clearCategories={() => setActiveCategories(null)}
                completionCount={completionCount}
                mapped={mapped}
                approximate={approximate}
                distances={distances}
                selectRecord={selectRecord}
                warning={loaded?.warning ?? null}
                error={error}
                ownedRecords={ownedRecords}
                hiddenIds={dismissedIds}
                progressRows={progressRows}
                onToggleHidden={async (record) => { await mapRecords.interactions.toggleDismissed(record.id); setCatalogRevision((value) => value + 1); }}
                onDelete={async (record) => { await data.sidequests.delete(record.id); setCatalogRevision((value) => value + 1); }}
                onComplete={async (record) => { await sidequestLifecycle.complete({ sidequestId: record.id, reading: locationSession.reading }); refreshCompletionCount(); }}
              />
            )}
          </div>
        )}
        </div>
      </aside>
      {selected ? (
        <aside
          className="absolute inset-y-4 right-4 z-[615] hidden w-[min(24rem,32vw)] overflow-y-auto border border-[#17130f]/10 bg-[#f8f5ee] p-5 text-[#17130f] shadow-xl lg:block"
          aria-label="Selection details"
          data-testid="map-desktop-detail"
        >
          <MapRecordDetail
            record={selected}
            onClose={clearSelection}
            onCompletionChange={refreshCompletionCount}
            onDeleted={handleRecordDeleted}
          />
        </aside>
      ) : null}
    </section>
  );
}

function InlineBeaconForm({ draft, setDraft, error, onPlace, onSave, onCancel, onUseLocation }: {
  draft: BeaconDraft;
  setDraft: Dispatch<SetStateAction<BeaconDraft>>;
  error: string | null;
  onPlace: () => void;
  onSave: () => void;
  onCancel: () => void;
  onUseLocation: () => void;
}) {
  return (
    <section aria-label="Add a beacon" className="space-y-3 border border-[#17130f]/15 p-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Add a beacon</h2>
        <button type="button" onClick={onCancel} className="text-xs uppercase tracking-widest">Collapse</button>
      </div>
      <label className="block text-[10px] uppercase tracking-widest text-[#17130f]/60">
        Type
        <select
          aria-label="Type"
          value={draft.kind}
          onChange={(event) => setDraft((value) => ({ ...value, kind: event.target.value as CreatableBeaconKind }))}
          className="mt-1 min-h-11 w-full border border-[#17130f]/25 bg-[#f8f5ee] px-3 text-sm normal-case"
        >
          {CREATABLE_BEACON_KINDS.map((kind) => (
            <option key={kind} value={kind}>{beaconKindLabel(kind)}</option>
          ))}
        </select>
      </label>
      <label className="flex min-h-11 items-center justify-between border border-[#17130f]/15 px-3 text-xs uppercase tracking-widest">
        Live pin
        <input
          type="checkbox"
          checked={draft.livePin}
          onChange={(event) => setDraft((value) => ({ ...value, livePin: event.target.checked }))}
        />
      </label>
      <label className="block text-[10px] uppercase tracking-widest text-[#17130f]/60">
        Details
        <textarea
          aria-label="Details"
          required
          value={draft.details}
          onChange={(event) => setDraft((value) => ({ ...value, details: event.target.value }))}
          placeholder="What should people find or do here?"
          className="mt-1 min-h-24 w-full border border-[#17130f]/25 bg-transparent p-3 text-sm normal-case"
        />
      </label>
      <label className="block text-[10px] uppercase tracking-widest text-[#17130f]/60">
        Presented by (optional)
        <input
          aria-label="Presented by (optional)"
          value={draft.presenter}
          onChange={(event) => setDraft((value) => ({ ...value, presenter: event.target.value }))}
          className="mt-1 min-h-11 w-full border border-[#17130f]/25 bg-transparent px-3 text-sm normal-case"
        />
      </label>
      <label className="block text-[10px] uppercase tracking-widest text-[#17130f]/60">
        Reward (optional)
        <input
          aria-label="Reward (optional)"
          value={draft.reward}
          onChange={(event) => setDraft((value) => ({ ...value, reward: event.target.value }))}
          className="mt-1 min-h-11 w-full border border-[#17130f]/25 bg-transparent px-3 text-sm normal-case"
        />
      </label>
      <p className="text-xs text-[#17130f]/65">
        {draft.location
          ? `${draft.location.latitude.toFixed(5)}, ${draft.location.longitude.toFixed(5)}`
          : "No location selected"}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onPlace} className="min-h-11 border border-[#17130f] px-3 text-xs uppercase tracking-widest">
          Place on map
        </button>
        <button type="button" onClick={onUseLocation} className="min-h-11 border border-[#17130f]/35 px-3 text-xs uppercase tracking-widest">
          Use my location
        </button>
      </div>
      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
      <button
        type="button"
        disabled={!draft.details.trim()}
        onClick={onSave}
        className="min-h-11 w-full bg-[#17130f] px-3 text-xs font-semibold uppercase tracking-widest text-[#f8f5ee] disabled:opacity-40"
      >
        Save beacon
      </button>
    </section>
  );
}

function MapBrowsePanel({
  layers,
  setLayers,
  kindCounts,
  categoryCounts,
  markerCounts,
  activeCategories,
  toggleCategory,
  clearCategories,
  completionCount,
  mapped,
  approximate,
  distances,
  selectRecord,
  warning,
  error,
  ownedRecords,
  hiddenIds,
  progressRows,
  onToggleHidden,
  onDelete,
  onComplete,
}: {
  layers: MapLayerVisibility;
  setLayers: Dispatch<SetStateAction<MapLayerVisibility>>;
  kindCounts: ReturnType<typeof countByKind>;
  categoryCounts: ReturnType<typeof countByCategory>;
  markerCounts: ReturnType<typeof countByMarkerKind>;
  activeCategories: Set<QuestCategory> | null;
  toggleCategory: (category: QuestCategory) => void;
  clearCategories: () => void;
  completionCount: number;
  mapped: PlayaMapRecord[];
  approximate: PlayaMapRecord[];
  distances: Map<string, number>;
  selectRecord: (record: PlayaMapRecord) => void;
  warning: string | null;
  error: string | null;
  ownedRecords: PlayaMapRecord[];
  hiddenIds: ReadonlySet<string>;
  progressRows: SidequestProgress[];
  onToggleHidden: (record: PlayaMapRecord) => Promise<void>;
  onDelete: (record: PlayaMapRecord) => Promise<void>;
  onComplete: (record: PlayaMapRecord) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<Set<LayerMenuId>>(() => new Set());
  const toggleExpanded = (id: LayerMenuId) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sideburnFilters: LayerFilterItem[] = [
    { id: "sideburn", label: "Sideburns", color: SIDEBURN_MARKER_COLOR, count: layers.sidequests ? kindCounts.sidequest : 0, active: layers.sidequests, onToggle: () => setLayers((p) => ({ ...p, sidequests: !p.sidequests })) },
    { id: "food", label: "Food", color: BEACON_MARKER_COLORS.food, count: layers.food ? markerCounts.food : 0, active: layers.food, onToggle: () => setLayers((p) => ({ ...p, food: !p.food })) },
    { id: "get_weird", label: "Get Weird", color: BEACON_MARKER_COLORS.get_weird, count: layers.getWeird ? markerCounts.get_weird : 0, active: layers.getWeird, onToggle: () => setLayers((p) => ({ ...p, getWeird: !p.getWeird })) },
    { id: "do_good", label: "Do Good", color: BEACON_MARKER_COLORS.do_good, count: layers.doGood ? markerCounts.do_good : 0, active: layers.doGood, onToggle: () => setLayers((p) => ({ ...p, doGood: !p.doGood })) },
  ];
  const serviceFilters: LayerFilterItem[] = [
    { id: "medical", label: "Med Tent", color: BEACON_MARKER_COLORS.medical, count: layers.medical ? markerCounts.medical : 0, active: layers.medical, onToggle: () => setLayers((p) => ({ ...p, medical: !p.medical })) },
    { id: "bike", label: "Bike Shop", color: BEACON_MARKER_COLORS.bike, count: layers.bike ? markerCounts.bike : 0, active: layers.bike, onToggle: () => setLayers((p) => ({ ...p, bike: !p.bike })) },
    { id: "restroom", label: "Restrooms", color: BEACON_MARKER_COLORS.restroom, count: layers.restroom ? markerCounts.restroom : 0, active: layers.restroom, onToggle: () => setLayers((p) => ({ ...p, restroom: !p.restroom })) },
  ];
  const sideburnsOn = sideburnFilters.some((filter) => filter.active);
  const servicesOn = serviceFilters.some((filter) => filter.active);
  const sideburnCount = sideburnFilters.reduce((sum, filter) => sum + filter.count, 0);
  const serviceCount = serviceFilters.reduce((sum, filter) => sum + filter.count, 0);

  return (
    <>
      <SectionHeading>Map controls</SectionHeading>
      <p className="mb-2 text-xs leading-relaxed text-[#17130f]/55">Add and position beacons using the control above.</p>
      <SectionHeading className="mt-5">Map layers</SectionHeading>
      <p className="mb-3 text-xs leading-relaxed text-[#17130f]/55">Controls which types of content are visible on the map.</p>
      <div className="grid gap-2">
        <LayerMenu
          id="projects"
          label="Projects"
          count={kindCounts.art}
          active={layers.art}
          expanded={false}
          onToggleActive={() => setLayers((previous) => ({ ...previous, art: !previous.art }))}
          filters={[]}
        />
        <LayerMenu
          id="sideburns"
          label="Sideburns"
          count={sideburnCount}
          active={sideburnsOn}
          expanded={expanded.has("sideburns")}
          onToggleExpanded={() => toggleExpanded("sideburns")}
          onToggleActive={() => setLayers((previous) => ({ ...previous, sidequests: !sideburnsOn, food: !sideburnsOn, getWeird: !sideburnsOn, doGood: !sideburnsOn }))}
          filters={sideburnFilters}
        />
        <LayerMenu
          id="services"
          label="Services"
          count={serviceCount}
          active={servicesOn}
          expanded={expanded.has("services")}
          onToggleExpanded={() => toggleExpanded("services")}
          onToggleActive={() => setLayers((previous) => ({ ...previous, medical: !servicesOn, bike: !servicesOn, restroom: !servicesOn }))}
          filters={serviceFilters}
        />
      </div>
      <YourSideburns records={ownedRecords} hiddenIds={hiddenIds} progressRows={progressRows} onView={selectRecord} onToggleHidden={onToggleHidden} onDelete={onDelete} onComplete={onComplete} />
      <LocationPrivacyNote className="mt-4 text-[11px] text-[#17130f]/55" />
      {warning ? <p className="mt-2 text-xs text-amber-700">{warning}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      <RecordList title="Approximate / unmapped" records={approximate} selectedId={null} distances={distances} onSelect={selectRecord} />
    </>
  );
}

type LayerFilterItem = {
  id: string;
  label: string;
  color: string;
  count: number;
  active: boolean;
  onToggle: () => void;
};

function LayerMenu({
  id,
  label,
  count,
  active,
  expanded,
  onToggleExpanded,
  onToggleActive,
  filters,
}: {
  id: LayerMenuId;
  label: string;
  count: number;
  active: boolean;
  expanded: boolean;
  onToggleExpanded?: () => void;
  onToggleActive: () => void;
  filters: LayerFilterItem[];
}) {
  const statusLabel = active ? (count > 0 ? `on · ${count}` : "on") : "off";
  return (
    <div data-testid={`map-layer-${id}`}>
      <div
        className={cn(
          "flex min-h-9 w-full items-stretch border",
          active ? "border-[#17130f] bg-[#17130f] text-[#f8f5ee]" : "border-[#17130f]/25 text-[#17130f]/65",
        )}
      >
        <button
          type="button"
          aria-expanded={filters.length ? expanded : undefined}
          aria-label={`${label} ${count} · ${active ? "on" : "off"}`}
          onClick={onToggleExpanded}
          className="flex min-h-9 min-w-0 flex-1 items-center gap-2 px-3 text-[10px] uppercase tracking-widest"
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LAYER_DOT[id] }} aria-hidden />
          <span className="w-3 text-left" aria-hidden>{filters.length ? (expanded ? "▾" : "▸") : ""}</span>
          <span className="flex-1 text-left">{label}</span>
        </button>
        <button
          type="button"
          aria-pressed={active}
          aria-label={`${label} layer ${active ? "on" : "off"}`}
          onClick={onToggleActive}
          className="shrink-0 border-l border-current/20 px-3 text-[10px] uppercase tracking-widest"
        >
          {statusLabel}
        </button>
      </div>
      {expanded && filters.length ? (
        <div className="ml-3 border-l border-[#17130f]/15 py-2 pl-3" data-testid={`map-layer-${id}-filters`}>
          <p className="mb-2 text-[10px] uppercase tracking-widest text-[#17130f]/45">Filter by type</p>
          <div className="grid gap-1">
            {filters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={filter.active}
                aria-label={`${filter.label} ${filter.count}${filter.active ? " · on" : " · off"}`}
                onClick={filter.onToggle}
                className={cn(
                  "flex min-h-9 w-full items-center gap-2 px-1 text-left text-[10px] uppercase tracking-widest",
                  filter.active ? "text-[#17130f]" : "text-[#17130f]/45",
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: filter.color, opacity: filter.active ? 1 : 0.35 }}
                  aria-hidden
                />
                <span className="flex-1">{filter.label}</span>
                <span className="tabular-nums text-[#17130f]/55">{filter.count}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionHeading({ children, className }: { children: string; className?: string }) {
  return <h2 className={cn("mb-2 border-b border-[#17130f]/15 pb-2 text-[10px] font-semibold uppercase tracking-[.2em]", className)}>{children}</h2>;
}

type ContributionFilter = "active" | "completed" | "drafts";

function YourSideburns({ records, hiddenIds, progressRows, onView, onToggleHidden, onDelete, onComplete }: {
  records: PlayaMapRecord[];
  hiddenIds: ReadonlySet<string>;
  progressRows: SidequestProgress[];
  onView: (record: PlayaMapRecord) => void;
  onToggleHidden: (record: PlayaMapRecord) => Promise<void>;
  onDelete: (record: PlayaMapRecord) => Promise<void>;
  onComplete: (record: PlayaMapRecord) => Promise<void>;
}) {
  const [filter, setFilter] = useState<ContributionFilter>("active");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const progress = new Map(progressRows.map((row) => [row.sidequestId, row.phase]));
  const statusFor = (record: PlayaMapRecord) => hiddenIds.has(record.id) ? "HIDDEN" : progress.get(record.id) === "completed" ? "COMPLETED" : record.livePin ? "LIVE" : "ACTIVE";
  const shown = records.filter((record) => filter === "completed" ? statusFor(record) === "COMPLETED" : filter === "drafts" ? false : statusFor(record) !== "COMPLETED");
  const run = async (record: PlayaMapRecord, action: (record: PlayaMapRecord) => Promise<void>) => { setBusyId(record.id); try { await action(record); } finally { setBusyId(null); } };
  return (
    <section className="mt-6" aria-labelledby="your-sideburns-heading">
      <div className="mb-2 flex items-center justify-between border-b border-[#17130f]/15 pb-2">
        <h2 id="your-sideburns-heading" className="text-[10px] font-semibold uppercase tracking-[.2em]">Your Sideburns</h2>
        <span className="text-[10px] tabular-nums">{records.length}</span>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-[#17130f]/55">Manage what you created. These controls do not change map-layer filters.</p>
      <div className="mb-2 grid grid-cols-3 border border-[#17130f]/20" aria-label="Contribution status">
        {(["active", "completed", "drafts"] as const).map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)} className={cn("min-h-9 border-r border-[#17130f]/20 px-2 text-[9px] uppercase tracking-widest last:border-r-0", filter === item && "bg-[#17130f] text-[#f8f5ee]")}>{item}</button>)}
      </div>
      {shown.length === 0 ? <p className="py-3 text-xs text-[#17130f]/50">No {filter} contributions.</p> : shown.map((record) => {
        const expanded = expandedId === record.id;
        const status = statusFor(record);
        const age = formatPostAge(record.createdAt)?.replace(/^POSTED /, "Posted ").toLowerCase();
        return <article key={record.id} className="border-b border-[#17130f]/15 py-2">
          <button type="button" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : record.id)} className="flex w-full items-start gap-2 text-left">
            <span aria-hidden>{expanded ? "▾" : "▸"}</span>
            <span className="min-w-0 flex-1"><span className="block text-[9px] uppercase tracking-widest text-[#17130f]/55">{recordTypeLabel(record)} · {status}</span><strong className="mt-1 block truncate text-sm font-medium">{record.title}</strong>{age ? <span className="mt-1 block text-[10px] text-[#17130f]/50">{age}</span> : null}</span>
          </button>
          {expanded ? <div className="ml-5 mt-2 border-l border-[#17130f]/15 pl-3 text-[10px] uppercase tracking-widest text-[#17130f]/60">
            <p>{record.livePin ? "Tracking enabled" : "0 people tracking"}</p><p className="mt-1">Visibility · {hiddenIds.has(record.id) ? "Hidden" : "Visible"}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => onView(record)} className="border border-[#17130f]/25 px-2 py-1.5">View</button>
              <button type="button" onClick={() => onView(record)} className="border border-[#17130f]/25 px-2 py-1.5">Edit</button>
              {record.recordKind === "sidequest" && status !== "COMPLETED" ? <button type="button" disabled={busyId === record.id} onClick={() => void run(record, onComplete)} className="border border-[#17130f]/25 px-2 py-1.5 disabled:opacity-40">Mark complete</button> : null}
              <details className="relative"><summary className="cursor-pointer list-none border border-[#17130f]/25 px-2 py-1.5" aria-label="More actions">•••</summary><div className="absolute right-0 z-10 mt-1 min-w-36 border border-[#17130f]/20 bg-[#f8f5ee] p-1 shadow-lg"><button type="button" onClick={() => void run(record, onToggleHidden)} className="block w-full px-2 py-2 text-left">{hiddenIds.has(record.id) ? "Reactivate" : "Hide from map"}</button><button type="button" onClick={() => void run(record, onDelete)} className="block w-full px-2 py-2 text-left text-red-700">Delete</button></div></details>
            </div>
          </div> : null}
        </article>;
      })}
      <p className="sr-only">Contribution states include Draft, Live, Active, Completed, Hidden, and Removed.</p>
    </section>
  );
}

function recordTypeLabel(record: PlayaMapRecord): string {
  if (record.recordKind === "art") return "Art";
  if (record.recordKind === "beacon") return beaconKindLabel(record.markerKind);
  return beaconKindLabel("sideburn");
}

function RecordList({
  title,
  records,
  selectedId,
  distances,
  onSelect,
}: {
  title: string;
  records: PlayaMapRecord[];
  selectedId: string | null;
  distances: Map<string, number>;
  onSelect: (record: PlayaMapRecord) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="mt-5 border-t border-[#17130f]/10 pt-3">
      <p className="text-[10px] uppercase tracking-widest text-[#17130f]/50">{title}</p>
      {records.length === 0 ? (
        <p className="mt-2 text-sm text-[#17130f]/55">None for this filter.</p>
      ) : (
        <div className="mt-1 max-h-56 overflow-y-auto">
          {records.map((record) => {
            const distance = distances.get(record.id);
            const ageLabel = shouldShowPostAge(record) ? formatPostAge(record.createdAt, new Date(now)) : null;
            const presentedBy = presentedByLabel(record);
            return (
              <button
                key={record.id}
                type="button"
                onClick={() => onSelect(record)}
                className={cn(
                  "flex w-full items-start gap-2 border-b border-[#17130f]/10 px-2 py-3 text-left hover:bg-[#17130f]/5",
                  record.id === selectedId && "bg-[#17130f]/8",
                )}
              >
                <span
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: markerColorForRecord(record) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-1 text-[10px] uppercase tracking-widest text-[#17130f]/50">
                    <span>{recordTypeLabel(record)}</span>
                    {ageLabel ? <span>· {ageLabel}</span> : null}
                    {distance != null ? <span>· {formatDistanceMeters(distance)}</span> : null}
                  </span>
                  <span className="mt-1 block text-sm">{record.title}</span>
                  <span className="mt-1 block text-[10px] uppercase tracking-widest text-[#17130f]/45">
                    Presented by · {presentedBy}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
