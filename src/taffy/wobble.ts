// Hand-drawn "wobble" outline painter, ported verbatim in spirit from the real
// Taffy plugin UI (Source/UI/web/js/app.js). Every card and button outline is a
// real vector path with a low-frequency sine wobble along its perimeter, so the
// linework reads as drawn by hand rather than a rounded rectangle.

const SVGNS = "http://www.w3.org/2000/svg";

// Deterministic PRNG so a given seed always wobbles the same way.
function rng(s: number) {
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];

// Sample points around a rounded rectangle, then push each one along its normal
// by a summed-sine wobble.
function boxPts(w: number, h: number, m: number, amp: number, seed: number): Pt[] {
  const rad = Math.max(4, Math.min(18, Math.min(w, h) / 2 - m - 2));
  const x0 = m, y0 = m, x1 = w - m, y1 = h - m, r = rad, HP = Math.PI / 2;
  const segs: any[] = [
    { t: "l", a: [x0 + r, y0], b: [x1 - r, y0], n: [0, -1] },
    { t: "a", c: [x1 - r, y0 + r], a0: -HP, a1: 0 },
    { t: "l", a: [x1, y0 + r], b: [x1, y1 - r], n: [1, 0] },
    { t: "a", c: [x1 - r, y1 - r], a0: 0, a1: HP },
    { t: "l", a: [x1 - r, y1], b: [x0 + r, y1], n: [0, 1] },
    { t: "a", c: [x0 + r, y1 - r], a0: HP, a1: Math.PI },
    { t: "l", a: [x0, y1 - r], b: [x0, y0 + r], n: [-1, 0] },
    { t: "a", c: [x0 + r, y0 + r], a0: Math.PI, a1: Math.PI * 1.5 },
  ];
  let total = 0;
  segs.forEach((s) => {
    s.len = s.t === "l" ? Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) : (s.a1 - s.a0) * r;
    total += s.len;
  });
  const rn = rng(seed), ph = [rn() * 6.283, rn() * 6.283, rn() * 6.283];
  const wob = (u: number) =>
    amp * (Math.sin(u * 6.283 * 3 + ph[0]) * 0.6 + Math.sin(u * 6.283 * 6 + ph[1]) * 0.3 + Math.sin(u * 6.283 * 9 + ph[2]) * 0.2);
  const P: Pt[] = [], STEP = 11;
  let acc = 0;
  segs.forEach((s) => {
    const n = Math.max(2, Math.round(s.len / STEP));
    for (let k = 0; k < n; k++) {
      const u = k / n;
      let x, y, nx, ny;
      if (s.t === "l") {
        x = s.a[0] + (s.b[0] - s.a[0]) * u; y = s.a[1] + (s.b[1] - s.a[1]) * u; nx = s.n[0]; ny = s.n[1];
      } else {
        const ang = s.a0 + (s.a1 - s.a0) * u;
        x = s.c[0] + Math.cos(ang) * r; y = s.c[1] + Math.sin(ang) * r; nx = Math.cos(ang); ny = Math.sin(ang);
      }
      const wv = wob((acc + s.len * u) / total);
      P.push([x + nx * wv, y + ny * wv]);
    }
    acc += s.len;
  });
  return P;
}

// Catmull-Rom -> cubic Bezier so the wobbled point ring renders as a smooth,
// closed organic curve.
function smooth(P: Pt[]): string {
  const n = P.length;
  let d = "M" + P[0][0].toFixed(1) + " " + P[0][1].toFixed(1);
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += " C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " " + c2y.toFixed(1) + " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
  }
  return d + " Z";
}

// A wobbled outline path for a box of the given size. Exposed for the VU dial's
// glass + GR boxes (which build their own SVG).
export function wobblePath(w: number, h: number, margin: number, amp: number, seed: number): string {
  return smooth(boxPts(w, h, margin, amp, seed));
}

export function hexMix(a: string, b: string, t: number): string {
  a = a.replace("#", ""); b = b.replace("#", "");
  const av = [0, 2, 4].map((i) => parseInt(a.substr(i, 2), 16));
  const bv = [0, 2, 4].map((i) => parseInt(b.substr(i, 2), 16));
  return "#" + av.map((v, i) => Math.round(v + (bv[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export type WobbleOpts = {
  fill?: string; // 'none' | '#hex' | 'g:#top:#bot' | 'busfill'
  stroke?: string; // '#hex' | 'rainbow'
  sw?: number;
  amp?: number;
  shadow?: boolean;
  alpha?: number;
  seed: number;
};

function fillPaint(fill: string, seed: number): { defs: string; paint: string | null } {
  if (!fill || fill === "none") return { defs: "", paint: null };
  if (fill.indexOf("g:") === 0) {
    const p = fill.split(":"), id = "fg" + seed;
    return {
      defs: '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + p[1] + '"/><stop offset="1" stop-color="' + p[2] + '"/></linearGradient>',
      paint: "url(#" + id + ")",
    };
  }
  if (fill === "busfill") {
    const id = "bf" + seed;
    return {
      defs:
        '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#ffc7dd"/><stop offset="0.17" stop-color="#ffdcc0"/><stop offset="0.34" stop-color="#fff0b8"/>' +
        '<stop offset="0.5" stop-color="#c9f1d6"/><stop offset="0.67" stop-color="#c6e3ff"/><stop offset="0.84" stop-color="#dfccff"/><stop offset="1" stop-color="#ffc7dd"/></linearGradient>',
      paint: "url(#" + id + ")",
    };
  }
  return { defs: "", paint: fill };
}

// Build the inner SVG markup for a wobble box at a measured size. Mirrors
// paintBox() in the plugin. Returned string is assigned to an <svg>'s innerHTML.
export function buildWobbleSVG(w: number, h: number, o: WobbleOpts): { viewBox: string; html: string } {
  const sw = o.sw ?? 3.5, amp = o.amp ?? 2.4, shadow = !!o.shadow, alpha = o.alpha ?? 1;
  const fill = o.fill ?? "none", stroke = o.stroke ?? "#2a241d";
  const d = smooth(boxPts(w, h, sw + amp + 2, amp, o.seed));
  const fp = fillPaint(fill, o.seed);
  let defs = fp.defs, body = "";
  if (shadow) body += '<path d="' + d + '" transform="translate(3,4)" fill="rgba(42,36,29,0.15)"/>';
  if (fp.paint) body += '<path d="' + d + '" fill="' + fp.paint + '"' + (alpha < 1 ? ' fill-opacity="' + alpha + '"' : "") + "/>";
  let strokeP = stroke;
  if (stroke === "rainbow") {
    const gid = "gs" + o.seed;
    defs +=
      '<linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#e63946"/><stop offset="0.2" stop-color="#ff6b35"/><stop offset="0.4" stop-color="#e0a000"/>' +
      '<stop offset="0.6" stop-color="#0a9b6c"/><stop offset="0.8" stop-color="#3a86ff"/><stop offset="1" stop-color="#8338ec"/></linearGradient>';
    strokeP = "url(#" + gid + ")";
  }
  body += '<path d="' + d + '" fill="none" stroke="' + strokeP + '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round"/>';
  return { viewBox: "0 0 " + w + " " + h, html: (defs ? "<defs>" + defs + "</defs>" : "") + body };
}

export { SVGNS, boxPts, smooth };
