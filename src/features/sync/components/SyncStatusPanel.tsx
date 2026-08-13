import { useCallback, useEffect, useState } from "react";
import { useAppServices } from "@/app/providers";
import type { SyncDrainResult, SyncOperation, SyncStatus } from "@/features/sync/types/sync";
import { Button } from "@/components/ui/button";

function statusTone(status: SyncOperation["status"]): string {
  switch (status) {
    case "synced":
      return "text-muted-foreground";
    case "conflict":
      return "text-destructive";
    case "failed":
      return "text-amber-800 dark:text-amber-200";
    case "syncing":
      return "text-foreground";
    default:
      return "text-foreground";
  }
}

export function SyncStatusPanel() {
  const { syncService, auth, data } = useAppServices();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [operations, setOperations] = useState<SyncOperation[]>([]);
  const [lastDrain, setLastDrain] = useState<SyncDrainResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sessionLabel, setSessionLabel] = useState<string>("checking…");

  const refresh = useCallback(async () => {
    const [nextStatus, nextOps, session] = await Promise.all([
      syncService.getStatus(),
      syncService.listOperations(),
      auth.getSession(),
    ]);
    setStatus(nextStatus);
    setOperations([...nextOps].reverse());
    setSessionLabel(
      session?.userId
        ? `${session.isAnonymous ? "anonymous" : "signed-in"} · ${session.userId.slice(0, 8)}…`
        : "signed out",
    );
  }, [auth, syncService]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 4000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const run = async (action: () => Promise<SyncDrainResult>, label: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      setLastDrain(result);
      setMessage(
        result.paused
          ? `${label} paused: ${result.pauseReason}`
          : `${label}: ${result.synced} synced · ${result.failed} failed · ${result.conflicts} conflicts`,
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync action failed");
    } finally {
      setBusy(false);
    }
  };

  const enableAnonymousSync = async () => {
    if (!auth.signInAnonymously) {
      setMessage("Anonymous sign-in is not available in this mode.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await auth.signInAnonymously();
      setMessage("Anonymous session ready — pending operations can upload when online.");
      await run(() => syncService.drain(), "Sync");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Anonymous sign-in failed");
      setBusy(false);
    }
  };

  const pendingish = operations.filter((op) => op.status !== "synced");

  return (
    <section className="space-y-5" aria-label="Sync status">
      <div className="space-y-2">
        <h1 className="font-display text-3xl tracking-[0.06em]">Sync status</h1>
        <p className="font-body text-sm text-muted-foreground">
          Local IndexedDB stays the source of truth. Remote upload is opportunistic and never blocks
          create, save, or complete.
        </p>
      </div>

      <dl className="grid gap-2 font-body text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Configured provider</dt>
          <dd>{data.dataProviderId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Catalog source</dt>
          <dd>{data.catalogSource}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sync backend</dt>
          <dd>{data.syncBackend}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Auth</dt>
          <dd>{sessionLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Connectivity</dt>
          <dd>{status?.connectivity ?? "…"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last synced</dt>
          <dd>{status?.lastSyncedAt ?? "never"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pending / failed / conflict</dt>
          <dd>
            {status
              ? `${status.pendingCount} / ${status.failedCount} / ${status.conflictCount}`
              : "…"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pause reason</dt>
          <dd>{status?.pauseReason ?? "none"}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => void run(() => syncService.drain(), "Sync now")}
        >
          Sync now
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void run(() => syncService.retryAllFailed(), "Retry failed")}
        >
          Retry failed / conflicts
        </Button>
        {data.remoteSyncEnabled && auth.signInAnonymously ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void enableAnonymousSync()}>
            Enable anonymous sync
          </Button>
        ) : null}
        {auth.signOut && status?.authenticated ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await auth.signOut();
                  setMessage("Signed out. Pending outbox rows are preserved on this device.");
                  await refresh();
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Sign out
          </Button>
        ) : null}
      </div>

      {message ? (
        <p className="font-body text-sm text-muted-foreground" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {lastDrain && !lastDrain.paused ? (
        <p className="font-body text-xs text-muted-foreground">
          Last drain attempted {lastDrain.attempted} operation(s).
        </p>
      ) : null}

      <div className="space-y-3">
        <h2 className="font-display text-xl tracking-[0.04em]">
          Outbox {pendingish.length > 0 ? `(${pendingish.length} open)` : ""}
        </h2>
        {operations.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">No sync operations yet.</p>
        ) : (
          <ul className="space-y-3">
            {operations.map((op) => (
              <li key={op.id} className="border border-border px-3 py-2 font-body text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={statusTone(op.status)}>
                    {op.type} · {op.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{op.updatedAt}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  id {op.id} · idempotency {op.idempotencyKey} · attempts {op.attemptCount}
                </p>
                {op.lastError ? (
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{op.lastError}</p>
                ) : null}
                {op.conflict ? (
                  <p className="mt-1 text-xs text-destructive">
                    Conflict preserved — local payload retained for recovery.
                  </p>
                ) : null}
                {(op.status === "failed" || op.status === "conflict") && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    disabled={busy}
                    onClick={() => void run(() => syncService.retry(op.id), "Retry")}
                  >
                    Retry this operation
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
