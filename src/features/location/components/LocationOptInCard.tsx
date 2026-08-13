import { LocationPrivacyNote } from "@/features/location/components/LocationPrivacyNote";
import type { LocationLifecycleState } from "@/features/location/types/location";
import { locationStateLabel } from "@/features/location/utils/locationState";

const QUALITY_HINTS: Partial<Record<LocationLifecycleState, string>> = {
  denied: "Browsing stays available. Re-enable location for this site and in Windows Settings > Privacy & security > Location, then retry.",
  insecure: "Location requires a secure page. Open SIDEBURNS on HTTPS or localhost, then retry.",
  unsupported: "This device or browser does not expose geolocation.",
  unavailable: "GPS could not produce a fix. Try outdoors with a clearer sky view.",
  inaccurate: "Fix quality is too low for Nearby distance and proximity. Wait for a better lock.",
  stale: "Last fix is too old. Stay on this screen until a fresh reading arrives.",
  acquiring: "Waiting for a foreground GPS fix…",
  simulated: "Using a prototype simulated position (development controls).",
};

type LocationOptInCardProps = {
  optedIn: boolean;
  state: LocationLifecycleState;
  onEnable: () => void;
  onRetry: () => void;
  onDisable: () => void;
  title?: string;
};

export function LocationOptInCard({
  optedIn,
  state,
  onEnable,
  onRetry,
  onDisable,
  title = "Foreground location",
}: LocationOptInCardProps) {
  const hint = QUALITY_HINTS[state];

  return (
    <div className="space-y-3 border border-border bg-secondary/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-body text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{title}</p>
          <p
            className="mt-1 font-body text-sm text-foreground"
            data-testid="location-lifecycle-state"
            aria-live="polite"
          >
            {locationStateLabel(state)}
          </p>
        </div>
        {optedIn && (state === "denied" || state === "insecure" || state === "unavailable") ? (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 bg-primary px-4 font-body text-sm text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="retry-foreground-location"
          >
            Retry location
          </button>
        ) : optedIn ? (
          <button
            type="button"
            onClick={onDisable}
            className="min-h-11 border border-border px-4 font-body text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Stop sharing location
          </button>
        ) : (
          <button
            type="button"
            onClick={onEnable}
            className="min-h-11 bg-primary px-4 font-body text-sm text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="enable-foreground-location"
          >
            Use my location
          </button>
        )}
      </div>
      <LocationPrivacyNote />
      {hint ? (
        <p className="font-body text-xs text-muted-foreground" aria-live="polite">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
