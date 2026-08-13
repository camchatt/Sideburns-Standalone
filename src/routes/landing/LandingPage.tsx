export function LandingPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#050505] px-5 py-10 text-white">
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
      </section>
    </main>
  );
}
