import { useCallback, useRef, useState, type ReactNode } from "react";

const LOCATE_KEY = "sideburns-locate-explained-v1";
const COMPASS_KEY = "sideburns-compass-explained-v1";

type PromptKind = "locate" | "compass";

function readAck(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeAck(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

const COPY: Record<
  PromptKind,
  { title: string; body: string; confirm: string }
> = {
  locate: {
    title: "Use your location?",
    body: "Locate Me uses your device GPS once to place you on the playa map. Your position stays on this device and is not uploaded in this version.",
    confirm: "Continue",
  },
  compass: {
    title: "Use device orientation?",
    body: "Compass rotates the map to match which way your phone is facing. Orientation is used only while the compass is on and is not stored.",
    confirm: "Enable compass",
  },
};

/**
 * Explains why Sidequester needs location / motion before the system prompt.
 * Returns gates for PlayaMap + a modal node to render in the app shell.
 */
export function useSensorPermissionGate(): {
  beforeLocate: () => Promise<boolean>;
  beforeCompass: () => Promise<boolean>;
  prompt: ReactNode;
} {
  const [kind, setKind] = useState<PromptKind | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback((next: PromptKind, storageKey: string) => {
    return new Promise<boolean>((resolve) => {
      if (readAck(storageKey)) {
        resolve(true);
        return;
      }
      resolverRef.current = resolve;
      setKind(next);
    });
  }, []);

  const beforeLocate = useCallback(
    () => ask("locate", LOCATE_KEY),
    [ask],
  );
  const beforeCompass = useCallback(
    () => ask("compass", COMPASS_KEY),
    [ask],
  );

  const finish = (ok: boolean) => {
    if (ok && kind) {
      writeAck(kind === "locate" ? LOCATE_KEY : COMPASS_KEY);
    }
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setKind(null);
  };

  const copy = kind ? COPY[kind] : null;

  const prompt = copy ? (
    <div className="absolute inset-0 z-[590] flex items-end justify-center bg-[#17130f]/55 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8 backdrop-blur-[2px] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sensor-perm-title"
        className="w-full max-w-md rounded-2xl bg-[#f4f0e8] px-5 py-5 text-[#17130f] shadow-[0_16px_48px_rgba(0,0,0,0.4)]"
      >
        <h2
          id="sensor-perm-title"
          className="font-display text-2xl tracking-[0.04em]"
        >
          {copy.title}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[#3f454c]">
          {copy.body}
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => finish(false)}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[#3f454c]/20 px-4 text-[11px] font-semibold uppercase tracking-widest text-[#3f454c]"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => finish(true)}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#17130f] px-4 text-[11px] font-semibold uppercase tracking-widest text-[#f4f0e8]"
          >
            {copy.confirm}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { beforeLocate, beforeCompass, prompt };
}
