import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BUILDS, type Build } from "../content/justin";
import { useIsMobile } from "../hooks/useIsMobile";
import BuildMedia from "./BuildMedia";

// Interactive demos are heavy (Web Audio engine, etc.), so they only load when
// a visitor actually launches one.
const TaffyDemo = lazy(() => import("./TaffyDemo"));
const FluentDemo = lazy(() => import("./FluentDemo"));

// A cylindrical wheel of CURVED cards. Each card is built from vertical segments,
// each placed at its own small angle on the rim, so the card surface follows the
// wheel's curve instead of being a flat facet. Cards repeat around the full
// circle (endless) with gaps between them. Drag spins it like a physical wheel.

const SEG = 12; // vertical slices per card -> how smooth each card's curve is
const REF_RATIO = 1.4; // card height / width

function normAngle(a: number) {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

export default function BuildsCarousel() {
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const n = BUILDS.length;
  // Repeat the builds enough to fill the wheel, then derive the angular step so
  // the cards always divide 360 evenly (a true closed circle, any build count).
  const reps = Math.max(2, Math.round(8 / n));
  const cardsAround = n * reps; // total card slots around the wheel
  const STEP = 360 / cardsAround; // degrees between card centers
  const CARD_ANGLE = STEP * 0.88; // each card spans most of its slot (small gap)
  const SEG_ANGLE = CARD_ANGLE / SEG;

  const [rotation, setRotation] = useState(0); // committed wheel angle
  const [zoom, setZoom] = useState<Build | null>(null);
  const [demo, setDemo] = useState<Build | null>(null); // launched interactive demo
  const [reduce, setReduce] = useState(false);
  const isMobile = useIsMobile(); // phones get the simple grid, not the 3D wheel
  const [hoverSlot, setHoverSlot] = useState<number | null>(null); // which neighbor card is hovered
  const [dims, setDims] = useState({ cw: 300, ch: 420, r: 440, persp: 930, segW: 50 });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const cw = Math.round(Math.min(340, Math.max(230, w * 0.27)));
      const ch = Math.round(cw * REF_RATIO);
      const r = Math.round(cw / (2 * Math.sin((CARD_ANGLE / 2) * (Math.PI / 180))));
      const persp = Math.round(cw * 3.0);
      const segW = cw / SEG;
      setDims({ cw, ch, r, persp, segW });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [CARD_ANGLE]);

  const { cw, ch, r, persp, segW } = dims;
  const snap = useCallback((deg: number) => Math.round(deg / STEP) * STEP, [STEP]);

  const activeSlot = ((Math.round(rotation / STEP) % cardsAround) + cardsAround) % cardsAround;
  const activeBuild = activeSlot % n;

  const goToBuild = useCallback(
    (b: number) => {
      let best = rotation;
      let bestD = Infinity;
      for (let s = b; s < cardsAround; s += n) {
        const d = normAngle(s * STEP - rotation);
        if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = rotation + d; }
      }
      setRotation(best);
    },
    [rotation, cardsAround, n, STEP]
  );

  // Drag spins the wheel by writing the track transform directly (no React
  // re-render per frame), then commits + snaps on release.
  const drag = useRef({ x: 0, startRot: 0, active: false, moved: false, cur: 0 });
  const setTrack = (rot: number, animate: boolean) => {
    const t = trackRef.current;
    if (!t) return;
    t.style.transition = animate ? "" : "none";
    t.style.transform = `translateZ(${-r}px) rotateY(${-rot}deg)`;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    // No setPointerCapture here: capturing on the stage redirects the click to
    // the stage and swallows the card's own click-to-zoom. Drag still works via
    // event bubbling from the segments, and onPointerLeave ends a drag that
    // exits the stage.
    drag.current = { x: e.clientX, startRot: rotation, active: true, moved: false, cur: rotation };
    setHoverSlot(null); // spinning by drag clears the neighbor highlight
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 6) d.moved = true;
    d.cur = d.startRot - dx * (STEP / (cw * 0.9));
    setTrack(d.cur, false);
  };
  const endDrag = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const snapped = snap(drag.current.cur);
    if (trackRef.current) trackRef.current.style.transition = "";
    setRotation(snapped);
  };

  useEffect(() => {
    if (!zoom) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [zoom]);

  // The 3D wheel relies on hover + precise drag, which do not translate to touch,
  // and reduced-motion users should not get the spin. Both get a clean card grid.
  if (reduce || isMobile) {
    return (
      <>
        <div className="mx-auto grid max-w-3xl gap-5 px-2 sm:grid-cols-2">
          {BUILDS.map((b) => (
            <button
              key={b.no}
              onClick={() => setZoom(b)}
              className="glass group rounded-2xl p-4 text-left transition hover:border-clay/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
            >
              <CardBody b={b} center />
            </button>
          ))}
        </div>
        {zoom && <ZoomPanel build={zoom} onClose={() => setZoom(null)} onLaunch={setDemo} />}
        {demo && <DemoHost build={demo} onClose={() => setDemo(null)} />}
      </>
    );
  }

  return (
    <>
      <div className="relative">
        <div
          ref={stageRef}
          className="cf-stage focus-visible:outline-none"
          style={{ height: ch + 110, perspective: `${persp}px`, perspectiveOrigin: "50% 50%" }}
          tabIndex={0}
          role="group"
          aria-roledescription="carousel"
          aria-label="Selected builds, on a spinning wheel"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="cf-halo" style={{ width: cw * 1.1, height: ch * 1.05 }} />
          <div
            ref={trackRef}
            className="cf-track"
            style={{ transform: `translateZ(${-r}px) rotateY(${-rotation}deg)` }}
          >
            {Array.from({ length: cardsAround }).map((_, c) => {
              const b = BUILDS[c % n];
              const cardAngle = normAngle(c * STEP - rotation);
              if (Math.abs(cardAngle) > 96) return null; // cull the back half
              const isCenter = Math.abs(cardAngle) < STEP / 2;
              const t = Math.min(1, Math.abs(cardAngle) / 90);
              const brightness = 1 - 0.5 * t;
              const cardOpacity = Math.abs(cardAngle) > 82 ? Math.max(0, (96 - Math.abs(cardAngle)) / 14) : 1;
              const zi = 100 - Math.round(Math.abs(cardAngle));

              // One segment per vertical slice, each tilted a touch more around
              // the rim so the whole card bows along the wheel.
              return Array.from({ length: SEG }).map((__, i) => {
                const segAngle = c * STEP - CARD_ANGLE / 2 + (i + 0.5) * SEG_ANGLE;
                return (
                  <div
                    key={`${c}-${i}`}
                    className={`cf-seg ${isCenter ? "center" : ""} ${
                      !isCenter && hoverSlot === c ? "neighbor-hover" : ""
                    }`}
                    style={{
                      // Overlap each slice slightly so the facet seams close up.
                      width: segW + 2,
                      height: ch,
                      transform: `translate(-50%, -50%) rotateY(${segAngle}deg) translateZ(${r}px)`,
                      zIndex: zi,
                      opacity: cardOpacity,
                      pointerEvents: cardOpacity < 0.5 ? "none" : "auto",
                    }}
                    aria-hidden={!isCenter}
                    // Hovering a side card outlines the whole card (all its slices
                    // share the slot index `c`) as a cue that clicking spins it in.
                    onMouseEnter={() => {
                      if (!isCenter && !drag.current.active) setHoverSlot(c);
                    }}
                    onMouseLeave={() => setHoverSlot((h) => (h === c ? null : h))}
                    onClick={() => {
                      if (drag.current.moved) return;
                      if (isCenter) setZoom(b);
                      else {
                        setHoverSlot(null);
                        setRotation(rotation + cardAngle);
                      }
                    }}
                  >
                    <div
                      className="cf-card glass"
                      style={{
                        width: cw,
                        transform: `translateX(${-i * segW}px)`,
                        filter: isCenter ? "none" : `brightness(${brightness})`,
                      }}
                    >
                      <CardBody b={b} center={isCenter} />
                    </div>
                  </div>
                );
              });
            })}
          </div>
        </div>
      </div>

      {/* The wheel's own position indicator: dots double as jump-to controls.
          No arrows; the side cards highlight on hover to invite the next pick. */}
      <div className="mt-6 flex items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          {BUILDS.map((b, i) => (
            <button
              key={b.no}
              onClick={() => goToBuild(i)}
              aria-label={`Go to ${b.name}`}
              aria-current={i === activeBuild}
              className={`h-2 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay ${
                i === activeBuild ? "w-7 bg-clay" : "w-2 bg-line hover:bg-faint"
              }`}
            />
          ))}
        </div>
        <span className="ml-1 font-sans text-[13px] tracking-wide text-faint">
          {activeBuild + 1} / {n}
        </span>
      </div>
      <p className="mt-3 text-center text-[14px] text-muted">
        Click a side card to bring it forward. Click the front card to open it.
      </p>

      {zoom && <ZoomPanel build={zoom} onClose={() => setZoom(null)} onLaunch={setDemo} />}
      {demo && <DemoHost build={demo} onClose={() => setDemo(null)} />}
    </>
  );
}

