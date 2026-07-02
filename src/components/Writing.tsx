import { useEffect, useRef, useState } from "react";
import { ARTICLE } from "../content/article";

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// The "Writing" slide: Justin's essay, published and typeset for reading. A wide
// measured column with a sticky section guide on the side that tracks where you
// are and lets you jump. Top aligned and scrollable (the deck section wraps it
// in an overflow-y-auto region).
export default function Writing() {
  const sections = ARTICLE.blocks
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.type === "h2")
    .map(({ b }) => ({ id: slug(b.text), text: b.text }));

  const [active, setActive] = useState(0);
  const headingRefs = useRef<Record<string, HTMLHeadingElement | null>>({});

  // Scroll-spy: the heading sitting in the top quarter of the viewport is active.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const idx = Number((visible[0].target as HTMLElement).dataset.idx);
          if (!Number.isNaN(idx)) setActive(idx);
        }
      },
      { rootMargin: "0px 0px -76% 0px", threshold: 0 }
    );
    Object.values(headingRefs.current).forEach((h) => h && io.observe(h));
    return () => io.disconnect();
  }, []);

  // Scroll the actual scrollable ancestor (the deck slide) to the heading. The
  // article's own wrapper is not the scroll container, so scrollIntoView is
  // unreliable here; compute the offset explicitly.
  const jump = (id: string) => {
    const el = headingRefs.current[id];
    if (!el) return;
    let sc: HTMLElement | null = el.parentElement;
    while (sc && sc.scrollHeight <= sc.clientHeight + 4) sc = sc.parentElement;
    if (!sc) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 24;
    sc.scrollTo({ top, behavior: "smooth" });
  };

  let h2Index = -1;

  return (
    <section id="writing" className="min-h-full">
      <div className="mx-auto flex max-w-[1060px] gap-12 px-6 py-16 pb-32 lg:gap-16">
        {/* dynamic section guide */}
        <nav
          aria-label="Article sections"
          className="reveal sticky top-20 hidden h-fit w-[190px] shrink-0 self-start lg:block"
        >
          <div className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-clay">
            Sections
          </div>
          <ul className="space-y-1">
            {sections.map((s, i) => {
              const on = i === active;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => jump(s.id)}
                    className={`flex w-full items-start gap-3 rounded-lg py-1.5 pl-3 pr-2 text-left text-[15px] leading-snug transition ${
                      on ? "bg-clay/10 text-paper" : "text-faint hover:text-muted"
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-[2px] shrink-0 rounded-full transition-all duration-300 ${
                        on ? "w-6 bg-clay" : "w-3 bg-line"
                      }`}
                    />
                    <span className={on ? "font-medium" : ""}>{s.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* the essay */}
        <article className="reveal min-w-0 max-w-[720px] flex-1">
          <div className="mb-3 flex items-center gap-3 text-[14px] tracking-wide text-clay">
            <span className="font-semibold uppercase">Writing</span>
            <span className="text-faint">·</span>
            <span className="text-faint">{ARTICLE.readingTime}</span>
          </div>

          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight md:text-[52px]">
            {ARTICLE.title}
          </h1>
          <p className="mt-4 text-xl leading-snug text-muted">{ARTICLE.subtitle}</p>

          <p className="iris-text mt-7 border-l-2 border-clay/50 pl-5 font-display text-xl italic">
            {ARTICLE.epigraph}
          </p>

          <div className="mt-12 space-y-6">
            {ARTICLE.blocks.map((b, i) => {
              if (b.type === "h2") {
                h2Index += 1;
                const idx = h2Index;
                const id = slug(b.text);
                return (
                  <h2
                    key={i}
                    id={id}
                    data-idx={idx}
                    ref={(el) => (headingRefs.current[id] = el)}
                    className="scroll-mt-20 pt-6 font-display text-[30px] font-medium leading-tight tracking-tight text-paper"
                  >
                    {b.text}
                  </h2>
                );
              }
              if (b.type === "fig") {
                return (
                  <figure
                    key={i}
                    className="my-2 flex items-center gap-3 rounded-xl border border-dashed border-line bg-panel/40 px-4 py-3"
                  >
                    <span aria-hidden="true" className="text-clay/70">▦</span>
                    <figcaption className="text-[14px] uppercase tracking-wider text-faint">
                      {b.text}
                    </figcaption>
                  </figure>
                );
              }
              return (
                <p key={i} className="text-[18px] leading-[1.75] text-paper/85">
                  {b.text}
                </p>
              );
            })}
          </div>

          <div className="mt-14 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/60 pt-6 text-[14px] uppercase tracking-wider text-faint">
            <span>Justin Gyurik</span>
            <span className="text-line">/</span>
            <a href="mailto:justingyurik@gmail.com" className="transition hover:text-clay">
              justingyurik@gmail.com
            </a>
          </div>
        </article>
      </div>
    </section>
  );
}
