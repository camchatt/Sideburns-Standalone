import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const STORAGE_KEY = "sideburns-landing-ack-v2";

/** First-visit introduction shown before entering the map. */
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
    <div
      className="absolute inset-0 z-[580] overflow-y-auto bg-[#120d09] text-[#fff8eb]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgba(12,8,6,0.96) 0%, rgba(12,8,6,0.88) 38%, rgba(12,8,6,0.45) 72%, rgba(12,8,6,0.68) 100%), url('/burning-effigy.gif')",
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div
        role="dialog"
        aria-label="Welcome to Sideburns"
        className="flex min-h-full w-full items-center px-5 py-10 sm:px-10 lg:px-16"
      >
        <div className="w-full max-w-2xl py-[max(1rem,env(safe-area-inset-top))]">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#ffb14a]">
            A living layer of Black Rock City
          </p>
          <h1 className="mt-2 font-['Bebas_Neue'] text-6xl uppercase leading-none tracking-[0.035em] text-white sm:text-7xl">
            Sideburns
          </h1>

          <div className="mt-7 space-y-4 text-[15px] leading-relaxed text-[#fff8eb]/90 sm:text-base">
            <p>
              <strong className="text-[#ffb14a]">Discover.</strong> Sideburns is
              a contribution-based layer of BRC for everything that never makes
              it onto the official map.
            </p>
            <p>
              <strong className="text-[#ffb14a]">Share.</strong> Drop a Sideburn
              for a pop-up party. Gift your leftovers. Point people toward a bike
              repair camp, a weird performance, a patch of shade, a hidden
              treasure, or whatever playa magic is unfolding right now.
            </p>
            <p>
              <strong className="text-[#ffb14a]">Find.</strong> Need a tool during
              build week? Someone might have it. Need a porto immediately? Find
              one. Stumble across something incredible at 3 a.m. and have no idea
              what you just saw? Someone else might know.
            </p>
            <p>
              <strong className="text-[#ffb14a]">Contribute.</strong> Anyone can
              add to it.
            </p>
            <p>
              <strong className="text-[#ffb14a]">Create.</strong> Leave a
              Sideburn. Start a quest. Hide something strange. Send people
              somewhere beautiful. Give the playa a little piece of your own
              weirdness and see where it goes.
            </p>
            <p>
              <strong className="text-[#ffb14a]">Belong.</strong> Sideburns is a
              living, shared layer of playa knowledge, generosity, chaos, and
              discovery, made by Burners for Burners.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#ff9d2e] px-7 text-[12px] font-bold uppercase tracking-[0.16em] text-[#17100a] shadow-[0_0_32px_rgba(255,116,24,0.38)] transition hover:bg-[#ffb14a]"
            >
              Enter Sideburns
            </button>
            <Link
              to="/privacy"
              className="inline-flex min-h-11 items-center text-[11px] uppercase tracking-widest text-white/65 underline-offset-4 hover:text-white hover:underline"
            >
              Privacy
            </Link>
          </div>
          <p className="text-[10px] leading-relaxed text-white/45">
            Independent project. Not affiliated with, endorsed by, or sponsored
            by Burning Man Project. Demo pins are fictional samples.
          </p>
        </div>
      </div>
    </div>
  );
}