// Full-screen host for an interactive build demo. Portaled to <body> so it
// escapes the deck's transformed track (a transformed ancestor would otherwise
// become the containing block for `position: fixed` and break full-screen).
function DemoHost({ build, onClose }: { build: Build; onClose: () => void }) {
  const isMobile = useIsMobile();
  const portrait = useIsPortrait();
  // Taffy is a dense, fixed-size mixing desk: its faders/EQ capture touch (so it
  // cannot be scrolled) and it is far too wide for a phone. On mobile it runs in
  // LANDSCAPE, fit to the screen. In PORTRAIT we render ONLY a rotate prompt and
  // do not mount the console at all -- mounting the heavy (blurred) console and
  // scaling it can blank the whole overlay on iOS WebKit, so it is kept out of the
  // tree until the phone is landscape. An error boundary guards the rest.
  const taffyMobile = isMobile && build.demo === "taffy";
  // In landscape, Taffy is fit to the screen height and centered; fill the side
  // margins with Taffy's own paper color (not black) so it reads as the console
  // on a full sheet of paper rather than a small square in a void.
  const taffyLandscape = taffyMobile && !portrait;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-ink"
      style={taffyLandscape ? { background: "#fdf3e3" } : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`${build.name} demo`}
    >
      {/* Mobile-landscape Taffy: one rotating sky fills the WHOLE screen, behind the
          (transparent) scaled console, so the colorful background reaches the edges. */}
      {taffyLandscape && <div className="taffy-sky" aria-hidden="true" />}
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center font-sans text-xs uppercase tracking-widest text-faint">
            loading…
          </div>
        }
      >
        {build.demo === "taffy" &&
          (taffyMobile ? (
            portrait ? (
              <RotatePrompt onClose={onClose} />
            ) : (
              <DemoErrorBoundary onClose={onClose}>
                <ScaleToFit w={2520} h={1215}>
                  <TaffyDemo onClose={onClose} compact />
                </ScaleToFit>
                <button
                  onClick={onClose}
                  aria-label="Close demo"
                  className="absolute right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-ink/70 text-lg text-paper backdrop-blur transition active:scale-95"
                >
                  ✕
                </button>
              </DemoErrorBoundary>
            )
          ) : (
            <TaffyDemo onClose={onClose} />
          ))}
        {build.demo === "fluent" && <FluentDemo onClose={onClose} />}
      </Suspense>
    </div>,
    document.body
  );
}

