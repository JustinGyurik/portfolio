import { useEffect, useRef, useState } from "react";
import Hero from "./components/Hero";
import Builds from "./components/Builds";
import About from "./components/About";
import Writing from "./components/Writing";
import { useReveal } from "./hooks/useReveal";
import { DeckContext } from "./deck";

// The site is a horizontal slide deck: each section is a full-screen slide and
// you move left/right in an endless loop. No top nav. Inspired by the spatial
// module navigation in the FICO AI platform.
const SLIDES = [
  { id: "ask", label: "Ask", node: <Hero /> },
  { id: "builds", label: "Builds", node: <Builds /> },
  { id: "writing", label: "Writing", node: <Writing /> },
  { id: "about", label: "About", node: <About /> },
];

export default function App() {
  useReveal();
  const n = SLIDES.length;
  // Track is cloned on both ends ([last, ...slides, first]) for a seamless loop;
  // `pos` indexes that cloned track and starts on the first real slide.
  const [pos, setPos] = useState(1);
  const [animate, setAnimate] = useState(true);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const realIndex = (((pos - 1) % n) + n) % n;

  // One move at a time. The lock blocks rapid clicks from sliding off the track
  // before the loop-snap happens.
  const lock = useRef(false);
  const go = (d: number) => {
    if (lock.current) return;
    lock.current = true;
    setAnimate(true);
    setPos((p) => p + d);
  };
  const goTo = (real: number) => {
    if (lock.current || real + 1 === pos) return;
    lock.current = true;
    setAnimate(true);
    setPos(real + 1);
  };

  // After a move settles, snap off either clone onto its real twin (no anim) so
  // the loop is seamless, then unlock. Deterministic timeout instead of
  // transitionend, which bubbles unreliably from descendants.
  useEffect(() => {
    if (!lock.current) return;
    const id = window.setTimeout(() => {
      if (pos === 0) { setAnimate(false); setPos(n); }
      else if (pos === n + 1) { setAnimate(false); setPos(1); }
      lock.current = false;
    }, reduce ? 0 : 660);
    return () => window.clearTimeout(id);
  }, [pos, n, reduce]);

  // Re-enable animation on the frame after a no-animation snap.
  useEffect(() => {
    if (animate) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    return () => cancelAnimationFrame(id);
  }, [animate]);

  // Left/right keys flip slides, but not while typing in the chat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const track = [SLIDES[n - 1], ...SLIDES, SLIDES[0]];

  return (
    <DeckContext.Provider value={{ go }}>
      <main className="relative h-[100dvh] w-screen overflow-hidden">
        <div
          className="flex h-full"
          style={{
            width: `${track.length * 100}vw`,
            transform: `translateX(-${pos * 100}vw)`,
            transition: animate && !reduce ? "transform 640ms cubic-bezier(0.7, 0, 0.2, 1)" : "none",
          }}
        >
          {track.map((s, i) => (
            <section
              key={i}
              aria-hidden={i !== pos}
              className="scroll-thin h-full w-screen shrink-0 overflow-y-auto"
            >
              {s.node}
            </section>
          ))}
        </div>

        {/* minimal edge controls to move between slides; the bottom nav names
            every section, so these stay quiet and icon-only */}
        <DeckEdge dir="left" label={SLIDES[(realIndex - 1 + n) % n].label} onClick={() => go(-1)} />
        <DeckEdge dir="right" label={SLIDES[(realIndex + 1) % n].label} onClick={() => go(1)} />

        {/* scrim so scrolling content fades cleanly under the section nav
            instead of running raggedly behind it */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-24 bg-gradient-to-t from-ink via-ink/85 to-transparent"
        />

        {/* section indicator */}
        <nav
          aria-label="Sections"
          className="fixed inset-x-0 bottom-5 z-40 flex items-center justify-center gap-1.5"
        >
          {SLIDES.map((s, j) => {
            const active = j === realIndex;
            return (
              <button
                key={s.id}
                onClick={() => goTo(j)}
                aria-current={active}
                className={`group flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-medium uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay ${
                  active ? "text-paper" : "text-faint hover:text-muted"
                }`}
              >
                <span
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    active ? "w-6 bg-clay" : "w-1.5 bg-line group-hover:bg-faint"
                  }`}
                />
                {s.label}
              </button>
            );
          })}
        </nav>
      </main>
    </DeckContext.Provider>
  );
}

// A quiet, icon-only control at each screen edge for moving between slides. It
// sits low-key by default and brightens on hover/focus. The bottom nav already
// names every section, so this stays minimal: no labels, no peeking drawer.
function DeckEdge({ dir, label, onClick }: { dir: "left" | "right"; label: string; onClick: () => void }) {
  const left = dir === "left";
  return (
    <button
      onClick={onClick}
      aria-label={`Go to ${label}`}
      className={`group fixed top-1/2 z-40 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line/70 bg-ink/30 text-muted opacity-50 backdrop-blur transition-all duration-300 hover:border-clay/60 hover:bg-ink/50 hover:text-clay hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay sm:flex ${
        left ? "left-5" : "right-5"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        {left ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}
