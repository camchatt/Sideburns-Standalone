import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-x-hidden bg-[#050505] px-5 py-10 text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_58%)]"
      />
      <section className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-8 text-center">
        <img
          src="/images/sleep-until-tomorrow.jpg"
          alt="A reminder to rest until tomorrow"
          width={512}
          height={512}
          className="aspect-square w-full max-w-md rounded-2xl object-cover shadow-2xl shadow-black/60"
          decoding="async"
        />
        <h1 className="max-w-2xl text-balance font-display text-4xl leading-tight tracking-[0.06em] sm:text-6xl">
          You must sleep, but we need to fix this tomorrow.
        </h1>
        <div className="max-w-2xl space-y-4 text-left font-body text-base leading-relaxed text-white/80 sm:text-lg">
          <p>
            This is currently pulling from the Sideburns Git repository, not the sidequester branch of Artelier.
          </p>
          <p>
            You will need to take your most recent sideburns-standalone version, push it into a new, separate directory,
            and create a new independent Git repository for it.
          </p>
          <p>
            That new repository should become the source we use to replace the current Sideburns project, without
            depending on Artelier or the existing Sideburns Git history.
          </p>
        </div>
        <Link
          to="/app"
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-white px-6 py-3 font-body text-sm font-semibold uppercase tracking-[0.14em] text-black transition-colors hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-black"
        >
          Open the main page
        </Link>
      </section>
    </main>
  );
}
