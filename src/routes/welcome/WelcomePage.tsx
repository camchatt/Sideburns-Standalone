import { Link } from "react-router-dom";
import { BRAND_LOGO_SRC, PRODUCT_NAME } from "@/lib/branding";

export function WelcomePage() {
  return (
    <section className="space-y-6">
      <img
        src={BRAND_LOGO_SRC}
        alt=""
        width={500}
        height={402}
        className="h-28 w-auto sm:h-36"
        decoding="async"
      />
      <h1 className="font-display text-4xl tracking-[0.06em]">Welcome to {PRODUCT_NAME}</h1>
      <p className="max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
        Offline-first sidequests on the Burning Man playa. Browse the map, create and complete quests
        locally, and stay useful without connectivity.
      </p>
      <div className="flex flex-wrap gap-3 font-body text-sm">
        <Link className="underline" to="/">
          Open map
        </Link>
        <Link className="underline" to="/create">
          Create a sidequest
        </Link>
        <Link className="underline" to="/offline-readiness">
          Offline readiness and install guide
        </Link>
      </div>
    </section>
  );
}
