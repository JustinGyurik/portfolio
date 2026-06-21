// Web Audio engine behind the Taffy mixer simulation.
//
// Each track has two looped, sample-aligned sources: "raw" (the unprocessed
// mic) and "mix" (after Taffy's auto-mix). Both run continuously; the auto-mix
// button just crossfades every channel from raw to mix. Faders, mute, and solo
// are real and audible. Metering is real (post-fader, post-mute) off an
// AnalyserNode per channel.
//
// Real stems load from public/demos/taffy/{raw,mix}/<id>.{mp3,wav}. When a file
// is missing, a stand-in loop is synthesized so the whole console still works.
import {
  TRACKS,
  EQ_BAND_DEFAULTS,
  rawSources,
  mixSources,
  type Track,
  type EqState,
  type CompState,
} from "./tracks";

// Transparent safety limiter, NOT a color/distortion stage. It passes normal
// levels through perfectly clean (linear below the knee) and only rounds peaks
// that approach full scale, asymptoting to a hard ceiling below 0 dBFS. It is
// wired onto every channel AND the master and is always on, so nothing in the
// system can ever clip or "blow out", no matter how the comp/EQ/faders are set.
const SAFETY_KNEE = 0.5; // transparent below this; soft-knee limiting above
const SAFETY_A = 0.85; // sets the ceiling: x=1 -> ~0.95, peaks past 1 stay capped
function makeSafetyCurve(): Float32Array<ArrayBuffer> {
  const n = 2048;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    let y = ax;
    if (ax > SAFETY_KNEE) {
      // soft asymptote: smoothly bends the region above the knee toward a ceiling
      y = SAFETY_KNEE + SAFETY_A * Math.tanh((ax - SAFETY_KNEE) / SAFETY_A);
    }
    c[i] = Math.sign(x) * y;
  }
  return c;
}

// How much of the gain reduction the auto-makeup gives back. Below 1.0 so
// engaging the comp is loudness-neutral-to-slightly-quieter, never louder.
const AUTO_MAKEUP_FRAC = 0.65;
// Set only the compressor params. Makeup gain is owned by the auto-makeup loop
// (so engaging the comp is loudness-neutral, never louder) and the safety
// limiter curve on the shaper is always on. When off, the comp is neutral
// (threshold 0, ratio 1) so it passes through clean.
function applyCompNodes(ctx: AudioContext, comp: DynamicsCompressorNode, c: CompState) {
  const t = ctx.currentTime;
  if (c.on) {
    comp.threshold.setTargetAtTime(c.threshold, t, 0.01);
    comp.ratio.setTargetAtTime(c.ratio, t, 0.01);
    comp.attack.setTargetAtTime(c.attack, t, 0.01);
    comp.release.setTargetAtTime(c.release, t, 0.01);
    comp.knee.setTargetAtTime(c.knee, t, 0.01);
  } else {
    comp.threshold.setTargetAtTime(0, t, 0.01);
    comp.ratio.setTargetAtTime(1, t, 0.01);
    comp.knee.setTargetAtTime(0, t, 0.01);
  }
}

const dbToGain = (db: number) => Math.pow(10, db / 20);

function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

type Channel = {
  track: Track;
  rawSrc: AudioBufferSourceNode | null;
  mixSrc: AudioBufferSourceNode | null;
  rawGain: GainNode; // raw leg of the crossfade
  mixGain: GainNode; // mixed leg of the crossfade
  fader: GainNode; // user fader (dB)
  mute: GainNode; // 0/1, ramped (covers mute + solo)
  panner: StereoPannerNode;
  eq: BiquadFilterNode[]; // live, user-driven EQ (default flat)
  comp: DynamicsCompressorNode;
  makeup: GainNode;
  shaper: WaveShaperNode;
  compOn: boolean; // drives the auto-makeup loop
  userMakeupDb: number; // the makeup knob value (added on top of auto-makeup)
  analyser: AnalyserNode;
  buf: { raw: AudioBuffer; mix: AudioBuffer } | null;
  scratch: Float32Array<ArrayBuffer>;
};

