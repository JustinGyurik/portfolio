// Biquad magnitude response (RBJ Audio EQ Cookbook) so we can draw an EQ curve
// that matches what the real filters would do. Display only: the mixer never
// runs these on the audio, it just renders the shape.
import type { EqBand } from "./tracks";

const FS = 48000;

type Coef = { b0: number; b1: number; b2: number; a0: number; a1: number; a2: number };

function coefs(band: EqBand): Coef {
  const A = Math.pow(10, band.gain / 40);
  const w0 = (2 * Math.PI * band.freq) / FS;
  const cw = Math.cos(w0);
  const sw = Math.sin(w0);
  const alpha = sw / (2 * band.q);
  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

  switch (band.type) {
    case "highpass":
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
      break;
    case "lowpass":
      b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2;
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
      break;
    case "peaking":
      b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
      break;
    case "lowshelf": {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cw + s);
      b1 = 2 * A * (A - 1 - (A + 1) * cw);
      b2 = A * (A + 1 - (A - 1) * cw - s);
      a0 = A + 1 + (A - 1) * cw + s;
      a1 = -2 * (A - 1 + (A + 1) * cw);
      a2 = A + 1 + (A - 1) * cw - s;
      break;
    }
    case "highshelf": {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cw + s);
      b1 = -2 * A * (A - 1 + (A + 1) * cw);
      b2 = A * (A + 1 + (A - 1) * cw - s);
      a0 = A + 1 - (A - 1) * cw + s;
      a1 = 2 * (A - 1 - (A + 1) * cw);
      a2 = A + 1 - (A - 1) * cw - s;
      break;
    }
  }
  return { b0, b1, b2, a0, a1, a2 };
}

function magDb(c: Coef, freq: number): number {
  const w = (2 * Math.PI * freq) / FS;
  const cosw = Math.cos(w), sinw = Math.sin(w);
  const cos2 = Math.cos(2 * w), sin2 = Math.sin(2 * w);
  const numRe = c.b0 + c.b1 * cosw + c.b2 * cos2;
  const numIm = -(c.b1 * sinw + c.b2 * sin2);
  const denRe = c.a0 + c.a1 * cosw + c.a2 * cos2;
  const denIm = -(c.a1 * sinw + c.a2 * sin2);
  const num = Math.sqrt(numRe * numRe + numIm * numIm);
  const den = Math.sqrt(denRe * denRe + denIm * denIm) || 1e-9;
  return 20 * Math.log10(num / den);
}

// Total response in dB across a set of bands at a given frequency.
export function responseDb(bands: EqBand[], freq: number): number {
  let sum = 0;
  for (const b of bands) sum += magDb(coefs(b), freq);
  return sum;
}

// Build an SVG path string for the curve across the audible range, mapped into
// a [width x height] box. dbRange is the +/- dB the box spans.
export function curvePath(
  bands: EqBand[],
  width: number,
  height: number,
  steps = 64,
  dbRange = 15
): string {
  const fMin = 20, fMax = 20000;
  const logMin = Math.log10(fMin), logMax = Math.log10(fMax);
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const f = Math.pow(10, logMin + t * (logMax - logMin));
    const db = Math.max(-dbRange, Math.min(dbRange, responseDb(bands, f)));
    const x = t * width;
    const y = height / 2 - (db / dbRange) * (height / 2 - 2);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
  }
  return d.trim();
}
