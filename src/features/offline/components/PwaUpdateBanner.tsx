import { useEffect, useState } from "react";
import { useAppServices } from "@/app/providers";

/**
 * Non-blocking update prompt. Field sessions continue until the user chooses Apply.
 */
export function PwaUpdateBanner() {
  const { pwa } = useAppServices();
  const [visible, setVisible] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    return pwa.subscribeUpdateAvailable(setVisible);
  }, [pwa]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-body text-sm text-foreground">
          A SIDEBURNS update is ready. Your session keeps running until you apply it.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-11 rounded-md bg-primary px-3 font-body text-sm text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            disabled={applying}
            onClick={() => {
              setApplying(true);
              void pwa.applyUpdate().finally(() => setApplying(false));
            }}
          >
            {applying ? "Applying…" : "Apply update"}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md border border-border px-3 font-body text-sm text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => pwa.dismissUpdatePrompt()}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
