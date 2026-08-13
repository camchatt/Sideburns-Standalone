import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppServices } from "@/app/providers";
import { useForegroundLocation } from "@/features/location/hooks/useForegroundLocation";
import type { SyncStatus } from "@/features/sync/types/sync";

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-secondary/70 px-2.5 py-1.5 font-body text-xs">
      <span className="text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export function FieldStatusBar() {
  const { config, data, syncService } = useAppServices();
  const locationSession = useForegroundLocation();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void syncService.getStatus().then((status) => {
        if (!cancelled) setSyncStatus(status);
      });
    };
    refresh();
    const id = window.setInterval(refresh, 5000);
    const onOnline = () => {
      setOffline(false);
      refresh();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [syncService]);

  const locationLabel = !locationSession.optedIn
    ? locationSession.stateLabel
    : locationSession.reading?.coordinates
      ? `${locationSession.reading.coordinates.latitude.toFixed(4)}, ${locationSession.reading.coordinates.longitude.toFixed(4)} (${locationSession.stateLabel.toLowerCase()})`
      : locationSession.stateLabel.toLowerCase();

  const providerLabel =
    data.dataProviderId === "supabase"
      ? `supabase sync · catalog ${data.catalogSource}`
      : data.dataProviderId;

  const syncLabel = syncStatus
    ? syncStatus.conflictCount > 0
      ? `${syncStatus.conflictCount} conflict · ${syncStatus.connectivity}`
      : syncStatus.failedCount > 0
        ? `${syncStatus.failedCount} failed · ${syncStatus.connectivity}`
        : syncStatus.pauseReason
          ? `${syncStatus.pendingCount} pending · paused`
          : `${syncStatus.pendingCount} pending · ${syncStatus.backend}`
    : "…";

  const liveSummary = [
    offline ? "Offline" : "Online",
    `Location ${locationLabel}`,
    `Sync ${syncLabel}`,
    syncStatus?.pauseReason ? `Pause: ${syncStatus.pauseReason}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <div className="flex flex-wrap gap-2" aria-label="Field status">
      <p className="sr-only" aria-live="polite">
        {liveSummary}
      </p>
      <Pill label="Provider" value={providerLabel} />
      <Pill label="Offline" value={offline ? "yes" : "no"} />
      <Pill label="Location" value={locationLabel} />
      <Link
        to="/sync-status"
        className="inline-flex min-h-11 items-center rounded-md border border-border bg-secondary/70 px-2.5 py-1.5 font-body text-xs hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-muted-foreground">Sync: </span>
        <span className="text-foreground">{syncLabel}</span>
      </Link>
      {config.env.VITE_ENABLE_PROTOTYPE_CONTROLS ? (
        <>
          <Pill label="Mode" value={config.env.VITE_APP_ENV} />
          <Link
            to="/prototype-controls"
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-secondary/70 px-2.5 py-1.5 font-body text-xs hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Test location
          </Link>
        </>
      ) : null}
    </div>
  );
}