// How much louder the auto-mix bus comes up vs raw (makeup gain on the bus,
// pushed into the master glue limiter). This is the "comes alive" boost, applied
// through the bus, NOT by moving the visible bus fader (which stays at unity).
const AUTOMIX_BUS_BOOST_DB = 17;

// A short stereo room impulse: decorrelated decaying noise with a tiny pre-build.
// A glue room: a short pre-delay, a few early reflections, then a diffuse tail
// that is progressively damped (darker as it decays) so it bonds the kit
// without sizzle. Energy-normalized so 100% wet sits at the dry level.
function makeRoomIR(ctx: BaseAudioContext, seconds = 0.85, decay = 4.2): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(seconds * rate);
  const preDelay = Math.floor(0.012 * rate);
  const buf = ctx.createBuffer(2, len, rate);
  const taps: [number, number][][] = [
    [[0.013, 0.55], [0.022, 0.42], [0.035, 0.32], [0.05, 0.24], [0.067, 0.18]],
    [[0.011, 0.55], [0.02, 0.44], [0.033, 0.3], [0.053, 0.22], [0.071, 0.16]],
  ];
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      if (i < preDelay) { d[i] = 0; continue; }
      const t = (i - preDelay) / (len - preDelay);
      const env = Math.pow(1 - t, decay);
      const v = (Math.random() * 2 - 1) * env;
      // One-pole low-pass that closes over time -> damped, dark tail (glue).
      const cut = 0.5 - 0.42 * t;
      lp += cut * (v - lp);
      d[i] = lp;
    }
    // Early reflections on top of the diffuse tail.
    for (const [tap, amp] of taps[c]) {
      const idx = preDelay + Math.floor(tap * rate);
      if (idx < len) d[idx] += amp * (c === 0 ? 1 : -1);
    }
    let energy = 0;
    for (let i = 0; i < len; i++) energy += d[i] * d[i];
    const norm = 1 / Math.sqrt(energy || 1);
    for (let i = 0; i < len; i++) d[i] *= norm;
  }
  return buf;
}

// A live EQ chain: [HPF, 4 peaking bands, LPF] = 6 biquads. HPF/LPF are always
// present and simply "open" (20Hz / 22kHz) when their toggle is off.
function makeEqChain(ctx: AudioContext): BiquadFilterNode[] {
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass"; hpf.frequency.value = 20; hpf.Q.value = 0.7;
  const bands = EQ_BAND_DEFAULTS.map((b) => {
    const f = ctx.createBiquadFilter();
    f.type = b.type; f.frequency.value = b.freq; f.Q.value = b.q; f.gain.value = 0;
    return f;
  });
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass"; lpf.frequency.value = 22000; lpf.Q.value = 0.7;
  const chain = [hpf, ...bands, lpf];
  for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
  return chain;
}
function applyEqNodes(ctx: AudioContext, nodes: BiquadFilterNode[], eq: EqState) {
  const t = ctx.currentTime;
  nodes[0].frequency.setTargetAtTime(eq.hpf ? eq.hpfFreq : 20, t, 0.02);
  nodes[5].frequency.setTargetAtTime(eq.lpf ? eq.lpfFreq : 22000, t, 0.02);
  for (let i = 0; i < 4; i++) {
    nodes[i + 1].frequency.setTargetAtTime(eq.bands[i].freq, t, 0.02);
    nodes[i + 1].gain.setTargetAtTime(eq.bands[i].gain, t, 0.02);
  }
}

