// Track manifest for the Taffy mixer simulation.
//
// Justin drops two audio files per track into public/demos/taffy/:
//   raw/<id>.{mp3|wav}   - the unprocessed mic
//   mix/<id>.{mp3|wav}   - the same mic after Taffy's auto-mix
// If a file is missing the engine synthesizes a stand-in loop so the UI still
// works end to end. See engine.ts.

export type EqBand = {
  type: "highpass" | "lowshelf" | "peaking" | "highshelf" | "lowpass";
  freq: number; // Hz
  gain: number; // dB (ignored for pass filters)
  q: number;
};

export type Track = {
  id: string;
  label: string;
  color: string; // catalog colour, matching the real Taffy roles
  // Role hint used by the placeholder synth so each stand-in loop sounds
  // distinct until the real stems land.
  voice: "kick" | "snare" | "tom" | "hat" | "room";
  pan: number; // -1 (left) .. 1 (right), the starting pan
  rawDb: number; // raw fader, always unity (0) — raw is the un-touched stage
  mixDb: number; // fader the auto-mix settles to (never above unity)
  eqMix?: EqBand[]; // legacy: only used by the synth-fallback render now
};

// Live EQ: each strip has a high-pass, four movable peaking bands (drag up/down
// for gain, left/right for frequency), and a low-pass. Toggles + values are
// user-driven; these are just the defaults. Used by the engine (real biquads)
// and the EQ graph (display + drag).
// Band 1 = low shelf, 2 + 3 = gentle bells, 4 = high shelf. Shelves + low Q
// give smooth tone shaping; the high shelf adds crisp "air" without the
// resonant harshness of a high-Q peak boost.
export const EQ_BAND_DEFAULTS: { type: BiquadFilterType; freq: number; gain: number; q: number }[] = [
  { type: "lowshelf", freq: 90, gain: 0, q: 0.7 },
  { type: "peaking", freq: 500, gain: 0, q: 0.8 },
  { type: "peaking", freq: 2500, gain: 0, q: 0.8 },
  { type: "highshelf", freq: 9000, gain: 0, q: 0.7 },
];
export const EQ_HPF_FREQ = 80; // default high-pass cutoff (off until toggled)
export const EQ_LPF_FREQ = 14000; // default low-pass cutoff (off until toggled)

// One strip's full EQ state.
export type EqState = {
  bands: { freq: number; gain: number }[]; // 4
  hpf: boolean;
  lpf: boolean;
  hpfFreq: number;
  lpfFreq: number;
};
// One strip's compressor state.
export type CompState = {
  on: boolean;
  threshold: number; // dB
  ratio: number;
  attack: number; // s
  release: number; // s
  knee: number; // dB
  makeup: number; // dB
};
// Gentle defaults with a wide soft knee, so engaging the comp eases in rather
// than slamming. Makeup is auto-compensated in the engine, so 0 here is right.
export function defaultComp(): CompState {
  return { on: false, threshold: -16, ratio: 2.5, attack: 0.015, release: 0.18, knee: 10, makeup: 0 };
}
// The bus runs a gentle glue comp on by default (not a brickwall; the engine's
// always-on safety limiter is the real ceiling).
export function defaultBusComp(): CompState {
  return { on: true, threshold: -8, ratio: 2.5, attack: 0.01, release: 0.18, knee: 8, makeup: 0 };
}

export function defaultEq(): EqState {
  return {
    bands: EQ_BAND_DEFAULTS.map((b) => ({ freq: b.freq, gain: b.gain })),
    hpf: false,
    lpf: false,
    hpfFreq: EQ_HPF_FREQ,
    lpfFreq: EQ_LPF_FREQ,
  };
}

// ---- Justin's baked mix ("After Taffy" target) ------------------------------
// Exported verbatim from the demo's "mix settings" box and locked in here. The
// console initializes its EQ + compression to this, and the auto-mix button
// settles to it (faders + pans live on TRACKS.mixDb/pan above). Keys are the
// track ids plus "bus". Reverb is 0..1 (how much reverb is mixed in).
export const MIX_REVERB = 0.23;

