import { useEffect, useState } from "react";
import type { PlayaPackService } from "@/features/playa-pack/services/playaPackService";
import type { OfflineMapOffer, PlayaPackDownloadProgress } from "@/features/playa-pack/types/playaPack";

type Props = {
  playaPacks: PlayaPackService;
  online: boolean;
  onActivated: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function dismissalKey(offer: OfflineMapOffer): string {
  return `sideburn:offline-map-dismissed:${offer.packId}:${offer.contentVersion}`;
}

export function OfflineMapOnboardingCard({ playaPacks, online, onActivated }: Props) {
  const [offer, setOffer] = useState<OfflineMapOffer | null>(null);
  const [progress, setProgress] = useState<PlayaPackDownloadProgress | null>(null);
  const [state, setState] = useState<"idle" | "downloading" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!online) return;
    void Promise.all([playaPacks.listOfflineMapOffers(), playaPacks.getActivePack()]).then(([offers, installed]) => {
      if (!active) return;
      const next = offers.find((candidate) =>
        candidate.eventYear === null || candidate.eventYear === new Date().getUTCFullYear()
      ) ?? offers[0] ?? null;
      if (!next || (installed?.packId === next.packId && installed.contentVersion === next.contentVersion)) return;
      if (window.localStorage.getItem(dismissalKey(next)) === "true") return;
      setOffer(next);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [online, playaPacks]);

  if (!offer) return null;

  const dismiss = () => {
    window.localStorage.setItem(dismissalKey(offer), "true");
    setOffer(null);
  };

  const prepare = async () => {
    setState("downloading");
    setError(null);
    try {
      await playaPacks.downloadAndActivate(offer.packId, { onProgress: setProgress });
      setState("ready");
      setProgress(null);
      onActivated();
    } catch (reason) {
      setState("idle");
      setError(reason instanceof Error ? reason.message : "Download interrupted. Try again when connected.");
    }
  };

  return (
    <aside className="absolute bottom-[10.25rem] right-3 z-[590] w-[min(22rem,calc(100%-1.5rem))] border border-[#17130f]/15 bg-[#f8f5ee]/95 p-4 text-[#17130f] shadow-lg backdrop-blur-md" aria-label="Offline map preparation">
      <button type="button" onClick={dismiss} className="absolute right-2 top-2 min-h-9 min-w-9 text-lg" aria-label="Dismiss offline map preparation">&times;</button>
      <p className="pr-8 font-display text-xl tracking-wide">{state === "ready" ? "Ready for offline use" : "Take the map with you"}</p>
      <p className="mt-1 text-sm text-[#17130f]/70">
        {state === "ready" ? `${offer.name} is saved on this device.` : `Save ${offer.name} (${formatBytes(offer.totalByteSize)}) before heading out.`}
      </p>
      {progress ? <><p className="mt-3 text-xs" aria-live="polite">Preparing... {Math.round(progress.fraction * 100)}%</p><div className="mt-1 h-2 overflow-hidden bg-[#17130f]/15"><div className="h-full bg-[#17130f]" style={{ width: `${Math.round(progress.fraction * 100)}%` }} /></div></> : null}
      {error ? <p className="mt-2 text-xs text-red-700" role="alert">{error}</p> : null}
      {state !== "ready" ? <button type="button" disabled={!online || state === "downloading"} onClick={() => void prepare()} className="mt-3 min-h-11 w-full bg-[#17130f] px-4 text-sm font-semibold text-[#f8f5ee] disabled:opacity-50">{state === "downloading" ? "Preparing..." : error ? "Try again" : "Prepare offline"}</button> : <button type="button" onClick={dismiss} className="mt-3 min-h-11 w-full border border-[#17130f]/25 px-4 text-sm">Done</button>}
    </aside>
  );
}