export class TaffyEngine {
  ctx: AudioContext | null = null;
  busTrim: GainNode | null = null; // fixed internal headroom before the master fader
  busBoost: GainNode | null = null; // auto-mix makeup gain (ramps up when mixed)
  dryGain: GainNode | null = null; // dry leg of the master wet/dry reverb mix
  wetGain: GainNode | null = null; // wet leg (reverb), knob-controlled
  masterEQ: BiquadFilterNode[] = []; // live bus EQ (default flat)
  masterComp: DynamicsCompressorNode | null = null; // master glue / limiter
  masterMakeup: GainNode | null = null;
  masterShaper: WaveShaperNode | null = null;
  masterCompOn = true; // bus glue limiter is on by default
  masterMakeupDb = 0; // bus makeup knob
  private safetyCurve = makeSafetyCurve();
  private makeupRaf = 0; // auto-makeup loop handle
  master: GainNode | null = null; // the user's stereo bus fader (unity by default)
  // Playback position tracking for the scrubbable waveform.
  loopLen = 0; // seconds
  looping = true; // Loop button
  loopRegion: [number, number] | null = null; // selected section to loop, or null
  onEnded?: () => void; // fired when non-looping playback reaches the end
  private playStartCtx = 0; // ctx time the current sources started
  private startOffset = 0; // buffer offset (s) at that start
  waveform: number[] = []; // 0..1 peak envelope of the bus, for the player
  masterAnL: AnalyserNode | null = null;
  masterAnR: AnalyserNode | null = null;
  masterScratchL: Float32Array<ArrayBuffer> | null = null;
  masterScratchR: Float32Array<ArrayBuffer> | null = null;
  channels = new Map<string, Channel>();
  playing = false;
  mixed = false; // auto-mix engaged
  loaded = false;
  usedSynth = false; // true if any stem fell back to the synth

  async load(onProgress?: (done: number, total: number) => void): Promise<void> {
    if (this.loaded) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.ctx = ctx;

    // channels -> busTrim -> busBoost (auto-mix makeup) -> masterComp (glue) ->
    // master (user bus fader, unity) -> out
    const busTrim = ctx.createGain();
    busTrim.gain.value = 0.55; // headroom for 7 unity stems; the comp catches peaks
    const busBoost = ctx.createGain();
    busBoost.gain.value = 1; // raw = unity; ramps up on auto-mix
    // Peak limiter only: catches the boosted transients near 0 dBFS but leaves
    // the body alone, so the makeup gain actually raises loudness (not squashed).
    const masterComp = ctx.createDynamicsCompressor();
    masterComp.threshold.value = -1;
    masterComp.knee.value = 0;
    masterComp.ratio.value = 20;
    masterComp.attack.value = 0.002;
    masterComp.release.value = 0.06;
    const master = ctx.createGain();
    master.gain.value = 1; // unity (the visible bus fader)
    busTrim.connect(busBoost);
    // Live bus EQ (default flat) between the boost and the glue comp.
    const masterEQ = makeEqChain(ctx);
    busBoost.connect(masterEQ[0]);
    masterEQ[masterEQ.length - 1].connect(masterComp);
    master.connect(ctx.destination);

    // True wet/dry reverb mix on the master: comp -> [dry] -> master and
    // comp -> reverb -> [wet] -> master. The knob percent IS the wet fraction
    // (dry = 1 - p, wet = p), with an energy-normalized IR so 100% is genuinely
    // fully wet at the dry level (not a send sitting on top of full dry).
    const reverb = ctx.createConvolver();
    reverb.buffer = makeRoomIR(ctx);
    // Band-limit the wet so the reverb glues without muddying lows or sizzling.
    const wetHP = ctx.createBiquadFilter();
    wetHP.type = "highpass"; wetHP.frequency.value = 180; wetHP.Q.value = 0.6;
    const wetLP = ctx.createBiquadFilter();
    wetLP.type = "lowpass"; wetLP.frequency.value = 7500; wetLP.Q.value = 0.6;
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1; // dry is always full; the knob only adds reverb on top
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.15;
    // Bus comp -> makeup -> color, then split to dry + reverb.
    const masterMakeup = ctx.createGain();
    const masterShaper = ctx.createWaveShaper();
    masterShaper.oversample = "4x";
    masterShaper.curve = this.safetyCurve; // always-on output ceiling: cannot clip
    masterComp.connect(masterMakeup); masterMakeup.connect(masterShaper);
    masterShaper.connect(dryGain); dryGain.connect(master);
    masterShaper.connect(reverb); reverb.connect(wetHP); wetHP.connect(wetLP); wetLP.connect(wetGain); wetGain.connect(master);

    this.busTrim = busTrim;
    this.busBoost = busBoost;
    this.masterEQ = masterEQ;
    this.dryGain = dryGain;
    this.wetGain = wetGain;
    this.masterComp = masterComp;
    this.masterMakeup = masterMakeup;
    this.masterShaper = masterShaper;
    this.master = master;

    // Stereo metering tapped off the master output (post boost + glue), so the
    // bus VU + meters visibly jump when auto-mix brings it alive.
    const split = ctx.createChannelSplitter(2);
    master.connect(split);
    const mkAn = () => {
      const a = ctx.createAnalyser();
      a.fftSize = 1024;
      a.smoothingTimeConstant = 0.3;
      return a;
    };
    this.masterAnL = mkAn();
    this.masterAnR = mkAn();
    split.connect(this.masterAnL, 0);
    split.connect(this.masterAnR, 1);
    this.masterScratchL = new Float32Array(new ArrayBuffer(this.masterAnL.fftSize * 4));
    this.masterScratchR = new Float32Array(new ArrayBuffer(this.masterAnR.fftSize * 4));

    let done = 0;
    const total = TRACKS.length;
    await Promise.all(
      TRACKS.map(async (track) => {
        const buf = await this.loadStems(ctx, track);
        const ch = this.buildChannel(ctx, busTrim, track, buf);
        this.channels.set(track.id, ch);
        done += 1;
        onProgress?.(done, total);
      })
    );
    // Common loop length = the shortest decoded buffer. OGG/Vorbis decode can
    // round to slightly different sample counts per file; forcing every source
    // to the same loopEnd keeps the kit from drifting apart over repeats.
    let minDur = Infinity;
    for (const ch of this.channels.values()) {
      if (ch.buf) minDur = Math.min(minDur, ch.buf.raw.duration, ch.buf.mix.duration);
    }
    this.loopLen = isFinite(minDur) ? minDur : 0;
    this.computeWaveform();
    this.startAutoMakeup();
    this.loaded = true;
  }

