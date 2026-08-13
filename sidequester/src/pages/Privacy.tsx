import { Link } from "react-router-dom";

/**
 * Lightweight privacy policy for App Store / web review.
 * Host the same copy at a stable public URL when submitting.
 */
export default function Privacy() {
  return (
    <main className="min-h-[100dvh] overflow-y-auto bg-[#17130f] px-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-[#f4f0e8]">
      <div className="mx-auto max-w-lg">
        <p className="text-[10px] uppercase tracking-[0.22em] text-[#f4f0e8]/55">
          Sideburns
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-[0.04em]">
          Privacy
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#f4f0e8]/70">
          Last updated August 5, 2026. Sidequester is an independent playa map
          tool. It is not affiliated with, endorsed by, or sponsored by Burning
          Man Project.
        </p>

        <section className="mt-8 space-y-3">
          <h2 className="text-[11px] uppercase tracking-widest text-[#f4f0e8]/55">
            What we collect
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#f4f0e8]/80">
            <li>
              <strong className="font-semibold text-[#f4f0e8]">Location</strong>{" "}
              — only when you tap Locate Me. Used to show your position on the
              map. We do not stream or store your location on our servers in this
              version.
            </li>
            <li>
              <strong className="font-semibold text-[#f4f0e8]">
                Device orientation
              </strong>{" "}
              — only when you enable the compass. Used to rotate the map to match
              your phone. Not stored.
            </li>
            <li>
              <strong className="font-semibold text-[#f4f0e8]">
                Beacons you create
              </strong>{" "}
              — saved in this device’s local storage so they persist between
              visits. They are not uploaded unless a future sync feature is
              added and you opt in.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-[11px] uppercase tracking-widest text-[#f4f0e8]/55">
            What we don’t do
          </h2>
          <p className="text-sm leading-relaxed text-[#f4f0e8]/80">
            We don’t sell personal data. We don’t use your location for ads. We
            don’t require an account in this version.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-[11px] uppercase tracking-widest text-[#f4f0e8]/55">
            Map imagery
          </h2>
          <p className="text-sm leading-relaxed text-[#f4f0e8]/80">
            Satellite tiles are provided by Esri / Maxar (and related sources)
            under their attribution and terms. Clock rings and city layout are
            approximate for orientation only.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-[11px] uppercase tracking-widest text-[#f4f0e8]/55">
            Contact
          </h2>
          <p className="text-sm leading-relaxed text-[#f4f0e8]/80">
            Questions about this policy: update this section with a support
            email before App Store submission.
          </p>
        </section>

        <Link
          to="/"
          className="mt-10 inline-flex min-h-11 items-center justify-center rounded-full bg-[#f4f0e8] px-5 text-[12px] font-semibold uppercase tracking-widest text-[#17130f]"
        >
          Back to map
        </Link>
      </div>
    </main>
  );
}
