import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppServices } from "@/app/providers";
import { LocationOptInCard } from "@/features/location/components/LocationOptInCard";
import { useForegroundLocation } from "@/features/location/hooks/useForegroundLocation";
import { NEARBY_DEFAULT_RADIUS_METERS } from "@/features/location/config";
import { isReadingUsableForProximity } from "@/features/location/utils/locationState";
import { evaluateProximityFromReading } from "@/features/proximity/services/evaluateProximity";
import type { ProximityState } from "@/features/proximity/types/proximity";
import type { Sidequest } from "@/features/sidequests/types/sidequest";
import {
  formatDistanceMeters,
  partitionNearbySidequests,
  type NearbyLocatedSidequest,
} from "@/features/sidequests/utils/nearbySidequests";

export function NearbyExperience() {
  const { data, proximity } = useAppServices();
  const locationSession = useForegroundLocation();
  const [sidequests, setSidequests] = useState<Sidequest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [proximityStates, setProximityStates] = useState<ProximityState[]>([]);

  useEffect(() => {
    let active = true;
    void data.sidequests
      .getAll()
      .then((rows) => {
        if (active) setSidequests(rows);
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(reason instanceof Error ? reason.message : "Unable to load sidequests");
      });
    return () => {
      active = false;
    };
  }, [data.sidequests]);

  const usable = isReadingUsableForProximity(locationSession.reading);
  const partition = useMemo(() => {
    if (!usable || !locationSession.reading?.coordinates) {
      return {
        located: [] as NearbyLocatedSidequest[],
        approximate: sidequests.filter((quest) => quest.placementKind === "approximate"),
        radiusMeters: NEARBY_DEFAULT_RADIUS_METERS,
      };
    }
    return partitionNearbySidequests(
      sidequests,
      locationSession.reading.coordinates,
      NEARBY_DEFAULT_RADIUS_METERS,
    );
  }, [sidequests, usable, locationSession.reading]);

  useEffect(() => {
    let active = true;
    const targets = partition.located.map(({ sidequest }) => ({
      id: sidequest.id,
      location: sidequest.location,
      radiusMeters: sidequest.radiusMeters,
    }));
    void evaluateProximityFromReading(proximity, targets, locationSession.reading).then((states) => {
      if (active) setProximityStates(states);
    });
    return () => {
      active = false;
    };
  }, [proximity, partition.located, locationSession.reading]);

  const proximityById = useMemo(() => {
    const map = new Map<string, ProximityState>();
    for (const state of proximityStates) map.set(state.targetId, state);
    return map;
  }, [proximityStates]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-[0.06em]">Nearby</h1>
        <p className="mt-2 max-w-2xl font-body text-sm text-muted-foreground">
          Foreground GPS orders precise sidequests by distance. Approximate placements stay
          separate and never trigger proximity events from weak or stale fixes.
        </p>
      </div>

      <LocationOptInCard
        optedIn={locationSession.optedIn}
        state={locationSession.state}
        onEnable={locationSession.enable}
        onRetry={locationSession.retry}
        onDisable={locationSession.disable}
      />

      {loadError ? <p className="font-body text-sm text-destructive">{loadError}</p> : null}

      {!locationSession.optedIn ? (
        <p className="font-body text-sm text-muted-foreground" data-testid="nearby-prompt">
          Enable location to sort nearby sidequests. You can keep browsing Map and Explore without GPS.
        </p>
      ) : null}

      {locationSession.optedIn && !usable ? (
        <p className="font-body text-sm text-muted-foreground" data-testid="nearby-waiting-fix">
          Waiting for a usable GPS fix before ranking by distance ({locationSession.stateLabel.toLowerCase()}).
        </p>
      ) : null}

      {usable ? (
        <div className="space-y-3" data-testid="nearby-located-list">
          <h2 className="font-display text-2xl tracking-[0.04em]">Within {formatDistanceMeters(partition.radiusMeters)}</h2>
          {partition.located.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground" data-testid="nearby-empty">
              No precisely located sidequests within range.
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border">
              {partition.located.map(({ sidequest, distanceMeters: distance }) => {
                const phase = proximityById.get(sidequest.id)?.phase ?? "unknown";
                return (
                  <li key={sidequest.id} className="flex items-center justify-between gap-3 px-3 py-3">
                    <div>
                      <p className="font-body text-sm">{sidequest.title}</p>
                      <p className="font-body text-xs text-muted-foreground">
                        {formatDistanceMeters(distance)} · {sidequest.category} · proximity {phase}
                      </p>
                    </div>
                    <Link
                      to={`/?record=${encodeURIComponent(sidequest.id)}`}
                      className="font-body text-sm underline"
                    >
                      Open
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      <div className="space-y-3" data-testid="nearby-approximate-list">
        <h2 className="font-display text-2xl tracking-[0.04em]">Approximate / imprecise</h2>
        <p className="font-body text-sm text-muted-foreground">
          These placements are not ranked by GPS distance and do not drive proximity.
        </p>
        {partition.approximate.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">No approximate sidequests right now.</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {partition.approximate.map((sidequest) => (
              <li key={sidequest.id} className="flex items-center justify-between gap-3 px-3 py-3">
                <div>
                  <p className="font-body text-sm">{sidequest.title}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    Approximate · {sidequest.category}
                  </p>
                </div>
                <Link
                  to={`/?record=${encodeURIComponent(sidequest.id)}`}
                  className="font-body text-sm underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