  // Peak envelope for the scrubbable player. The room mic hears the whole kit,
  // so it reads as the overall performance (a summed bus just looks like the
  // kick, whose transients dominate).
  private computeWaveform(POINTS = 1100) {
    const src = (this.channels.get("room") ?? [...this.channels.values()][0])?.buf?.mix;
    if (!src) return;
    const len = src.length;
    const d = src.getChannelData(0);
    const seg = Math.max(1, Math.floor(len / POINTS));
    const wf: number[] = [];
    let peak = 1e-6;
    for (let p = 0; p < POINTS; p++) {
      const s = p * seg;
      let m = 0;
      for (let i = s; i < s + seg && i < len; i += 4) {
        const a = Math.abs(d[i]);
        if (a > m) m = a;
      }
      wf.push(m);
      if (m > peak) peak = m;
    }
    this.waveform = wf.map((v) => v / peak);
  }

  private async loadStems(ctx: AudioContext, track: Track) {
    const raw = (await this.tryFetch(ctx, rawSources(track.id))) ?? this.synthRaw(ctx, track);
    let mix = await this.tryFetch(ctx, mixSources(track.id));
    if (!mix) {
      this.usedSynth = true;
      mix = await this.renderMixed(raw, track);
    }
    // Keep both legs the same length so the crossfade stays phase-aligned.
    return { raw, mix };
  }

