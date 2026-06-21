import { EXPERIENCE, FACTS, PROFILE } from "../content/justin";

export default function About() {
  return (
    <section id="about" className="bg-coal/60 px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="reveal mb-12">
          <div className="mb-3 font-sans text-xs tracking-widest text-clay">THE THREAD</div>
          <h2 className="max-w-3xl font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            I care more about whether people actually got better than whether
            they finished. Most of what I build comes back to that.
          </h2>
        </div>

        <div className="grid gap-12 md:grid-cols-[1.3fr_1fr]">
          <div className="reveal">
            <ol className="relative border-l border-line">
              {EXPERIENCE.map((e) => (
                <li key={e.role} className="mb-9 ml-6">
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-clay" />
                  <div className="font-sans text-[13px] tracking-wider text-faint">{e.years}</div>
                  <h3 className="mt-1 font-display text-lg font-medium text-paper">{e.role}</h3>
                  <div className="text-sm text-clay">{e.org}</div>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{e.notes}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="reveal space-y-8">
            <div>
              <div className="mb-3 font-sans text-[13px] uppercase tracking-wider text-faint">
                Stack
              </div>
              <div className="space-y-3">
                {Object.entries(FACTS.stack).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-xs font-medium text-clay">{k}</div>
                    <div className="text-sm text-muted">{v.join(" · ")}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-3 font-sans text-[13px] uppercase tracking-wider text-faint">
                Foundations
              </div>
              <ul className="space-y-2">
                {FACTS.education.map((e) => (
                  <li key={e} className="text-sm leading-snug text-muted">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Contact (the deck has no footer). */}
        <div className="reveal mt-14 flex flex-col items-start justify-between gap-6 border-t border-line pt-10 md:flex-row md:items-end">
          <div>
            <div className="font-display text-2xl font-semibold tracking-tight">Want to talk?</div>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Happy to walk you through any of this, or just trade notes. Email is
              the easiest way to reach me.
            </p>
          </div>
          <div className="flex flex-col gap-1 font-sans text-sm">
            <a
              href={`mailto:${PROFILE.email}`}
              className="rounded text-clay transition hover:text-amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
            >
              {PROFILE.email}
            </a>
            <a
              href={PROFILE.linkedin}
              target="_blank"
              rel="noreferrer"
              className="rounded text-muted transition hover:text-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
            >
              LinkedIn ↗
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
