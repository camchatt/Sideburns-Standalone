import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const STORAGE_KEY = "sideburns-legal-ack-v1";

/** One-time disclaimer shown until the user acknowledges. */
export function LegalAckBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== "1") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore quota / private mode */
    }
    setOpen(false);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[580] flex justify-center px-3 pb-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))]">
      <div
        role="dialog"
        aria-label="Legal notice"
        className="pointer-events-auto w-full max-w-md rounded-2xl border border-[#f4f0e8]/15 bg-[#17130f]/94 px-4 py-3.5 text-[#f4f0e8] shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
      >
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#f4f0e8]/55">
          Independent project
        </p>
        <p className="mt-1.5 text-[13px] leading-snug text-[#f4f0e8]/85">
          Sideburns / Sidequester is not affiliated with, endorsed by, or
          sponsored by Burning Man Project. Demo pins are fictional samples.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <Link
            to="/privacy"
            className="min-h-11 inline-flex items-center text-[11px] uppercase tracking-widest text-[#f4f0e8]/65 underline-offset-2 hover:underline"
          >
            Privacy
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#f4f0e8] px-4 text-[11px] font-semibold uppercase tracking-widest text-[#17130f]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