  private async tryFetch(ctx: AudioContext, urls: string[]): Promise<AudioBuffer | null> {
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const arr = await res.arrayBuffer();
        return await ctx.decodeAudioData(arr);
      } catch {
        /* try next / fall through to synth */
      }
    }
    return null;
  }

  private buildChannel(
    ctx: AudioContext,
    out: GainNode,
    track: Track,
    buf: { raw: AudioBuffer; mix: AudioBuffer }
  ): Channel {
    const rawGain = ctx.createGain();
    const mixGain = ctx.createGain();
    rawGain.gain.value = this.mixed ? 0 : 1;
    mixGain.gain.value = this.mixed ? 1 : 0;

    const fader = ctx.createGain();
    fader.gain.value = dbToGain(this.mixed ? track.mixDb : track.rawDb);

    const mute = ctx.createGain();
    mute.gain.value = 1;

    // Raw is centered; auto-mix swings the pan into place (animated by the UI).
    const panner = ctx.createStereoPanner();
    panner.pan.value = this.mixed ? track.pan : 0;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.3; // snappier, livelier needles

    // Live EQ: [HPF, 4 bands, LPF] between the source sum and the comp.
    const eq = makeEqChain(ctx);
    rawGain.connect(eq[0]);
    mixGain.connect(eq[0]);
    // Compressor (bypassed by default) -> makeup -> color, then the fader.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = 0; comp.ratio.value = 1; comp.knee.value = 0;
    comp.attack.value = 0.012; comp.release.value = 0.14;
    const makeup = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    shaper.oversample = "4x";
    shaper.curve = this.safetyCurve; // always-on per-channel ceiling: cannot clip
    eq[eq.length - 1].connect(comp);
    comp.connect(makeup);
    makeup.connect(shaper);
    shaper.connect(fader);
    fader.connect(panner);
    panner.connect(mute);
    mute.connect(analyser);
    analyser.connect(out);

    return {
      track,
      rawSrc: null,
      mixSrc: null,
      rawGain,
      mixGain,
      fader,
      mute,
      panner,
      eq,
      comp,
      makeup,
      shaper,
      compOn: false,
      userMakeupDb: 0,
      analyser,
      buf,
      scratch: new Float32Array(new ArrayBuffer(analyser.fftSize * 4)),
    };
  }

  async play() {
    if (!this.ctx || this.playing) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.startSources(this.startOffset);
    this.playing = true;
  }

  // (Re)start all looped sources from `offset` seconds in. Used by play + seek.
  // loopStart/loopEnd are forced to the common region so every channel wraps at
  // exactly the same sample (no drift), and so a selected section can loop.
  private startSources(offset: number) {
    if (!this.ctx) return;
    const [ls, le] = this.region();
    const span = le - ls;
    const t0 = this.ctx.currentTime + 0.04;
    let off = offset;
    if (off < ls || off >= le) off = ls;
    let first = true;
    for (const ch of this.channels.values()) {
      if (!ch.buf) continue;
      this.clearSrc(ch);
      const rawSrc = this.ctx.createBufferSource();
      rawSrc.buffer = ch.buf.raw;
      rawSrc.loop = this.looping; rawSrc.loopStart = ls; rawSrc.loopEnd = le;
      rawSrc.connect(ch.rawGain);
      const mixSrc = this.ctx.createBufferSource();
      mixSrc.buffer = ch.buf.mix;
      mixSrc.loop = this.looping; mixSrc.loopStart = ls; mixSrc.loopEnd = le;
      mixSrc.connect(ch.mixGain);
      rawSrc.start(t0, off, this.looping ? undefined : Math.max(0.01, le - off));
      mixSrc.start(t0, off, this.looping ? undefined : Math.max(0.01, le - off));
      // When not looping, the first source's end stops transport.
      if (first && !this.looping) {
        rawSrc.onended = () => { if (this.playing) { this.playing = false; this.startOffset = ls; this.onEnded?.(); } };
        first = false;
      }
      ch.rawSrc = rawSrc;
      ch.mixSrc = mixSrc;
    }
    this.playStartCtx = t0;
    this.startOffset = off;
    void span;
  }

  // The active loop region [start, end] in seconds (full clip, or the selection).
  private region(): [number, number] {
    if (this.loopRegion) return this.loopRegion;
    return [0, this.loopLen || 0];
  }
  setLoopRegion(r: [number, number] | null) {
    this.loopRegion = r;
    if (this.playing) this.startSources(this.getPosition());
  }
  setLooping(on: boolean) {
    this.looping = on;
    for (const ch of this.channels.values()) {
      if (ch.rawSrc) ch.rawSrc.loop = on;
      if (ch.mixSrc) ch.mixSrc.loop = on;
    }
  }

  private clearSrc(ch: Channel) {
    if (ch.rawSrc) { ch.rawSrc.onended = null; ch.rawSrc.stop(); }
    if (ch.mixSrc) ch.mixSrc.stop();
    ch.rawSrc = null;
    ch.mixSrc = null;
  }

  // Jump the playhead to `pos` seconds (for waveform scrubbing).
  seek(pos: number) {
    const p = this.loopLen ? ((pos % this.loopLen) + this.loopLen) % this.loopLen : 0;
    if (this.playing) this.startSources(p);
    else this.startOffset = p;
  }

  // Current playhead position in seconds (0..loopLen).
  getPosition(): number {
    if (!this.ctx || !this.loopLen) return this.startOffset;
    if (!this.playing) return this.startOffset;
    const [ls, le] = this.region();
    const span = le - ls;
    const t = this.ctx.currentTime - this.playStartCtx + (this.startOffset - ls);
    return ls + ((t % span) + span) % span;
  }

  // Pause: stop but keep position. Stop: halt and rewind to the region start.
  pause() {
    this.startOffset = this.getPosition();
    for (const ch of this.channels.values()) this.clearSrc(ch);
    this.playing = false;
  }
  stop() {
    for (const ch of this.channels.values()) this.clearSrc(ch);
    this.startOffset = this.region()[0];
    this.playing = false;
  }

  // ---- live EQ ---------------------------------------------------------------

  applyEq(id: string, eq: EqState) {
    if (!this.ctx) return;
    const nodes = id === "bus" ? this.masterEQ : this.channels.get(id)?.eq;
    if (nodes && nodes.length === 6) applyEqNodes(this.ctx, nodes, eq);
  }

  // ---- compression -----------------------------------------------------------

  applyComp(id: string, c: CompState) {
    if (!this.ctx) return;
    if (id === "bus") {
      if (this.masterComp) applyCompNodes(this.ctx, this.masterComp, c);
      this.masterCompOn = c.on;
      this.masterMakeupDb = c.makeup;
    } else {
      const ch = this.channels.get(id);
      if (ch) {
        applyCompNodes(this.ctx, ch.comp, c);
        ch.compOn = c.on;
        ch.userMakeupDb = c.makeup;
      }
    }
  }

  // Auto gain-compensation: every frame, give back a fraction of the live gain
  // reduction so engaging the comp holds loudness instead of jumping louder, with
  // the user's makeup knob added on top (and clamped). The always-on safety
  // limiter is the final backstop, so the output still cannot blow out.
  private startAutoMakeup() {
    const tick = () => {
      const ctx = this.ctx;
      if (ctx) {
        const t = ctx.currentTime;
        const clamp = (db: number) => Math.max(-24, Math.min(12, db));
        for (const ch of this.channels.values()) {
          const db = ch.compOn ? clamp(ch.userMakeupDb + -ch.comp.reduction * AUTO_MAKEUP_FRAC) : 0;
          ch.makeup.gain.setTargetAtTime(dbToGain(db), t, 0.05);
        }
        if (this.masterMakeup) {
          // The bus is the final stage, so it gets only its manual makeup knob
          // (no auto gain-up) to keep overall loudness from creeping toward clip.
          this.masterMakeup.gain.setTargetAtTime(dbToGain(this.masterMakeupDb), t, 0.05);
        }
      }
      this.makeupRaf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this.makeupRaf);
    this.makeupRaf = requestAnimationFrame(tick);
  }

  // Current gain reduction in dB (>= 0), for the GR meter.
  getReduction(id: string): number {
    const comp = id === "bus" ? this.masterComp : this.channels.get(id)?.comp;
    return comp ? -comp.reduction : 0;
  }

  // Master reverb amount, 0..1: how much of a full-level reverb is mixed IN on
  // top of the (always full) dry signal. Turning it up adds reverb, never
  // quieter. 1.0 = a full reverb at the dry level added in.
  setReverb(amount: number) {
    if (!this.ctx || !this.wetGain) return;
    const p = Math.max(0, Math.min(1, amount));
    this.wetGain.gain.setTargetAtTime(p, this.ctx.currentTime, 0.03);
  }

  setFaderDb(id: string, db: number) {
    const ch = this.channels.get(id);
    if (!ch || !this.ctx) return;
    ch.fader.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.015);
  }

  setPan(id: string, pan: number) {
    const ch = this.channels.get(id);
    if (!ch || !this.ctx) return;
    ch.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), this.ctx.currentTime, 0.015);
  }

  // The stereo bus / master fader.
  setMasterDb(db: number) {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.015);
  }

  // Stereo RMS of the master output (drives the bus VU + L/R meters).
  getMasterLevels(): [number, number] {
    if (!this.masterAnL || !this.masterAnR || !this.masterScratchL || !this.masterScratchR) return [0, 0];
    this.masterAnL.getFloatTimeDomainData(this.masterScratchL);
    this.masterAnR.getFloatTimeDomainData(this.masterScratchR);
    return [rms(this.masterScratchL), rms(this.masterScratchR)];
  }

  // Recompute every channel's mute leg from the full mute/solo state.
  applyMuteSolo(state: Record<string, { mute: boolean; solo: boolean }>) {
    if (!this.ctx) return;
    const anySolo = Object.values(state).some((s) => s.solo);
    for (const ch of this.channels.values()) {
      const s = state[ch.track.id] || { mute: false, solo: false };
      const audible = !s.mute && (!anySolo || s.solo);
      ch.mute.gain.setTargetAtTime(audible ? 1 : 0, this.ctx.currentTime, 0.02);
    }
  }

  // Engage / disengage auto-mix. The raw<->mix SOURCE swap is a short
  // equal-power crossfade (~90ms) so the two legs never overlap long enough to
  // flam (processing shifts the processed transients a few ms; a long crossfade
  // doubles every beat). The "comes alive" smoothness instead comes from the
  // boost / reverb / fader / pan all ramping over `dur`.
  setAutoMix(on: boolean) {
    if (!this.ctx) return;
    this.mixed = on;
    const now = this.ctx.currentTime;

    // INSTANT switch. Everything moves together over a single tiny ramp (~12ms):
    // long enough to avoid a click, short enough to be inaudible. Crucially the
    // bus makeup snaps with the source, so raw never plays through the +17 dB
    // boost (that overlap was the "really loud for a second" blast on Taffy Off).
    const RAMP = 0.012;
    for (const ch of this.channels.values()) {
      ch.rawGain.gain.cancelScheduledValues(now);
      ch.mixGain.gain.cancelScheduledValues(now);
      ch.rawGain.gain.setValueAtTime(ch.rawGain.gain.value, now);
      ch.mixGain.gain.setValueAtTime(ch.mixGain.gain.value, now);
      ch.rawGain.gain.linearRampToValueAtTime(on ? 0 : 1, now + RAMP);
      ch.mixGain.gain.linearRampToValueAtTime(on ? 1 : 0, now + RAMP);
    }
    if (this.busBoost) {
      const target = on ? dbToGain(AUTOMIX_BUS_BOOST_DB) : 1;
      this.busBoost.gain.cancelScheduledValues(now);
      this.busBoost.gain.setValueAtTime(this.busBoost.gain.value, now);
      this.busBoost.gain.linearRampToValueAtTime(target, now + RAMP);
    }
    // Reverb is its own knob now (setReverb), independent of auto-mix.
  }

  // Linear RMS level (0..~1) per track, in TRACKS order. Drives the VU meters.
  getLevels(): number[] {
    return TRACKS.map((t) => {
      const ch = this.channels.get(t.id);
      if (!ch) return 0;
      ch.analyser.getFloatTimeDomainData(ch.scratch);
      let sum = 0;
      for (let i = 0; i < ch.scratch.length; i++) sum += ch.scratch[i] * ch.scratch[i];
      return Math.sqrt(sum / ch.scratch.length);
    });
  }

  dispose() {
    this.stop();
    this.ctx?.close();
    this.ctx = null;
    this.channels.clear();
    this.loaded = false;
  }

  // ---- placeholder synthesis (used until real stems are dropped in) ----------

  private synthRaw(ctx: AudioContext, track: Track): AudioBuffer {
    this.usedSynth = true;
    const sr = ctx.sampleRate;
    const bpm = 100;
    const beat = 60 / bpm;
    const bars = 2;
    const len = Math.round(beat * 4 * bars * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const beats = 4 * bars;

    const addNoise = (start: number, dur: number, amp: number, decay: number) => {
      const s = Math.round(start * sr);
      const n = Math.round(dur * sr);
      for (let i = 0; i < n && s + i < len; i++) {
        const env = Math.exp((-i / sr) * decay);
        d[s + i] += (Math.random() * 2 - 1) * amp * env;
      }
    };
    const addTone = (start: number, dur: number, f0: number, f1: number, amp: number, decay: number) => {
      const s = Math.round(start * sr);
      const n = Math.round(dur * sr);
      let phase = 0;
      for (let i = 0; i < n && s + i < len; i++) {
        const t = i / sr;
        const f = f0 + (f1 - f0) * Math.min(1, t / dur);
        phase += (2 * Math.PI * f) / sr;
        const env = Math.exp(-t * decay);
        d[s + i] += Math.sin(phase) * amp * env;
      }
    };

    for (let b = 0; b < beats; b++) {
      const t = b * beat;
      const beatInBar = b % 4;
      switch (track.voice) {
        case "kick":
          addTone(t, 0.28, 95, 42, 0.95, 22);
          addNoise(t, 0.01, 0.5, 400); // beater click
          break;
        case "snare":
          if (beatInBar === 1 || beatInBar === 3) {
            addNoise(t, 0.18, 0.55, 26);
            addTone(t, 0.12, 190, 170, 0.4, 30);
          }
          break;
        case "tom":
          if (b === beats - 1) {
            const pitch = track.id === "racktom" ? 165 : 100;
            addTone(t + beat * 0.5, 0.3, pitch, pitch * 0.7, 0.8, 16);
          }
          break;
        case "hat": {
          // 8th-note ticks; offset L/R a hair for width
          const off = track.id === "oh-left" ? 0 : 0.004;
          addNoise(t + off, 0.04, 0.18, 120);
          addNoise(t + beat * 0.5 + off, 0.04, 0.13, 140);
          break;
        }
        case "room":
          // quiet wash that swells on the backbeat
          if (beatInBar === 1 || beatInBar === 3) addNoise(t, 0.4, 0.12, 8);
          else addNoise(t, 0.3, 0.05, 10);
          break;
      }
    }
    // gentle peak normalize
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) {
      const g = 0.85 / peak;
      for (let i = 0; i < len; i++) d[i] *= g;
    }
    return buf;
  }

  // Render the "mixed" stand-in by passing the raw buffer through the track's
  // target EQ + a touch of compression. Same length, so it stays loop-aligned.
  private async renderMixed(raw: AudioBuffer, track: Track): Promise<AudioBuffer> {
    const off = new OfflineAudioContext(1, raw.length, raw.sampleRate);
    const src = off.createBufferSource();
    src.buffer = raw;

    let node: AudioNode = src;
    for (const band of track.eqMix || []) {
      const f = off.createBiquadFilter();
      f.type = band.type as BiquadFilterType;
      f.frequency.value = band.freq;
      f.Q.value = band.q;
      if (band.type === "peaking" || band.type === "lowshelf" || band.type === "highshelf") {
        f.gain.value = band.gain;
      }
      node.connect(f);
      node = f;
    }
    const comp = off.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.12;
    const makeup = off.createGain();
    makeup.gain.value = 1.25;
    node.connect(comp);
    comp.connect(makeup);
    makeup.connect(off.destination);
    src.start();

    return off.startRendering();
  }
}