// Portrait-only rotate prompt. Self-contained, dead-simple markup (no console, no
// blur, no scaling), so it always renders even where the live console cannot.
function RotatePrompt({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-ink px-10 text-center">
      <svg
        viewBox="0 0 64 64"
        className="h-20 w-20 animate-pulse text-clay"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="13" y="23" width="38" height="24" rx="4" />
        <line x1="44" y1="29" x2="44" y2="41" />
        <path d="M24 12a18 18 0 0 1 19 3" />
        <path d="M24 12l-3-5 6-1" />
      </svg>
      <div className="font-display text-2xl font-semibold tracking-tight text-paper">Rotate your phone</div>
      <p className="max-w-xs text-sm leading-relaxed text-muted">
        Taffy is a full mixing console, built for a wide screen. Turn your phone sideways to run it.
      </p>
      <button
        onClick={onClose}
        aria-label="Close demo"
        className="mt-1 rounded-full border border-line bg-ink/60 px-5 py-2 font-sans text-[13px] uppercase tracking-wide text-paper transition active:scale-95"
      >
        Close
      </button>
    </div>
  );
}

// True while the viewport is taller than it is wide. Dimension-based (not the
// orientation media query) and driven by `resize` so it updates reliably on real
// rotation across browsers.
function useIsPortrait() {
  const get = () => (typeof window === "undefined" ? true : window.innerHeight >= window.innerWidth);
  const [p, setP] = useState(get);
  useEffect(() => {
    const apply = () => setP(window.innerHeight >= window.innerWidth);
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);
  return p;
}

// Catches any render-time crash in a demo (e.g. an audio/canvas API a mobile
// browser does not support) and shows a graceful message instead of a blank screen.
class DemoErrorBoundary extends Component<{ onClose: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error("demo_error_boundary", err);
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="font-display text-xl text-paper">This demo couldn't run on your device</div>
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            The live mixer is heavy for mobile browsers. It runs great on a desktop browser.
          </p>
          <button
            onClick={this.props.onClose}
            className="mt-1 rounded-full border border-line bg-ink/60 px-5 py-2 font-sans text-[13px] uppercase tracking-wide text-paper"
          >
            Close
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Shrinks a fixed-size child to fit the viewport (the Taffy console on phones).
// Uses CSS `zoom` rather than `transform: scale` on purpose: `zoom` reflows the
// console to the smaller size, whereas a scaled transform composites one huge
// blurred layer that iOS WebKit can fail to paint (blank). Recomputes on rotate.
function ScaleToFit({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  const [scale, setScale] = useState(() =>
    typeof window === "undefined" ? 0.3 : Math.min(window.innerWidth / w, window.innerHeight / h)
  );
  useLayoutEffect(() => {
    const compute = () => setScale(Math.min(window.innerWidth / w, window.innerHeight / h));
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, [w, h]);
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
      <div style={{ width: w, height: h, zoom: scale }}>{children}</div>
    </div>
  );
}

// Image-forward: the screenshot fills the whole card, copy sits over a scrim
// at the bottom so there is no dark/empty top.
function CardBody({ b, center }: { b: Build; center: boolean }) {
  return (
    <div className="flex h-full w-full flex-col bg-coal">
      {/* Full-width screenshot at the top: both edges visible, nothing cropped. */}
      <div className="border-b border-line/60">
        <BuildMedia src={b.image} alt={b.imageAlt} name={b.name} no={b.no} chrome={false} top />
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <div className="mb-1.5 flex items-center justify-between font-sans text-[12px] uppercase tracking-wider">
          <span className="text-faint">{b.no}</span>
          <span className="text-clay">{b.status}</span>
        </div>
        <h3 className="font-display text-xl font-medium leading-tight tracking-tight text-paper">
          {b.name}
        </h3>
        <div className="mt-1 font-sans text-[13px] uppercase tracking-wider text-clay/80">
          {b.kind}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-paper/80">{b.oneliner}</p>
        {center && (
          <div className="mt-auto flex items-center gap-2 pt-4 font-sans text-[13px] uppercase tracking-wider text-paper/80">
            <span className="iris-text font-semibold">Zoom in</span>
            <span aria-hidden="true">↗</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ZoomPanel({
  build: b,
  onClose,
  onLaunch,
}: {
  build: Build;
  onClose: () => void;
  onLaunch: (b: Build) => void;
}) {
  // Portaled to <body>: the page is a horizontal slide-deck whose track is
  // `transform`-translated, and a transformed ancestor becomes the containing
  // block for `position: fixed`, which would shove this off-center (to the
  // active slide's offset). Same reason DemoHost is portaled.
  return createPortal(
    <div
      className="zoom-backdrop fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={b.name}
      onClick={onClose}
    >
      <div
        className="zoom-panel iri-spin glass glass-blur relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-ink/60 text-paper transition hover:border-clay hover:text-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
        >
          ✕
        </button>
        <div className="p-6 sm:p-8">
          <div className="mb-5 overflow-hidden rounded-xl border border-line">
            <BuildMedia src={b.image} alt={b.imageAlt} name={b.name} no={b.no} chrome={false} top />
          </div>
          <div className="flex items-center justify-between font-sans text-[13px] uppercase tracking-wider">
            <span className="text-faint">{b.no} / studio</span>
            <span className="text-clay">{b.status}</span>
          </div>
          <h3 className="mt-2 break-words font-display text-2xl font-semibold tracking-tight text-paper sm:text-3xl">
            {b.name}
          </h3>
          <div className="mt-1 break-words font-sans text-xs uppercase tracking-wider text-clay/80">
            {b.kind}
          </div>
          <p className="mt-4 max-w-2xl break-words leading-relaxed text-paper/90">{b.detail}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {b.stack.map((s) => (
              <span
                key={s}
                className="rounded-full border border-line bg-panel/60 px-3 py-1 font-sans text-[13px] text-muted"
              >
                {s}
              </span>
            ))}
          </div>
          {b.demo && (
            <div className="mt-7 border-t border-line/60 pt-5">
              <button
                onClick={() => {
                  onLaunch(b);
                  onClose();
                }}
                className="iris-ring group inline-flex items-center gap-2.5 rounded-full border border-clay/50 px-5 py-2.5 text-sm font-semibold text-paper transition hover:border-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
                style={{ background: "linear-gradient(180deg, rgba(155,124,255,0.22), rgba(109,74,224,0.16))" }}
              >
                <span aria-hidden="true">▶</span>
                {b.demoLabel || "Try it out"}
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
              </button>
              <p className="mt-2 font-sans text-[13px] tracking-wide text-faint">
                Runs live, right here in the browser.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