export const MIX_EQ: Record<string, EqState> = {
  kick: { bands: [{ freq: 220, gain: 5.3 }, { freq: 379, gain: 1 }, { freq: 2271, gain: 5.4 }, { freq: 7337, gain: -1.2 }], hpf: true, hpfFreq: 80, lpf: true, lpfFreq: 14000 },
  kickout: { bands: [{ freq: 99, gain: 8.9 }, { freq: 238, gain: 8 }, { freq: 1421, gain: -8.3 }, { freq: 9000, gain: 0 }], hpf: true, hpfFreq: 80, lpf: true, lpfFreq: 14000 },
  snare: { bands: [{ freq: 140, gain: 7.3 }, { freq: 301, gain: 2.8 }, { freq: 1522, gain: -6.3 }, { freq: 8147, gain: -2.6 }], hpf: true, hpfFreq: 80, lpf: true, lpfFreq: 14000 },
  snarebot: { bands: [{ freq: 90, gain: 0 }, { freq: 500, gain: 0 }, { freq: 2038, gain: -4.9 }, { freq: 3202, gain: 3.2 }], hpf: true, hpfFreq: 80, lpf: true, lpfFreq: 14000 },
  racktom: { bands: [{ freq: 150, gain: 5.1 }, { freq: 500, gain: 0 }, { freq: 2332, gain: 0.8 }, { freq: 6160, gain: -1.3 }], hpf: true, hpfFreq: 80, lpf: true, lpfFreq: 14000 },
  floortom: { bands: [{ freq: 157, gain: 1.2 }, { freq: 613, gain: -0.1 }, { freq: 2059, gain: -2.9 }, { freq: 4767, gain: 9 }], hpf: true, hpfFreq: 80, lpf: true, lpfFreq: 14000 },
  "oh-left": { bands: [{ freq: 225, gain: -5.8 }, { freq: 829, gain: -9.4 }, { freq: 2726, gain: -6.8 }, { freq: 5735, gain: 2.2 }], hpf: true, hpfFreq: 80, lpf: true, lpfFreq: 14000 },
  "oh-right": { bands: [{ freq: 225, gain: -5.8 }, { freq: 829, gain: -9.4 }, { freq: 2726, gain: -6.8 }, { freq: 5735, gain: 2.2 }], hpf: true, hpfFreq: 80, lpf: true, lpfFreq: 14000 },
  room: { bands: [{ freq: 135, gain: -2.1 }, { freq: 500, gain: 0 }, { freq: 3428, gain: 2.5 }, { freq: 7084, gain: 7.5 }], hpf: true, hpfFreq: 80, lpf: true, lpfFreq: 14000 },
  bus: { bands: [{ freq: 90, gain: 0 }, { freq: 608, gain: -3.4 }, { freq: 2161, gain: -3.6 }, { freq: 6129, gain: 7 }], hpf: true, hpfFreq: 80, lpf: true, lpfFreq: 14000 },
};

export const MIX_COMP: Record<string, CompState> = {
  kick: { on: true, threshold: -29.5, ratio: 6, attack: 0.015, release: 0.131, knee: 30.3, makeup: 0 },
  kickout: { on: true, threshold: -40.9, ratio: 2.5, attack: 0.015, release: 0.18, knee: 28.2, makeup: 0 },
  snare: { on: true, threshold: -8.3, ratio: 1.9, attack: 0.001, release: 0.06, knee: 11.7, makeup: 0 },
  snarebot: { on: true, threshold: -35, ratio: 20, attack: 0.001, release: 0.18, knee: 28.7, makeup: 0 },
  racktom: { on: true, threshold: -22.5, ratio: 7, attack: 0.001, release: 0.046, knee: 16.8, makeup: 0 },
  floortom: { on: true, threshold: -33.7, ratio: 8.8, attack: 0.015, release: 0.18, knee: 24.5, makeup: 0 },
  "oh-left": { on: true, threshold: -44.8, ratio: 5.4, attack: 0.015, release: 0.18, knee: 32.9, makeup: 0 },
  "oh-right": { on: true, threshold: -44.8, ratio: 5.4, attack: 0.015, release: 0.18, knee: 32.9, makeup: 0 },
  room: { on: true, threshold: -48.9, ratio: 3.7, attack: 0.015, release: 0.18, knee: 25.4, makeup: 3.7 },
  bus: { on: true, threshold: -15.9, ratio: 4.4, attack: 0.01, release: 0.225, knee: 8, makeup: 0 },
};

// Deep clones, so the live console state owns mutable copies (editing a strip
// never mutates the baked constants above).
export function mixEq(id: string): EqState {
  const e = MIX_EQ[id] ?? defaultEq();
  return { bands: e.bands.map((b) => ({ ...b })), hpf: e.hpf, hpfFreq: e.hpfFreq, lpf: e.lpf, lpfFreq: e.lpfFreq };
}
export function mixComp(id: string): CompState {
  return { ...(MIX_COMP[id] ?? defaultComp()) };
}

// The stereo drum bus, treated as the master fader. Always at unity by default.
// Its EQ is the gentle "glue" master shape the auto-mix settles to.
export const BUS = {
  id: "bus",
  label: "Bus",
  color: "#8338ec",
  eqMix: [
    { type: "lowshelf", freq: 80, gain: 1.5, q: 0.7 },
    { type: "peaking", freq: 350, gain: -1.5, q: 1.0 },
    { type: "highshelf", freq: 11000, gain: 2, q: 0.7 },
  ] as EqBand[],
};

