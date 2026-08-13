import { useEffect, useState } from "react";
import { useAppServices } from "@/app/providers";
import type { LocalUserIdentity } from "@/features/identity/types/identity";
import { useForegroundLocation } from "@/features/location/hooks/useForegroundLocation";
import { deriveMapRecordTrackingState } from "@/features/map/utils/mapRecordTrackingState";
import type { SidequestLifecycleSnapshot } from "@/features/sidequests/services/sidequestLifecycleService";
import {
  CompletionGateError,
  trackingFlashMessage,
} from "@/features/sidequests/utils/completionGate";
import { LocalPersistenceError } from "@/features/sidequests/utils/localPersistence";
import { cn } from "@/lib/utils";

const FLASH_MS = 3200;

export function SidequestLifecyclePanel({
  sidequestId,
  onChange,
  variant = "dark",
  requireIdentity,
}: {
  sidequestId: string;
  onChange?: () => void;
  variant?: "dark" | "light";
  requireIdentity?: (reason?: string) => Promise<LocalUserIdentity | null>;
}) {
  const light = variant === "light";
  const { sidequestLifecycle } = useAppServices();
  const locationSession = useForegroundLocation();
  const [snapshot, setSnapshot] = useState<SidequestLifecycleSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [notes, setNotes] = useState("");
  const [offline, setOffline] = useState(() => !navigator.onLine);

  const muted = light ? "text-[#17130f]/55" : "text-[#f8f5ee]/55";
  const body = light ? "text-[#17130f]/80" : "text-[#f8f5ee]/70";
  const fieldClass = light
    ? "mt-1 min-h-11 w-full border border-[#17130f]/25 bg-transparent px-3 font-body text-sm text-[#17130f]"
    : "mt-1 min-h-11 w-full border border-[#f8f5ee]/35 bg-transparent px-3 font-body text-sm text-[#f8f5ee]";
  const secondaryBtn = light
    ? "min-h-11 w-full border border-[#17130f]/25 px-4 text-xs uppercase tracking-[.16em] text-[#17130f] disabled:opacity-50"
    : "min-h-11 w-full border border-[#f8f5ee]/40 px-4 text-xs uppercase tracking-[.16em] disabled:opacity-50";
  const primaryBtn = light
    ? "min-h-11 w-full bg-[#17130f] px-4 text-xs uppercase tracking-[.16em] text-[#f8f5ee] disabled:opacity-50"
    : "min-h-11 w-full border border-[#f8f5ee] px-4 text-xs uppercase tracking-[.16em] disabled:opacity-50";

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    if (!celebrating) return;
    const id = window.setTimeout(() => setCelebrating(false), 1800);
    return () => window.clearTimeout(id);
  }, [celebrating]);

  useEffect(() => {
    let active = true;
    setBusy(true);
    void sidequestLifecycle
      .getSnapshot(sidequestId, locationSession.reading)
      .then((value) => {
        if (!active) return;
        setSnapshot(value);
        setNotes(value?.progress?.notes ?? value?.completion?.notes ?? "");
        setBusy(false);
      })
      .catch(() => {
        if (!active) return;
        setError("Progress status unavailable on this device.");
        setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [sidequestLifecycle, sidequestId, locationSession.reading]);

  async function refreshSnapshot() {
    const next = await sidequestLifecycle.getSnapshot(sidequestId, locationSession.reading);
    setSnapshot(next);
    setNotes(next?.progress?.notes ?? next?.completion?.notes ?? "");
    onChange?.();
  }

  async function run(action: () => Promise<unknown>, options?: { requireName?: boolean }) {
    setBusy(true);
    setError(null);
    setRecovery(null);
    try {
      if (options?.requireName !== false && requireIdentity) {
        const identity = await requireIdentity(
          "Choose a burner name before completing a sidequest. No email or password required.",
        );
        if (!identity) {
          setBusy(false);
          return;
        }
      }
      await action();
      await refreshSnapshot();
    } catch (reason: unknown) {
      if (reason instanceof CompletionGateError) {
        if (light) {
          setFlash(trackingFlashMessage(reason.reason));
        } else {
          setError(reason.message);
        }
      } else if (reason instanceof LocalPersistenceError) {
        setError(reason.message);
        setRecovery(reason.recoveryHint);
      } else {
        setError(reason instanceof Error ? reason.message : "Could not update sidequest progress.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function trackIt() {
    await run(() => sidequestLifecycle.begin(sidequestId), { requireName: false });
    if (!locationSession.optedIn) {
      locationSession.enable();
    }
  }

  async function stopTracking() {
    await run(() => sidequestLifecycle.abandon(sidequestId), { requireName: false });
  }

  async function markComplete() {
    setError(null);
    setFlash(null);

    if (snapshot?.sidequest.completionRule === "proximity" && !locationSession.optedIn) {
      locationSession.enable();
      setFlash("Enable location access to check if you're at this beacon.");
      return;
    }

    setBusy(true);
    try {
      if (requireIdentity) {
        const identity = await requireIdentity(
          "Choose a burner name before completing a sidequest. No email or password required.",
        );
        if (!identity) {
          setBusy(false);
          return;
        }
      }
      await sidequestLifecycle.complete({
        sidequestId,
        notes: light ? undefined : notes,
        reading: locationSession.reading,
      });
      setCelebrating(true);
      await refreshSnapshot();
    } catch (reason: unknown) {
      if (reason instanceof CompletionGateError) {
        if (light) {
          setFlash(trackingFlashMessage(reason.reason));
        } else {
          setError(reason.message);
        }
      } else if (reason instanceof LocalPersistenceError) {
        setError(reason.message);
        setRecovery(reason.recoveryHint);
      } else {
        setError(reason instanceof Error ? reason.message : "Could not update sidequest progress.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot && busy) {
    return <p className={cn("text-xs", muted)}>Loading quest progress…</p>;
  }

  if (!snapshot) {
    return error ? <p className={cn("text-xs", light ? "text-red-700" : "text-red-300")}>{error}</p> : null;
  }

  const phase = snapshot.progress?.phase ?? null;
  const requiresProximity = snapshot.sidequest.completionRule === "proximity";
  const trackingState = deriveMapRecordTrackingState({
    phase,
    inRange:
      phase === "in_progress" &&
      requiresProximity &&
      snapshot.gate.allowed &&
      snapshot.gate.distanceMeters != null,
  });
  const completed = trackingState === "completed";
  const tracked = trackingState === "tracked" || trackingState === "in_range";

  if (light) {
    return (
      <div className="space-y-3" data-testid="sidequest-lifecycle-panel" data-tracking-state={trackingState}>
        <p className="sr-only" data-testid="sidequest-progress-phase">
          Progress · {phase ?? "not started"}
        </p>

        {!completed ? (
          <button
            type="button"
            disabled={busy}
            className={primaryBtn}
            onClick={() => void (tracked ? markComplete() : trackIt())}
            data-testid={tracked ? "sidequest-complete" : "sidequest-track"}
            aria-label={tracked ? "Mark complete" : "Track it"}
          >
            {busy ? "Saving…" : tracked ? "✓ Mark complete" : "Track it"}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className={cn(
              primaryBtn,
              "bg-[#17130f]/10 text-[#17130f]",
              celebrating && "animate-pulse",
            )}
            data-testid="sidequest-completed"
            aria-label="Completed"
          >
            {celebrating ? "★ Found it!" : "✓ Completed"}
          </button>
        )}

        {flash ? (
          <p
            className="text-sm font-medium text-amber-900 transition-opacity duration-300"
            data-testid="sidequest-tracking-flash"
            role="status"
          >
            {flash}
          </p>
        ) : null}

        {tracked && trackingState === "in_range" ? (
          <p className="text-xs text-emerald-800" data-testid="sidequest-in-range-hint">
            You&apos;re in range — mark complete when you&apos;re ready.
          </p>
        ) : null}

        {tracked ? (
          <button
            type="button"
            disabled={busy}
            className="min-h-11 w-full text-left text-xs uppercase tracking-[0.16em] text-[#17130f]/55 underline-offset-4 hover:underline disabled:opacity-50"
            onClick={() => void stopTracking()}
            data-testid="sidequest-stop-tracking"
          >
            Stop tracking
          </button>
        ) : null}

        {error ? (
          <p className="text-xs text-red-700" data-testid="sidequest-lifecycle-error">
            {error}
          </p>
        ) : null}
        {recovery ? (
          <p className="text-xs text-amber-800" data-testid="sidequest-lifecycle-recovery">
            {recovery}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="mt-5 space-y-3 border-t border-[#f8f5ee]/15 pt-4"
      data-testid="sidequest-lifecycle-panel"
      data-tracking-state={trackingState}
    >
      <div className={cn("flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[.16em]", muted)}>
        <span data-testid="sidequest-origin">Origin · {snapshot.sidequest.origin}</span>
        <span>·</span>
        <span data-testid="sidequest-progress-phase">Progress · {phase ?? "not started"}</span>
        {requiresProximity ? (
          <>
            <span>·</span>
            <span>Proximity required</span>
          </>
        ) : null}
      </div>

      {offline ? (
        <p className={cn("text-xs", muted)} data-testid="sidequest-offline-note">
          Offline — changes save on this device only.
        </p>
      ) : null}

      {requiresProximity && snapshot.gate.allowed === false ? (
        <p className="text-xs text-amber-200/90" data-testid="sidequest-gate-message">
          {snapshot.gate.message}
        </p>
      ) : null}

      {!completed ? (
        <label className={cn("block text-[10px] uppercase tracking-[.16em]", muted)}>
          Local notes (optional)
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            className={`${fieldClass} min-h-20 py-2`}
            placeholder="Remember what you found…"
            data-testid="sidequest-completion-notes"
          />
        </label>
      ) : snapshot.progress?.notes || snapshot.completion?.notes ? (
        <p className={cn("text-xs", body)} data-testid="sidequest-completed-notes">
          Notes: {snapshot.progress?.notes ?? snapshot.completion?.notes}
          {snapshot.progress?.completedAt
            ? ` · ${new Date(snapshot.progress.completedAt).toLocaleString()}`
            : null}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {phase == null || phase === "saved" ? (
          <button
            type="button"
            disabled={busy}
            className={secondaryBtn}
            onClick={() => void run(() => sidequestLifecycle.begin(sidequestId), { requireName: false })}
            data-testid="sidequest-begin"
          >
            Begin sidequest
          </button>
        ) : null}

        {phase == null ? (
          <button
            type="button"
            disabled={busy}
            className={secondaryBtn}
            onClick={() => void run(() => sidequestLifecycle.save(sidequestId), { requireName: false })}
            data-testid="sidequest-save"
          >
            Save for later
          </button>
        ) : null}

        {phase === "saved" ? (
          <button
            type="button"
            disabled={busy}
            className={secondaryBtn}
            onClick={() => void run(() => sidequestLifecycle.unsave(sidequestId), { requireName: false })}
            data-testid="sidequest-unsave"
          >
            Remove save
          </button>
        ) : null}

        {phase === "in_progress" ? (
          <button
            type="button"
            disabled={busy}
            className={secondaryBtn}
            onClick={() => void run(() => sidequestLifecycle.abandon(sidequestId), { requireName: false })}
            data-testid="sidequest-abandon"
          >
            Abandon (keep notes offline)
          </button>
        ) : null}

        {!completed ? (
          <button
            type="button"
            disabled={busy || (requiresProximity && snapshot.gate.allowed === false)}
            className={primaryBtn}
            onClick={() => void markComplete()}
            data-testid="sidequest-complete"
            aria-label="Mark complete"
          >
            {busy ? "Saving…" : "Mark complete"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            className={primaryBtn}
            onClick={() => void run(() => sidequestLifecycle.undoComplete(sidequestId), { requireName: false })}
            data-testid="sidequest-undo-complete"
          >
            Completed · undo
          </button>
        )}
      </div>

      <p className={cn("text-xs", muted)}>
        Writes land on this device before any future sync. GPS is only required when the quest declares proximity.
      </p>
      {error ? (
        <p className="text-xs text-red-300" data-testid="sidequest-lifecycle-error">
          {error}
        </p>
      ) : null}
      {recovery ? (
        <p className="text-xs text-amber-200/90" data-testid="sidequest-lifecycle-recovery">
          {recovery}
        </p>
      ) : null}
    </div>
  );
}
