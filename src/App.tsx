import { useEffect, useRef, useState } from "react";
import Hero from "./components/Hero";
import Builds from "./components/Builds";
import About from "./components/About";
import Writing from "./components/Writing";
import { Analytics } from "@vercel/analytics/react";
import { useReveal } from "./hooks/useReveal";
import { useIsMobile } from "./hooks/useIsMobile";
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
  const isMobile = useIsMobile();

  // Privacy-preserving geo ping: one fire-and-forget beacon per visit. The server
  // logs country/city (Vercel geo headers), never the IP. See api/track.ts.
  useEffect(() => {
    try {
      const body = JSON.stringify({ path: window.location.pathname });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      } else {
        void fetch("/api/track", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        });
      }
    } catch {
      /* analytics must never break the page */
    }
  }, []);

  return (
    <>
      {isMobile ? <MobileApp /> : <DeckApp />}
      {/* Vercel Web Analytics: privacy-friendly visitor/page-view counts. */}
      <Analytics />
    </>
  );
}

// Desktop: the horizontal slide deck. Unchanged from the original single layout.
function DeckApp() {
  const n = SLIDES.length;
  // Track is cloned on both ends ([last, ...slides, first]) for a seamless loop;
  // `pos` indexes that cloned track and starts on the first real slide.
  const [pos, setPos] = useState(1);
  const [animate, setAnimate] = useState(true);
  const [reduce, setReduce] = useState(false);
  // First-visit nudge: fades the moment a visitor actually navigates once, by
  // any method. Session-only state, not persisted.
  const [hasNavigated, setHasNavigated] = useState(false);

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
    setHasNavigated(true);
    lock.current = true;
    setAnimate(true);
    setPos((p) => p + d);
  };
  const goTo = (real: number) => {
    if (lock.current || real + 1 === pos) return;
    setHasNavigated(true);
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

  // A deliberate horizontal trackpad/wheel gesture flips one slide. Attached
  // manually (not React's onWheel) so preventDefault reliably stops the
  // browser's own horizontal-scroll/back-swipe on a genuinely horizontal
  // gesture; vertical wheel scrolling inside a slide is left alone. One move
  // per gesture, however long the gesture takes: a single swipe fires many
  // wheel events, so the first qualifying event moves once and starts a
  // "quiet period" timer that keeps resetting as long as events keep
  // arriving; only once the events stop for 150ms is the gesture considered
  // over and the next swipe allowed to move again.
  const mainRef = useRef<HTMLElement>(null);
  const gestureActive = useRef(false);
  const gestureTimer = useRef<number>();
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) || Math.abs(e.deltaX) < 24) return;
      e.preventDefault();
      if (!gestureActive.current) {
        gestureActive.current = true;
        go(e.deltaX > 0 ? 1 : -1);
      }
      window.clearTimeout(gestureTimer.current);
      gestureTimer.current = window.setTimeout(() => { gestureActive.current = false; }, 150);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Touch swipe on the deck itself (tablets land on this desktop layout, not
  // the mobile stacked one). Only reacts on release, and only to a clearly
  // horizontal drag, so a vertical scroll inside a slide is never hijacked.
  const touch = useRef({ x: 0, y: 0 });
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  const track = [SLIDES[n - 1], ...SLIDES, SLIDES[0]];

  return (
    <DeckContext.Provider value={{ go }}>
      <main
        ref={mainRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="relative h-[100dvh] w-screen overflow-hidden"
      >
        <div
          className="flex h-full"
          style={{
            width: `${track.length * 100}vw`,
            transform: `translateX(-${pos * 100}vw)`,
            transition: animate && !reduce ? "transform 640ms cubic-bezier(0.7, 0, 0.2, 1)" : "none",
          }}
        >
          {track.map((s, i) => {
            // Restrained depth: content sits a layer above the track. The
            // slide that just became active settles in from a small offset
            // with a fade-up; the slide that just left drifts by the same
            // small amount, which (over the same duration as the track's much
            // larger translateX) reads as content trailing slightly behind
            // the track's own motion rather than being glued to it.
            const rel = Math.max(-1, Math.min(1, i - pos));
            return (
              <section
                key={i}
                aria-hidden={i !== pos}
                className="scroll-thin h-full w-screen shrink-0 overflow-y-auto"
              >
                <div
                  // min-h-full inside a slide (Hero, Builds, Writing) needs a
                  // 100%-height reference to center against; this wrapper
                  // must stay h-full so that percentage still resolves to the
                  // section instead of collapsing to auto/content height.
                  className="h-full"
                  style={{
                    transform: `translate(${rel * 40}px, ${rel === 0 ? 0 : 10}px)`,
                    opacity: rel === 0 ? 1 : 0,
                    transition:
                      animate && !reduce
                        ? "transform 640ms cubic-bezier(0.7, 0, 0.2, 1), opacity 420ms ease-out"
                        : "none",
                  }}
                >
                  {s.node}
                </div>
              </section>
            );
          })}
        </div>

        {/* Edge controls to move between slides: solid and readable at rest,
            with the destination slide named on hover. */}
        <DeckEdge dir="left" label={SLIDES[(realIndex - 1 + n) % n].label} onClick={() => go(-1)} />
        <DeckEdge dir="right" label={SLIDES[(realIndex + 1) % n].label} onClick={() => go(1)} />

        {/* scrim so scrolling content fades cleanly under the section nav
            instead of running raggedly behind it */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-24 bg-gradient-to-t from-ink via-ink/85 to-transparent"
        />

        {/* section indicator, with a first-visit nudge stacked directly above
            it so it stays anchored to the nav instead of floating over
            whatever a given slide happens to render underneath. The nudge
            fades the instant a visitor navigates once, by any method (arrows,
            keys, trackpad, swipe, or a dot). */}
        <div className="fixed inset-x-0 bottom-5 z-40 flex flex-col items-center gap-2">
          <div
            aria-hidden="true"
            className={`pointer-events-none rounded-full border border-line/70 bg-ink/85 px-3 py-1 font-sans text-[12px] uppercase tracking-wider text-muted backdrop-blur transition-opacity duration-700 ${
              hasNavigated ? "opacity-0" : "opacity-100"
            }`}
          >
            Scroll, drag, or use the arrows
          </div>
          <nav aria-label="Sections" className="flex items-center justify-center gap-1.5">
          {SLIDES.map((s, j) => {
            const active = j === realIndex;
            return (
              <button
                key={s.id}
                onClick={() => goTo(j)}
                aria-current={active}
                className={`group flex items-center gap-2 rounded-full border px-3 py-1.5 text-[14px] font-medium uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay ${
                  active
                    ? "border-clay/40 bg-clay/10 text-paper"
                    : "border-transparent text-muted hover:text-paper"
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
        </div>
      </main>
    </DeckContext.Provider>
  );
}

// A solid, always-readable control at each screen edge for moving between
// slides, naming its destination on hover ("Builds ->") so the deck reads as
// drivable at a glance instead of relying on a visitor to discover dragging.
function DeckEdge({ dir, label, onClick }: { dir: "left" | "right"; label: string; onClick: () => void }) {
  const left = dir === "left";
  return (
    <button
      onClick={onClick}
      aria-label={`Go to ${label}`}
      className={`group fixed top-1/2 z-40 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-ink/70 text-paper/90 backdrop-blur transition-all duration-300 hover:border-clay/70 hover:bg-ink hover:text-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay sm:flex ${
        left ? "left-5" : "right-5"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
        {left ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
      <span
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-line bg-ink/90 px-3 py-1.5 font-sans text-[13px] font-medium text-paper opacity-0 backdrop-blur transition-all duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 ${
          left ? "left-full ml-3 group-hover:translate-x-0 translate-x-1" : "right-full mr-3 group-hover:translate-x-0 -translate-x-1"
        }`}
      >
        {label} {left ? "←" : "→"}
      </span>
    </button>
  );
}

// Mobile: a native vertical-scroll page. The horizontal deck does not translate
// to touch (no swipe, the 3D carousel, edge controls hidden), so phones get the
// same sections stacked top to bottom with a scroll-spy section bar. The section
// components are reused as-is; Builds renders its grid on mobile (see
// BuildsCarousel), and Hero's CTA scrolls via the DeckContext `go` below.
const MOBILE_SECTIONS = [
  { id: "ask", label: "Ask", node: <Hero /> },
  { id: "builds", label: "Builds", node: <Builds /> },
  { id: "writing", label: "Writing", node: <Writing /> },
  { id: "about", label: "About", node: <About /> },
];

function MobileApp() {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const goTo = (i: number) => {
    const root = scroller.current;
    const el = document.getElementById(MOBILE_SECTIONS[i].id);
    if (!root || !el) return;
    const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    root.scrollTo({ top, behavior: "smooth" });
  };
  // The Hero CTA calls go(1) ("see the work"); on mobile that just scrolls down.
  const go = (d: number) =>
    goTo(Math.max(0, Math.min(MOBILE_SECTIONS.length - 1, active + d)));

  // Scroll-spy: the active section is the last one whose top has crossed the
  // upper third of the viewport. A scroll listener is more reliable than
  // IntersectionObserver ratios here, because each section is taller than the
  // viewport (so its visible ratio never gets large).
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const onScroll = () => {
      const rootTop = root.getBoundingClientRect().top;
      const line = root.clientHeight * 0.35;
      let idx = 0;
      MOBILE_SECTIONS.forEach((s, i) => {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top - rootTop <= line) idx = i;
      });
      setActive(idx);
    };
    onScroll();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <DeckContext.Provider value={{ go }}>
      <main
        ref={scroller}
        className="scroll-thin h-[100dvh] overflow-x-hidden overflow-y-auto scroll-smooth"
      >
        {MOBILE_SECTIONS.map((s) => (
          <div key={s.id}>{s.node}</div>
        ))}
        {/* clear the fixed nav */}
        <div aria-hidden="true" className="h-24" />

        {/* scrim so content fades under the nav rather than running behind it */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-20 bg-gradient-to-t from-ink via-ink/85 to-transparent"
        />

        <nav
          aria-label="Sections"
          className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line/60 bg-ink/85 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        >
          {MOBILE_SECTIONS.map((s, i) => {
            const on = i === active;
            return (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                aria-current={on}
                className={`flex flex-1 flex-col items-center gap-1.5 py-2.5 font-sans text-[11px] font-medium uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay ${
                  on ? "text-paper" : "text-muted"
                }`}
              >
                <span
                  className={`h-1 rounded-full transition-all duration-300 ${
                    on ? "w-6 bg-clay" : "w-1.5 bg-line"
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
