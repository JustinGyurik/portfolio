import { useEffect, useRef } from "react";

// A living waveform: the studio motif. Bars breathe on a sine field and
// respond subtly to the pointer. Pure canvas, 60fps, reduced-motion aware.
export default function Waveform() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvRaw = ref.current;
    if (!cvRaw) return;
    const cRaw = cvRaw.getContext("2d");
    if (!cRaw) return;
    const cv: HTMLCanvasElement = cvRaw;
    const c: CanvasRenderingContext2D = cRaw;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;
    let mx = 0.5;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function onMove(e: PointerEvent) {
      const r = cv.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width;
    }
    window.addEventListener("pointermove", onMove);

    function draw() {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      c.clearRect(0, 0, w, h);
      const bars = Math.max(28, Math.floor(w / 14));
      const gap = w / bars;
      const mid = h / 2;
      for (let i = 0; i < bars; i++) {
        const p = i / bars;
        const focus = 1 - Math.min(1, Math.abs(p - mx) * 2.2);
        const env = Math.sin(p * Math.PI); // taller in the middle
        const wave =
          Math.sin(p * 9 + t * 1.4) * 0.5 +
          Math.sin(p * 17 - t * 0.9) * 0.3 +
          Math.sin(p * 4 + t * 0.5) * 0.2;
        const amp = (0.18 + 0.5 * env + 0.4 * focus) * (0.5 + 0.5 * wave);
        const barH = Math.max(2, amp * h * 0.42);
        const x = i * gap + gap * 0.5;
        // Iridescent hue sweeps across the field (violet -> magenta -> cyan)
        // and drifts slowly over time for an oil-slick shimmer.
        const hue = 258 + Math.sin(p * 3.0 + t * 0.5) * 52; // ~206 (cyan) to ~310 (magenta)
        const a = 0.22 + focus * 0.55;
        const g = c.createLinearGradient(0, mid - barH, 0, mid + barH);
        g.addColorStop(0, `hsla(${hue + 18}, 90%, 74%, ${a})`);
        g.addColorStop(0.5, `hsla(${hue}, 85%, 66%, ${a + 0.12})`);
        g.addColorStop(1, `hsla(${hue - 22}, 80%, 58%, ${a})`);
        c.fillStyle = g;
        const bw = Math.max(2, gap * 0.42);
        roundRect(c, x - bw / 2, mid - barH, bw, barH * 2, bw / 2);
        c.fill();
      }
      if (!reduce) {
        t += 0.018;
        raf = requestAnimationFrame(draw);
      }
    }
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} className="h-full w-full" aria-hidden="true" />;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
