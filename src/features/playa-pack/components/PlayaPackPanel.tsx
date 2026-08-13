import { useCallback, useEffect, useState } from "react";
import type { PlayaPackDownloadProgress, PlayaPackReadinessView } from "@/features/playa-pack/types/playaPack";
import type { PlayaPackService } from "@/features/playa-pack/services/playaPackService";

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

type PlayaPackPanelProps = {
  playaPacks: PlayaPackService;
  online: boolean;
};

export function PlayaPackPanel({ playaPacks, online }: PlayaPackPanelProps) {
  const [readiness, setReadiness] = useState<PlayaPackReadinessView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyPackId, setBusyPackId] = useState<string | null>(null);
  const [progress, setProgress] = useState<PlayaPackDownloadProgress | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await playaPacks.getReadiness();
      setReadiness(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pack status");
    }
  }, [playaPacks]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await playaPacks.getReadiness();
        if (!cancelled) {
          setReadiness(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load pack status");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playaPacks]);

  async function runAction(packId: string, action: () => Promise<unknown>) {
    setBusyPackId(packId);
    setError(null);
    setProgress(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pack action failed");
      await refresh();
    } finally {
      setBusyPackId(null);
      setProgress(null);
    }
  }

  const installedById = new Map((readiness?.installed ?? []).map((pack) => [pack.packId, pack]));
  const catalog = readiness?.catalog ?? [];
  const knownIds = new Set([
    ...catalog.map((entry) => entry.packId),
    ...installedById.keys(),
  ]);

  return (
    <section
      className="space-y-4 border border-border bg-background/60 p-4"
      aria-labelledby="playa-pack-heading"
    >
      <div>
        <h2 id="playa-pack-heading" className="font-display text-2xl tracking-[0.06em]">
          Playa pack
        </h2>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Download a versioned event dataset while online. Incomplete or checksum-invalid packs never
          become active. Local sidequests you create stay on device when packs change.
        </p>
      </div>

      {readiness ? (
        <dl className="grid gap-2 font-body text-sm">
          <div className="flex justify-between gap-4 border-b border-border/60 py-2">
            <dt className="text-muted-foreground">Active pack</dt>
            <dd>{readiness.activePackId ?? "none (bundled sample)"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border/60 py-2">
            <dt className="text-muted-foreground">Persistent storage</dt>
            <dd>
              {readiness.storagePersisted === null
                ? "unsupported"
                : readiness.storagePersisted
                  ? "granted"
                  : "denied"}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border/60 py-2">
            <dt className="text-muted-foreground">Storage used / quota</dt>
            <dd>
              {formatBytes(readiness.storageEstimateBytes)} /{" "}
              {formatBytes(readiness.storageQuotaBytes)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="font-body text-sm text-muted-foreground">Loading pack status…</p>
      )}

      {readiness?.notes.length ? (
        <ul className="space-y-1 font-body text-xs text-amber-800 dark:text-amber-200">
          {readiness.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="font-body text-sm text-destructive">{error}</p> : null}

      {progress ? (
        <div className="font-body text-sm" aria-live="polite">
          <p>
            Downloading {progress.currentFile ?? progress.packId}:{" "}
            {Math.round(progress.fraction * 100)}% ({formatBytes(progress.bytesReceived)} /{" "}
            {formatBytes(progress.bytesTotal)})
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden bg-muted">
            <div
              className="h-full bg-foreground transition-[width]"
              style={{ width: `${Math.round(progress.fraction * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      <ul className="space-y-4">
        {[...knownIds].map((packId) => {
          const entry = catalog.find((item) => item.packId === packId);
          const installed = installedById.get(packId);
          const busy = busyPackId === packId;
          const isActive = readiness?.activePackId === packId;
          const failed = installed?.status === "failed";
          const incomplete = installed?.status === "incomplete";

          return (
            <li key={packId} className="border-b border-border/60 pb-4">
              <p className="font-body text-base font-medium">
                {installed?.name ?? entry?.name ?? packId}
              </p>
              <dl className="mt-2 grid gap-1 font-body text-xs text-muted-foreground">
                <div className="flex justify-between gap-4">
                  <dt>Status</dt>
                  <dd>{installed?.status ?? "not installed"}{isActive ? " (active)" : ""}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Content version</dt>
                  <dd>{installed?.contentVersion ?? entry?.contentVersion ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Estimated size</dt>
                  <dd>
                    {formatBytes(installed?.bytesTotal ?? entry?.estimatedByteSize ?? null)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Last update</dt>
                  <dd>{formatTimestamp(installed?.lastUpdatedAt)}</dd>
                </div>
                {installed?.lastError ? (
                  <div className="flex justify-between gap-4 text-destructive">
                    <dt>Failure</dt>
                    <dd className="text-right">{installed.lastError}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-3 flex flex-wrap gap-2">
                {!installed || failed || incomplete ? (
                  <button
                    type="button"
                    className="border border-border px-3 py-1.5 font-body text-sm disabled:opacity-50"
                    disabled={busy || !online}
                    onClick={() =>
                      void runAction(packId, () =>
                        playaPacks.downloadAndActivate(packId, {
                          onProgress: setProgress,
                        }),
                      )
                    }
                  >
                    {failed || incomplete ? "Retry download" : "Download & activate"}
                  </button>
                ) : null}
                {installed && installed.status === "ready" && !isActive ? (
                  <button
                    type="button"
                    className="border border-border px-3 py-1.5 font-body text-sm disabled:opacity-50"
                    disabled={busy || !online}
                    onClick={() =>
                      void runAction(packId, () =>
                        playaPacks.downloadAndActivate(packId, {
                          onProgress: setProgress,
                        }),
                      )
                    }
                  >
                    Activate
                  </button>
                ) : null}
                {installed ? (
                  <button
                    type="button"
                    className="border border-border px-3 py-1.5 font-body text-sm disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void runAction(packId, () => playaPacks.remove(packId))}
                  >
                    Remove pack
                  </button>
                ) : null}
              </div>
              {!online && (!installed || failed || incomplete) ? (
                <p className="mt-2 font-body text-xs text-muted-foreground">
                  Connect to download or retry. Installed packs remain usable offline.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {knownIds.size === 0 ? (
        <p className="font-body text-sm text-muted-foreground">
          No pack catalog entries yet. Bundled sample sidequests remain available without a pack.
        </p>
      ) : null}
    </section>
  );
}
