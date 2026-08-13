import { useEffect, useState } from "react";
import { InstallGuide } from "@/features/offline/components/InstallGuide";
import { PlayaPackPanel } from "@/features/playa-pack/components/PlayaPackPanel";
import { useAppServices } from "@/app/providers";
import { APP_SHELL_CACHE_VERSION, PLAYA_PACK_FORMAT_VERSION, SIDEBURNS_MAP_FORMAT_VERSION } from "@/lib/pwa/versioning";
import type { InstallState } from "@/lib/pwa/serviceWorkerBoundary";

export function OfflineReadinessPage() {
  const { pwa, config, data } = useAppServices();
  const [installState, setInstallState] = useState<InstallState>("unknown");
  const [offlineReady, setOfflineReady] = useState(pwa.isOfflineReady());
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    void pwa.getInstallState().then(setInstallState);
    const unsub = pwa.subscribeOfflineReady(setOfflineReady);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [pwa]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-[0.06em]">Offline readiness</h1>
        <p className="mt-2 max-w-2xl font-body text-sm text-muted-foreground">
          Application-shell caching, versioned playa packs, and offline MapLibre basemaps
          (via MapProvider) are available. Download a pack with a map package for field use
          without tile servers.
        </p>
      </div>

      <dl className="grid gap-2 font-body text-sm">
        <div className="flex justify-between gap-4 border-b border-border/60 py-2">
          <dt className="text-muted-foreground">Shell cache version</dt>
          <dd>{APP_SHELL_CACHE_VERSION}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border/60 py-2">
          <dt className="text-muted-foreground">Pack format version</dt>
          <dd>{PLAYA_PACK_FORMAT_VERSION}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border/60 py-2">
          <dt className="text-muted-foreground">Map format version</dt>
          <dd>{SIDEBURNS_MAP_FORMAT_VERSION}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border/60 py-2">
          <dt className="text-muted-foreground">Update strategy</dt>
          <dd>{pwa.getUpdateStrategy()}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border/60 py-2">
          <dt className="text-muted-foreground">Shell offline-ready</dt>
          <dd>{offlineReady ? "yes" : "pending / open once online"}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border/60 py-2">
          <dt className="text-muted-foreground">Network</dt>
          <dd>{online ? "online" : "offline"}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border/60 py-2">
          <dt className="text-muted-foreground">Install state</dt>
          <dd>{installState}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border/60 py-2">
          <dt className="text-muted-foreground">Data provider</dt>
          <dd>{config.env.VITE_DATA_PROVIDER}</dd>
        </div>
      </dl>

      <PlayaPackPanel playaPacks={data.playaPacks} online={online} />

      <InstallGuide />
    </section>
  );
}