// Order top-to-bottom on the console. Raw is the unity stage: every fader sits
// at 0 dB until auto-mix moves it (and auto-mix never goes above unity).
export const TRACKS: Track[] = [
  {
    id: "kick",
    label: "Kick In",
    color: "#e63946",
    voice: "kick",
    pan: 0,
    rawDb: 0,
    mixDb: -27.8,
    eqMix: [
      { type: "highpass", freq: 34, gain: 0, q: 0.7 },
      { type: "lowshelf", freq: 70, gain: 3.5, q: 0.7 },
      { type: "peaking", freq: 400, gain: -4, q: 1.1 },
      { type: "peaking", freq: 3500, gain: 3, q: 1.0 },
    ],
  },
  {
    id: "kickout",
    label: "Kick Out",
    color: "#f3727b",
    voice: "kick",
    pan: 0,
    rawDb: 0,
    mixDb: -24.9,
  },
  {
    id: "snare",
    label: "Snare Top",
    color: "#ff6b35",
    voice: "snare",
    pan: 0,
    rawDb: 0,
    mixDb: -9.5,
    eqMix: [
      { type: "highpass", freq: 110, gain: 0, q: 0.7 },
      { type: "peaking", freq: 220, gain: 2.5, q: 0.9 },
      { type: "peaking", freq: 900, gain: -3, q: 1.4 },
      { type: "highshelf", freq: 6000, gain: 4, q: 0.7 },
    ],
  },
  {
    id: "snarebot",
    label: "Snare Bot",
    color: "#ff9c6b",
    voice: "snare",
    pan: 0,
    rawDb: 0,
    mixDb: -40.4,
  },
  {
    id: "racktom",
    label: "Rack Tom",
    color: "#0a9b6c",
    voice: "tom",
    pan: -0.46,
    rawDb: 0,
    mixDb: -31.2,
    eqMix: [
      { type: "highpass", freq: 90, gain: 0, q: 0.7 },
      { type: "peaking", freq: 240, gain: 3, q: 1.1 },
      { type: "peaking", freq: 600, gain: -4.5, q: 1.6 },
      { type: "peaking", freq: 4000, gain: 2.5, q: 1.0 },
    ],
  },
  {
    id: "floortom",
    label: "Floor Tom",
    color: "#5fd0a4",
    voice: "tom",
    pan: 0.35,
    rawDb: 0,
    mixDb: -28.7,
    eqMix: [
      { type: "highpass", freq: 60, gain: 0, q: 0.7 },
      { type: "peaking", freq: 110, gain: 3, q: 1.0 },
      { type: "peaking", freq: 500, gain: -4, q: 1.5 },
      { type: "peaking", freq: 3200, gain: 2, q: 1.0 },
    ],
  },
  {
    id: "oh-left",
    label: "OH L",
    color: "#3a86ff",
    voice: "hat",
    pan: -1,
    rawDb: 0,
    mixDb: -19.7,
    eqMix: [
      { type: "highpass", freq: 260, gain: 0, q: 0.7 },
      { type: "peaking", freq: 700, gain: -2.5, q: 1.2 },
      { type: "highshelf", freq: 9000, gain: 3.5, q: 0.7 },
    ],
  },
  {
    id: "oh-right",
    label: "OH R",
    color: "#6fa6ff",
    voice: "hat",
    pan: 1,
    rawDb: 0,
    mixDb: -19.7,
    eqMix: [
      { type: "highpass", freq: 260, gain: 0, q: 0.7 },
      { type: "peaking", freq: 700, gain: -2.5, q: 1.2 },
      { type: "highshelf", freq: 9000, gain: 3.5, q: 0.7 },
    ],
  },
  {
    id: "room",
    label: "Room",
    color: "#5e60ce",
    voice: "room",
    pan: 0,
    rawDb: 0,
    mixDb: -29,
    eqMix: [
      { type: "highpass", freq: 120, gain: 0, q: 0.7 },
      { type: "peaking", freq: 450, gain: -3, q: 1.0 },
      { type: "highshelf", freq: 7000, gain: 2.5, q: 0.7 },
      { type: "lowpass", freq: 16000, gain: 0, q: 0.7 },
    ],
  },
];

// Candidate file paths, most-preferred first. OGG ships (small + gapless enough
// for a long loop); wav/mp3 are fallbacks if other files are dropped in later.
export function rawSources(id: string): string[] {
  return [`/demos/taffy/raw/${id}.ogg`, `/demos/taffy/raw/${id}.wav`, `/demos/taffy/raw/${id}.mp3`];
}
export function mixSources(id: string): string[] {
  return [`/demos/taffy/mix/${id}.ogg`, `/demos/taffy/mix/${id}.wav`, `/demos/taffy/mix/${id}.mp3`];
}
