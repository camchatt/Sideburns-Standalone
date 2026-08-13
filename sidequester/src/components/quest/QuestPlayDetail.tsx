import { useMemo, useRef, useState } from "react";
import {
  currentStopIndex,
  evaluateQuestPresence,
  type QuestThread,
  type QuestThreadProgress,
  type UserLocation,
} from "@artelier/playa-core";
import { Camera } from "lucide-react";

type Props = {
  thread: QuestThread;
  progress: QuestThreadProgress;
  location: UserLocation | null;
  onCompleteStop: (
    stopId: string,
    guess?: string,
    options?: { photoCaptured?: boolean },
  ) => { ok: true; finished: boolean } | { ok: false; reason: string };
  onClose: () => void;
  /** Mobile sheet already shows title in the peek row. */
  compact?: boolean;
};

export function QuestPlayDetail({
  thread,
  progress,
  location,
  onCompleteStop,
  onClose,
  compact = false,
}: Props) {
  const [guess, setGuess] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [snapPreview, setSnapPreview] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const current = currentStopIndex(thread, progress);
  const finished = Boolean(progress.finishedAt);
  const stop = !finished ? thread.stops[current] : null;
  const stopN = Math.min(current + 1, thread.stops.length);

  const presence = useMemo(() => {
    if (!stop || stop.check.type !== "presence") return null;
    return evaluateQuestPresence({ site: stop, location });
  }, [stop, location]);

  const attempt = (options?: { photoCaptured?: boolean }) => {
    if (!stop) return;
    const result = onCompleteStop(
      stop.id,
      stop.check.type === "answer" ? guess : undefined,
      options,
    );
    if (result.ok === false) {
      setNote(
        result.reason === "Not quite — try again."
          ? "Not quite — try another reading."
          : result.reason,
      );
      return;
    }
    setGuess("");
    setShowHint(false);
    setSnapPreview(null);
    setNote(
      result.finished
        ? `The thread closes. Claim: ${thread.reward}`
        : "The thread loosens. Next stop revealed.",
    );
  };

  const onSnap = (file: File | null) => {
    if (!file || !stop) return;
    const url = URL.createObjectURL(file);
    setSnapPreview(url);
    attempt({ photoCaptured: true });
  };

  return (
    <div className="space-y-2.5" aria-label={`${thread.title} quest`}>
      {compact ? (
        <p className="text-[10px] uppercase tracking-widest text-foreground/50">
          {finished
            ? "Complete"
            : `Beat ${stopN} of ${thread.stops.length}`}
        </p>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-foreground/50">
              {finished
                ? "Complete"
                : `Beat ${stopN} of ${thread.stops.length}`}
            </p>
            <h3 className="mt-0.5 font-display text-xl leading-none tracking-[0.03em] text-foreground/90">
              {thread.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 shrink-0 px-2 text-[10px] uppercase tracking-widest text-foreground/45"
          >
            Close
          </button>
        </div>
      )}

      {finished ? (
        <div className="space-y-2">
          <p className="font-display text-xl leading-snug tracking-[0.02em] text-[#1f6b4f]">
            You walked the whole thread.
          </p>
          <p className="text-[14px] leading-snug text-foreground/75">
            {thread.pitch}
          </p>
          <p className="flex items-baseline gap-2 text-[13px]">
            <span className="text-[10px] uppercase tracking-widest text-[#e8912e]">
              Claim
            </span>
            <span className="text-foreground/80">{thread.reward}</span>
          </p>
        </div>
      ) : stop ? (
        <div className="space-y-2.5">
          <p className="font-display text-[1.35rem] leading-snug tracking-[0.02em] text-foreground/90">
            {stop.clue}
          </p>

          {stop.clueImage ? (
            <img
              src={stop.clueImage}
              alt="What to look for"
              className="aspect-[16/10] w-full rounded-xl object-cover"
            />
          ) : null}

          {stop.hint ? (
            stop.check.type === "presence" ? (
              <p className="text-[13px] leading-snug text-foreground/70">
                {stop.hint}
              </p>
            ) : showHint ? (
              <p className="text-[13px] leading-snug text-foreground/55">
                {stop.hint}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setShowHint(true)}
                className="text-[11px] uppercase tracking-widest text-foreground/40"
              >
                Need a nudge?
              </button>
            )
          ) : null}

          {stop.check.type === "answer" ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!guess.trim()) return;
                attempt();
              }}
            >
              <input
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="Offer the phrase…"
                className="min-h-11 min-w-0 flex-1 rounded-full border border-[#3f454c]/15 bg-[#f4f0e8] px-3.5 text-[14px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c44569]/55"
              />
              <button
                type="submit"
                disabled={!guess.trim()}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#c44569] px-4 text-[11px] uppercase tracking-widest text-[#fff0f4] disabled:opacity-35"
              >
                Offer
              </button>
            </form>
          ) : stop.check.type === "photo" ? (
            <div className="space-y-2">
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  onSnap(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              {snapPreview ? (
                <img
                  src={snapPreview}
                  alt="Your snap"
                  className="aspect-[16/10] w-full rounded-xl object-cover opacity-90"
                />
              ) : null}
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#c44569] px-4 text-[11px] uppercase tracking-widest text-[#fff0f4]"
              >
                <Camera className="h-3.5 w-3.5" aria-hidden />
                Snap what you found
              </button>
              <p className="text-[11px] text-foreground/45">
                Your photo stays on this device — it’s just the proof.
              </p>
            </div>
          ) : presence ? (
            <div className="space-y-1.5">
              <p className="text-[12px] text-foreground/55">
                {presence.distanceM != null
                  ? `${Math.round(presence.distanceM)} m away`
                  : "Waiting on GPS…"}
                {presence.note ? ` · ${presence.note}` : ""}
              </p>
              <button
                type="button"
                disabled={presence.status !== "ready"}
                onClick={() => attempt()}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#c44569] px-4 text-[11px] uppercase tracking-widest text-[#fff0f4] disabled:opacity-40"
              >
                {presence.status === "ready" ? "I made it" : presence.label}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!finished ? (
        <p className="flex items-baseline gap-2 border-t border-[#3f454c]/8 pt-2 text-[12px] text-foreground/45">
          <span className="text-[10px] uppercase tracking-widest text-[#e8912e]/90">
            Gift
          </span>
          <span className="min-w-0 truncate">{thread.reward}</span>
        </p>
      ) : null}

      {note ? (
        <p className="text-[12px] leading-snug text-foreground/60" aria-live="polite">
          {note}
        </p>
      ) : null}
    </div>
  );
}
