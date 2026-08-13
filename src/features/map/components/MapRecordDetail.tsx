import { useEffect, useState } from "react";
import { useAppServices } from "@/app/providers";
import { useLocalIdentity } from "@/features/identity/hooks/useLocalIdentity";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { beaconKindLabel } from "@/features/map/utils/beaconKinds";
import { markerColorForRecord } from "@/features/map/utils/markerStyle";
import type { PlayaMapRecord } from "@/features/map/types/mapRecord";
import { SidequestLifecyclePanel } from "@/features/sidequests/components/SidequestLifecyclePanel";
import {
  canRemoveBeacon,
  presentedByLabel,
  shouldShowPostAge,
} from "@/features/sidequests/utils/ownership";
import { formatPostAge } from "@/features/sidequests/utils/postAge";
import { cn } from "@/lib/utils";

function categoryLabel(record: PlayaMapRecord): string {
  if (record.recordKind === "art") return "ART";
  if (record.recordKind === "beacon") return beaconKindLabel(record.markerKind).toUpperCase();
  return "SIDEBURN";
}

export function MapRecordDetail({
  record,
  compact = false,
  onClose,
  onCompletionChange,
  onDeleted,
}: {
  record: PlayaMapRecord;
  /** Truncate description in collapsed/peek-adjacent layouts. */
  compact?: boolean;
  onClose: () => void;
  onCompletionChange: () => void;
  onDeleted: () => void;
}) {
  const { mapRecords, data, syncService, questCompletions } = useAppServices();
  const { identity, requireDisplayName } = useLocalIdentity();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [finishCount, setFinishCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const showAge = shouldShowPostAge(record);
  const ageLabel = showAge ? formatPostAge(record.createdAt, new Date(now)) : null;
  const canRemove = canRemoveBeacon(record, identity?.id);
  const presentedBy = presentedByLabel(record);
  const categoryColor = markerColorForRecord(record);

  useEffect(() => {
    if (!showAge) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [showAge, record.id]);

  useEffect(() => {
    let active = true;
    void questCompletions.list().then((rows) => {
      if (!active) return;
      setFinishCount(rows.filter((row) => row.sidequestId === record.id).length);
    });
    return () => {
      active = false;
    };
  }, [questCompletions, record.id]);

  const removeBeacon = async () => {
    setRemoving(true);
    setRemoveError(null);
    try {
      if (record.origin === "local" || record.id.startsWith("sq_local_")) {
        await data.sidequests.delete(record.id);
        await syncService.drain();
      } else {
        await mapRecords.interactions.toggleDismissed(record.id);
      }
      onDeleted();
    } catch (reason: unknown) {
      setRemoveError(reason instanceof Error ? reason.message : "Unable to remove beacon");
      setRemoving(false);
    }
  };

  const description = record.description || "No description available.";

  return (
    <div data-testid="map-record-panel" className="text-[#17130f]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.16em] text-[#17130f]/55">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: categoryColor }}
                aria-hidden
              />
              {categoryLabel(record)}
            </span>
            {ageLabel ? <span data-testid="post-age">· {ageLabel}</span> : null}
          </p>
          <h2 className="mt-2 font-display text-2xl leading-tight tracking-wide sm:text-3xl">{record.title}</h2>
          <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-[#17130f]/55" data-testid="presented-by">
            Presented by · {presentedBy}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center border border-[#17130f]/20 text-lg leading-none text-[#17130f]"
          data-testid="close-detail"
        >
          ×
        </button>
      </div>

      <p
        className={cn(
          "text-sm leading-relaxed text-[#17130f]/80",
          compact && "line-clamp-3",
        )}
        data-testid="record-description"
      >
        {description}
      </p>

      {record.reward ? (
        <p
          className="mt-4 border-l-4 border-amber-400 pl-3 text-sm font-medium text-[#17130f]"
          data-testid="record-reward"
        >
          Reward · {record.reward}
        </p>
      ) : null}

      <div className="mt-5 border-t border-[#17130f]/10 pt-4">
        {record.recordKind === "sidequest" ? (
          <SidequestLifecyclePanel
            sidequestId={record.id}
            variant="light"
            requireIdentity={requireDisplayName}
            onChange={() => {
              onCompletionChange();
              void questCompletions.list().then((rows) => {
                setFinishCount(rows.filter((row) => row.sidequestId === record.id).length);
              });
            }}
          />
        ) : null}

        {record.recordKind === "sidequest" ? (
          <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-[#17130f]/45" data-testid="finish-count">
            {finishCount} {finishCount === 1 ? "finish" : "finishes"}
          </p>
        ) : null}
      </div>

      {canRemove ? (
        <div className="mt-6">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={removing}
                className="min-h-11 w-full text-left text-xs uppercase tracking-[0.16em] text-red-700/80 underline-offset-4 hover:underline disabled:opacity-50"
                data-testid="remove-local-beacon"
              >
                {removing ? "Removing…" : "Remove beacon"}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this beacon?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove it from your map and from other users after synchronization.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void removeBeacon()}>Remove beacon</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}

      {removeError ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {removeError}
        </p>
      ) : null}
    </div>
  );
}
