import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppServices } from "@/app/providers";
import type { LocalInteractionEntry } from "@/features/map/types/mapRecord";
import type { Sidequest, SidequestProgress } from "@/features/sidequests/types/sidequest";

type ReviewRow = { sidequest: Sidequest; progress: SidequestProgress };

export function SavedLibrary() {
  const { mapRecords, data, sidequestLifecycle } = useAppServices();
  const [saved, setSaved] = useState<LocalInteractionEntry[]>([]);
  const [localCreates, setLocalCreates] = useState<Sidequest[]>([]);
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(() => !navigator.onLine);

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
    let active = true;
    setLoading(true);
    void Promise.all([
      mapRecords.interactions.listSaved(),
      data.sidequests.getAll(),
      sidequestLifecycle.listReview(),
    ])
      .then(([savedRows, sidequests, reviewRows]) => {
        if (!active) return;
        setSaved(savedRows);
        setLocalCreates(sidequests.filter((quest) => quest.origin === "local"));
        setReview(reviewRows);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Unable to load saved items");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mapRecords.interactions, data.sidequests, sidequestLifecycle]);

  const savedQuests = review.filter((row) => row.progress.phase === "saved");
  const inProgress = review.filter((row) => row.progress.phase === "in_progress");
  const completed = review.filter((row) => row.progress.phase === "completed");

  return (
    <div className="space-y-8" data-testid="saved-library">
      {offline ? (
        <p className="font-body text-sm text-muted-foreground" data-testid="saved-offline-note">
          Offline — showing progress stored on this device.
        </p>
      ) : null}
      {loading ? <p className="font-body text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="font-body text-sm text-destructive">{error}</p> : null}

      <ProgressSection
        title="In progress"
        empty="No sidequests begun yet."
        rows={inProgress}
        testId="review-in-progress"
      />
      <ProgressSection
        title="Saved for later"
        empty="No saved sidequests yet."
        rows={savedQuests}
        testId="review-saved"
      />
      <ProgressSection
        title="Completed"
        empty="No completions on this device yet."
        rows={completed}
        testId="review-completed"
        showNotes
      />

      <section className="space-y-3">
        <h2 className="font-display text-2xl tracking-[0.04em]">Created locally</h2>
        <p className="font-body text-sm text-muted-foreground">
          Sidequests authored on this device (local origin). Sync stays pending until outbox sync lands.
        </p>
        {localCreates.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">
            No local creates yet.{" "}
            <Link to="/create" className="underline">
              Create one
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {localCreates.map((quest) => (
              <li key={quest.id} className="flex items-center justify-between gap-3 px-3 py-3">
                <div>
                  <p className="font-body text-sm">{quest.title}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    {quest.origin} · {quest.syncStatus} · {quest.category}
                  </p>
                </div>
                <Link to={`/?record=${encodeURIComponent(quest.id)}`} className="font-body text-sm underline">
                  Open on map
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl tracking-[0.04em]">Saved on map</h2>
        <p className="font-body text-sm text-muted-foreground">
          Local bookmarks from the map like/save controls. Not synced remotely yet.
        </p>
        {saved.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">No saved map records yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {saved.map((item) => (
              <li key={item.recordId} className="flex items-center justify-between gap-3 px-3 py-3">
                <div>
                  <p className="font-body text-sm">{item.recordId}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    Updated {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "—"}
                    {item.liked ? " · liked" : ""}
                  </p>
                </div>
                <Link to={`/?record=${encodeURIComponent(item.recordId)}`} className="font-body text-sm underline">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProgressSection({
  title,
  empty,
  rows,
  testId,
  showNotes = false,
}: {
  title: string;
  empty: string;
  rows: ReviewRow[];
  testId: string;
  showNotes?: boolean;
}) {
  return (
    <section className="space-y-3" data-testid={testId}>
      <h2 className="font-display text-2xl tracking-[0.04em]">{title}</h2>
      {rows.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map(({ sidequest, progress }) => (
            <li key={progress.id} className="flex items-center justify-between gap-3 px-3 py-3">
              <div>
                <p className="font-body text-sm">{sidequest.title}</p>
                <p className="font-body text-xs text-muted-foreground">
                  {sidequest.origin} · {progress.phase}
                  {progress.completedAt
                    ? ` · ${new Date(progress.completedAt).toLocaleString()}`
                    : progress.begunAt
                      ? ` · begun ${new Date(progress.begunAt).toLocaleString()}`
                      : ""}
                </p>
                {showNotes && progress.notes ? (
                  <p className="mt-1 font-body text-xs text-muted-foreground">{progress.notes}</p>
                ) : null}
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
    </section>
  );
}
