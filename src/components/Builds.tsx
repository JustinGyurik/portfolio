import BuildsCarousel from "./BuildsCarousel";

export default function Builds() {
  return (
    <section id="builds" className="flex min-h-full flex-col justify-center py-16">
      <div className="mx-auto max-w-5xl px-6">
        <div className="reveal mb-12 flex items-end justify-between gap-6">
          <div>
            <div className="mb-3 font-sans text-xs tracking-widest text-clay">SELECTED BUILDS</div>
            <h2 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
              The tracklist
            </h2>
          </div>
          <p className="hidden max-w-xs text-sm text-muted md:block">
            Five things I built end to end. Each one started as a problem I wanted
            to solve and couldn't find the right tool for.
          </p>
        </div>
      </div>

      <div className="reveal mx-auto w-full max-w-[1400px] px-4">
        <BuildsCarousel />
      </div>
    </section>
  );
}
