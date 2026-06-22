import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { TaffyEngine } from "../taffy/engine";
import { TRACKS, EQ_BAND_DEFAULTS, defaultEq, defaultComp, defaultBusComp, mixEq, mixComp, MIX_REVERB, type EqState, type EqBand, type CompState } from "../taffy/tracks";
import { curvePath } from "../taffy/eq";
import { useIsMobile } from "../hooks/useIsMobile";

const EQ_FREQ_MIN = 30, EQ_FREQ_MAX = 18000;
import { buildWobbleSVG, wobblePath, hexMix, type WobbleOpts } from "../taffy/wobble";

// Rainbow stops used for the bus (fader cap, EQ curve, waveform).
const RAINBOW = ["#e63946", "#ff6b35", "#e0a000", "#0a9b6c", "#3a86ff", "#8338ec"];

// In-browser simulation of Taffy's console, styled to match the real plugin:
// hand-drawn wobble linework, candy strips, round analog VU dials, working
// faders + pan + mute/solo, and a stereo drum bus that acts as the master
// fader. Raw is the unity stage (every fader at 0 dB, EQ flat); one-button
// auto-mix rides the faders into place (never above unity) and shapes the EQ.

const FADER_MIN = -60;
const FADER_MAX = 6;
// Console fader taper: unity (0 dB) sits ~72% up the throw, a short +headroom
// above it, and a long tail down to -inf. (A linear dB map would jam unity to
// the very top.) frac is 0 at the bottom, 1 at the top.
const UNITY_FRAC = 0.72;
function dbToFrac(db: number): number {
  if (db >= 0) return UNITY_FRAC + (Math.min(db, FADER_MAX) / FADER_MAX) * (1 - UNITY_FRAC);
  return UNITY_FRAC * (1 + Math.max(db, FADER_MIN) / -FADER_MIN);
}
function fracToDb(f: number): number {
  f = Math.max(0, Math.min(1, f));
  if (f >= UNITY_FRAC) return ((f - UNITY_FRAC) / (1 - UNITY_FRAC)) * FADER_MAX;
  return (f / UNITY_FRAC - 1) * -FADER_MIN;
}
const dbToTop = (db: number) => (1 - dbToFrac(db)) * 100;
const INK = "#2a241d";

type ChanState = { mute: boolean; solo: boolean };

export default function TaffyDemo({ onClose }: { onClose: () => void }) {
  // On phones/tablets the fixed-viewport console is taller than the screen, so
  // it scrolls vertically instead of clipping the Auto Mix button off the bottom.
  const isMobile = useIsMobile();
  const engineRef = useRef<TaffyEngine | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mixed, setMixed] = useState(false);
  const mixedRef = useRef(false); // read current A/B state inside callbacks
  const [mixing, setMixing] = useState(false);
  const [synth, setSynth] = useState(false);

  // The console is the user's persistent mix (it is NOT reset by auto-mix —
  // auto-mix only A/Bs the raw vs processed source). Faders/pans start at the
  // suggested mix; the user refines from there.
  const [faders, setFaders] = useState<Record<string, number>>(() => ({
    ...Object.fromEntries(TRACKS.map((t) => [t.id, t.mixDb])),
    bus: 0,
  }));
  const [pans, setPans] = useState<Record<string, number>>(
    () => Object.fromEntries(TRACKS.map((t) => [t.id, t.pan]))
  );
  const [chan, setChan] = useState<Record<string, ChanState>>(
    () => Object.fromEntries(TRACKS.map((t) => [t.id, { mute: false, solo: false }]))
  );
  // Live EQ state per strip + the bus — initialized to Justin's baked mix.
  const [eqStates, setEqStates] = useState<Record<string, EqState>>(() => ({
    ...Object.fromEntries(TRACKS.map((t) => [t.id, mixEq(t.id)])),
    bus: mixEq("bus"),
  }));
  // Compressor state per strip + the bus — initialized to Justin's baked mix.
  const [comps, setComps] = useState<Record<string, CompState>>(() => ({
    ...Object.fromEntries(TRACKS.map((t) => [t.id, mixComp(t.id)])),
    bus: mixComp("bus"),
  }));
  const [compOpen, setCompOpen] = useState<string | null>(null); // which strip's comp popup
  const [ohLink, setOhLink] = useState(true); // link OH L/R settings (Justin's mix)
  // Master reverb amount (0..1) = Justin's mix.
  const [reverb, setReverb] = useState(MIX_REVERB);
  // Transport
  const [looping, setLooping] = useState(true);
  // First Auto Mix press plays a 5-count reveal; after that it's instant A/B.
  const [countdown, setCountdown] = useState<number | null>(null);
  const firstMixRef = useRef(false);
  // Lock the waveform to the channel-strip rack width (measured live).
  const rackRef = useRef<HTMLDivElement | null>(null);
  const [rackW, setRackW] = useState(0);
  useEffect(() => {
    const el = rackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRackW(el.offsetWidth));
    ro.observe(el);
    setRackW(el.offsetWidth);
    return () => ro.disconnect();
  }, [phase]);

  // Live, per-frame visuals written straight to the DOM (no React re-render).
  const needleRefs = useRef<Record<string, SVGLineElement | null>>({});
  const needleAng = useRef<Record<string, number>>({});
  const meterRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const peakRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const peakHold = useRef<Record<string, number>>({});
  const grRefs = useRef<Record<string, SVGRectElement | null>>({});

  // ---- load engine -----------------------------------------------------------
  useEffect(() => {
    const engine = new TaffyEngine();
    engineRef.current = engine;
    let cancelled = false;
    engine
      .load((done, total) => !cancelled && setProgress(done / total))
      .then(() => {
        if (cancelled) return;
        setSynth(engine.usedSynth);
        // The demo opens in "Before Taffy" (raw mics): unity, no processing.
        // Clicking auto-mix swaps to the processed source + applies Justin's mix.
        const flat = defaultEq();
        const off = { ...defaultComp(), on: false };
        TRACKS.forEach((t) => {
          engine.setFaderDb(t.id, 0);
          engine.setPan(t.id, 0);
          engine.applyEq(t.id, flat);
          engine.applyComp(t.id, off);
        });
        engine.setMasterDb(0);
        engine.applyEq("bus", flat);
        engine.applyComp("bus", { ...defaultBusComp(), on: false });
        engine.setReverb(0);
        engine.onEnded = () => { setPlaying(false); };
        setPhase("ready");
      })
      .catch((e) => {
        console.error("Taffy engine failed to load", e);
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
      engine.dispose();
    };
  }, []);

  // ---- per-frame meter + needle loop ----------------------------------------
  useEffect(() => {
    if (phase !== "ready") return;
    let raf = 0;
    const lvlToNeedle = (lvl: number) => {
      // More sensitive mapping so drum RMS swings the dial across its face.
      const db = lvl > 0 ? 20 * Math.log10(lvl) : -120;
      const frac = Math.max(0, Math.min(1, (db + 44) / 40));
      return -60 + frac * 120;
    };
    const meterPct = (lvl: number) => {
      const db = lvl > 0 ? 20 * Math.log10(lvl) : -120;
      return Math.max(0, Math.min(1, (db + 48) / 48)) * 100;
    };
    const drive = (id: string, lvl: number) => {
      // Analog needle with peak ballistics: snap up on transients, fall slowly.
      const target = lvlToNeedle(lvl);
      const prevA = needleAng.current[id] ?? -60;
      const ang = target > prevA ? prevA + (target - prevA) * 0.6 : prevA + (target - prevA) * 0.1;
      needleAng.current[id] = ang;
      const ndl = needleRefs.current[id];
      if (ndl) ndl.setAttribute("transform", `rotate(${ang.toFixed(1)} 60 74)`);
      // gain-reduction meter: the real comp reduction (dB), 0..18 -> full.
      const gr = grRefs.current[id];
      if (gr) {
        const red = engineRef.current?.getReduction(id) ?? 0;
        const w = Math.max(0, Math.min(1, red / 18)) * 100;
        gr.setAttribute("width", w.toFixed(1));
        gr.setAttribute("x", (113 - w).toFixed(1));
      }
    };
    const driveMeter = (id: string, pct: number) => {
      const el = meterRefs.current[id];
      if (el) el.style.height = `${100 - pct}%`;
      const prev = peakHold.current[id] ?? 0;
      const next = pct > prev ? pct : Math.max(0, prev - 0.8);
      peakHold.current[id] = next;
      const pk = peakRefs.current[id];
      if (pk) pk.style.bottom = `${next}%`;
    };
    const tick = () => {
      const engine = engineRef.current;
      if (engine) {
        const levels = engine.getLevels();
        TRACKS.forEach((t, i) => {
          const lvl = levels[i] ?? 0;
          drive(t.id, lvl);
          driveMeter(t.id, meterPct(lvl));
        });
        const [mL, mR] = engine.getMasterLevels();
        drive("bus", (mL + mR) / 2);
        driveMeter("bus-l", meterPct(mL));
        driveMeter("bus-r", meterPct(mR));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // ---- transport: play / pause / stop / loop --------------------------------
  const onPlay = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || playing) return;
    await engine.play();
    engine.applyMuteSolo(chan);
    setPlaying(true);
  }, [playing, chan]);
  const onPause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !playing) return;
    engine.pause();
    setPlaying(false);
  }, [playing]);
  const onStop = useCallback(() => {
    engineRef.current?.stop();
    setPlaying(false);
  }, []);
  const onLoop = useCallback(() => {
    setLooping((on) => {
      const next = !on;
      engineRef.current?.setLooping(next);
      return next;
    });
  }, []);

  // When OH link is on, an edit to one overhead mirrors to the other (level,
  // EQ, comp — but not pan, so they stay spread L/R).
  const ohPartner = useCallback((id: string): string | null => {
    if (!ohLink) return null;
    if (id === "oh-left") return "oh-right";
    if (id === "oh-right") return "oh-left";
    return null;
  }, [ohLink]);

  // ---- fader / pan -----------------------------------------------------------
  // The strips are editable ONLY in "After Taffy" mode. In "Before" the rack is a
  // locked unity reference, so edits are ignored entirely (the baked mix stays
  // pristine). Mute/solo stay live in both modes so you can audition raw mics.
  const setFader = useCallback((id: string, db: number) => {
    if (!mixedRef.current) return;
    const clamped = Math.max(FADER_MIN, Math.min(FADER_MAX, db));
    const ids = [id, ohPartner(id)].filter(Boolean) as string[];
    setFaders((f) => { const n = { ...f }; ids.forEach((x) => (n[x] = clamped)); return n; });
    ids.forEach((x) => (x === "bus" ? engineRef.current?.setMasterDb(clamped) : engineRef.current?.setFaderDb(x, clamped)));
  }, [ohPartner]);

  const setPan = useCallback((id: string, pan: number) => {
    if (!mixedRef.current) return;
    const clamped = Math.max(-1, Math.min(1, pan));
    setPans((p) => ({ ...p, [id]: clamped }));
    engineRef.current?.setPan(id, clamped);
  }, []);

  // Apply a strip's whole EQ state (live), mirror to the OH partner if linked.
  const setEq = useCallback((id: string, eq: EqState) => {
    if (!mixedRef.current) return;
    const ids = [id, ohPartner(id)].filter(Boolean) as string[];
    setEqStates((prev) => { const n = { ...prev }; ids.forEach((x) => (n[x] = eq)); return n; });
    ids.forEach((x) => engineRef.current?.applyEq(x, eq));
  }, [ohPartner]);

  // Apply a strip's compressor, mirror to the OH partner if linked.
  const setComp = useCallback((id: string, c: CompState) => {
    if (!mixedRef.current) return;
    const ids = [id, ohPartner(id)].filter(Boolean) as string[];
    setComps((prev) => { const n = { ...prev }; ids.forEach((x) => (n[x] = c)); return n; });
    ids.forEach((x) => engineRef.current?.applyComp(x, c));
  }, [ohPartner]);

  const printComp = useCallback((id: string, c: CompState) => {
    // eslint-disable-next-line no-console
    console.log(`[TAFFY COMP] ${id}\n  ${c.on ? "ON" : "off"} thr ${c.threshold.toFixed(1)}dB · ratio ${c.ratio.toFixed(1)} · atk ${(c.attack * 1000).toFixed(0)}ms · rel ${(c.release * 1000).toFixed(0)}ms · knee ${c.knee.toFixed(0)} · makeup ${c.makeup.toFixed(1)}dB\n  json: ${JSON.stringify(c)}`);
  }, []);

  // Print a strip's EQ in a copy-paste-friendly form (for dialing in mix values).
  const printEq = useCallback((id: string, eq: EqState) => {
    const bands = eq.bands.map((b) => `{ freq: ${Math.round(b.freq)}, gain: ${b.gain.toFixed(1)} }`).join(", ");
    // eslint-disable-next-line no-console
    console.log(
      `[TAFFY EQ] ${id}\n  bands: [ ${bands} ]` +
        `\n  hpf: ${eq.hpf ? Math.round(eq.hpfFreq) + " Hz" : "off"} · lpf: ${eq.lpf ? Math.round(eq.lpfFreq) + " Hz" : "off"}` +
        `\n  json: ${JSON.stringify(eq)}`
    );
  }, []);

  const onReverb = useCallback((v: number) => {
    const a = Math.max(0, Math.min(1, v));
    setReverb(a);
    if (mixedRef.current) engineRef.current?.setReverb(a);
  }, []);

  // ---- mute / solo -----------------------------------------------------------
  const toggle = useCallback((id: string, key: "mute" | "solo") => {
    setChan((prev) => {
      const next = { ...prev, [id]: { ...prev[id], [key]: !prev[id][key] } };
      engineRef.current?.applyMuteSolo(next);
      return next;
    });
  }, []);

  const anySolo = useMemo(() => Object.values(chan).some((c) => c.solo), [chan]);
  // Flat EQ shown on every strip in "Before" mode (raw = no processing).
  const flatEqDisplay = useMemo(() => defaultEq(), []);

  // ---- Auto Mix / Taffy Off (two plain buttons, not a toggle) ----------------
  // Auto Mix ALWAYS slams everyone back to Justin's baked baseline, discarding
  // any tweaks, and brings the console alive (color). Taffy Off bypasses to raw
  // unity with zero processing (and drains the site of color).
  const applyBaseline = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setMixing(true);
    setMixed(true);
    mixedRef.current = true;
    // reset React state to the baked baseline (discard any user tweaks)
    setFaders({ ...Object.fromEntries(TRACKS.map((t) => [t.id, t.mixDb])), bus: 0 });
    setPans(Object.fromEntries(TRACKS.map((t) => [t.id, t.pan])));
    setEqStates({ ...Object.fromEntries(TRACKS.map((t) => [t.id, mixEq(t.id)])), bus: mixEq("bus") });
    setComps({ ...Object.fromEntries(TRACKS.map((t) => [t.id, mixComp(t.id)])), bus: mixComp("bus") });
    setReverb(MIX_REVERB);
    setOhLink(true);
    // apply the baseline to the engine (instant switch)
    engine.setAutoMix(true);
    TRACKS.forEach((t) => {
      engine.setFaderDb(t.id, t.mixDb);
      engine.setPan(t.id, t.pan);
      engine.applyEq(t.id, mixEq(t.id));
      engine.applyComp(t.id, mixComp(t.id));
    });
    engine.setMasterDb(0);
    engine.applyEq("bus", mixEq("bus"));
    engine.applyComp("bus", mixComp("bus"));
    engine.setReverb(MIX_REVERB);
    window.setTimeout(() => setMixing(false), 120);
  }, []);

  // The first Auto Mix press is the reveal: start the raw drums immediately, run
  // a big 5-count over everything, then burst into color + the mix. After that,
  // Auto Mix is instant so they can A/B against Taffy Off.
  const autoMix = useCallback(() => {
    if (firstMixRef.current) {
      applyBaseline();
      return;
    }
    firstMixRef.current = true;
    onPlay(); // raw drums start playing right away (still in Taffy-off state)
    let n = 5;
    setCountdown(5);
    const iv = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(iv);
        setCountdown(null);
        applyBaseline();
      } else {
        setCountdown(n);
      }
    }, 1000);
  }, [applyBaseline, onPlay]);

  const taffyOff = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setMixing(true);
    setMixed(false);
    mixedRef.current = false;
    engine.setAutoMix(false);
    const flat = defaultEq();
    const off = { ...defaultComp(), on: false };
    TRACKS.forEach((t) => {
      engine.setFaderDb(t.id, 0);
      engine.setPan(t.id, 0);
      engine.applyEq(t.id, flat);
      engine.applyComp(t.id, off);
    });
    engine.setMasterDb(0);
    engine.applyEq("bus", flat);
    engine.applyComp("bus", { ...defaultBusComp(), on: false });
    engine.setReverb(0);
    window.setTimeout(() => setMixing(false), 120);
  }, []);

  // ---- settings export / import (the copy-paste-to-Justin box) ---------------
  // The full editable mix (faders, pans, EQ + comp per strip and the bus, reverb,
  // OH link) serialized to JSON. Always reflects the "After Taffy" mix state.
  const settingsJson = useMemo(() => {
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const ids = [...TRACKS.map((t) => t.id), "bus"];
    const fadersOut: Record<string, number> = {};
    const pansOut: Record<string, number> = {};
    const eqOut: Record<string, unknown> = {};
    const compOut: Record<string, unknown> = {};
    ids.forEach((id) => {
      fadersOut[id] = r1(faders[id] ?? 0);
      if (id !== "bus") pansOut[id] = r2(pans[id] ?? 0);
      const eq = eqStates[id];
      eqOut[id] = {
        bands: eq.bands.map((b) => ({ freq: Math.round(b.freq), gain: r1(b.gain) })),
        hpf: eq.hpf, hpfFreq: Math.round(eq.hpfFreq), lpf: eq.lpf, lpfFreq: Math.round(eq.lpfFreq),
      };
      const c = comps[id];
      compOut[id] = { on: c.on, threshold: r1(c.threshold), ratio: r1(c.ratio), attack: r3(c.attack), release: r3(c.release), knee: r1(c.knee), makeup: r1(c.makeup) };
    });
    return JSON.stringify({ faders: fadersOut, pans: pansOut, reverb: r2(reverb), ohLink, eq: eqOut, comp: compOut }, null, 2);
  }, [faders, pans, eqStates, comps, reverb, ohLink]);

  // Tiny, almost-hidden export: copy the full current mix as JSON (for tuning).
  const [copied, setCopied] = useState(false);
  const copyMix = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(settingsJson);
    } catch {
      // eslint-disable-next-line no-console
      console.log(settingsJson);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [settingsJson]);

  // ---- esc to close ----------------------------------------------------------
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  // When Taffy is off the whole console drains of color; only Auto Mix keeps it.
  const desat = `transition-[filter] duration-700 ${mixed ? "" : "grayscale"}`;

  return (
    <div
      className={`taffy taffy-root relative flex h-full w-full flex-col ${
        isMobile ? "scroll-thin overflow-y-auto overflow-x-hidden" : "overflow-hidden"
      }`}
    >
      {/* inline filter so it wins over the .taffy-sky CSS filter; drains color when off */}
      <div
        className="taffy-sky transition-[filter] duration-700"
        style={{ filter: mixed ? "blur(26px) saturate(1.4)" : "blur(26px) grayscale(1)" }}
        aria-hidden="true"
      />

      {/* header: big Taffy wordmark + the two transport buttons */}
      <header className="relative z-[1] flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-5 pb-1 pt-4 sm:px-7">
        <div className={`flex items-baseline gap-3 ${desat}`}>
          <span
            className="taffy-ink text-[64px] font-bold leading-none sm:text-[88px]"
            style={{ color: "#ef476f", WebkitTextStroke: `2.5px ${INK}` }}
          >
            Taffy
          </span>
          <span className="taffy-ink hidden text-[28px] font-bold leading-none text-[#2a241d]/55 sm:inline">
            drum console
          </span>
        </div>
        <div className="flex items-center gap-3">
          {synth && (
            <WobbleButton fill="#fffdf7" seed={91} className="hidden text-[16px] text-[#2a241d]/70 md:block">
              demo kit
            </WobbleButton>
          )}
          <WobbleButton fill="#ffffff" seed={77} onClick={onClose} className="text-[19px]">
            done
          </WobbleButton>
        </div>
      </header>

      {/* scrubbable waveform + transport, locked to the channel-strip rack width */}
      {phase === "ready" && (
        <div className={`relative z-[1] px-5 pb-2 sm:px-7 ${desat}`}>
          <div className="mx-auto w-full" style={{ maxWidth: rackW || undefined }}>
            <WaveformPlayer
              engineRef={engineRef}
              looping={looping}
              onPlay={onPlay}
              onPause={onPause}
              onStop={onStop}
              onLoop={onLoop}
            />
          </div>
        </div>
      )}

      {/* console: strips at the top, the story + buttons fill the space below */}
      <div className={`relative z-[1] flex flex-col ${isMobile ? "" : "flex-1 overflow-hidden"}`}>
        {phase === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <div className="taffy-ink text-[24px] font-bold text-[#2a241d]/70">warming up the kit…</div>
            <div className="taffy-hand-sm h-2.5 w-56 overflow-hidden border-[2px] border-[#2a241d] bg-[#fffdf7]">
              <div className="h-full transition-all" style={{ width: `${Math.round(progress * 100)}%`, background: "#ef476f" }} />
            </div>
          </div>
        )}
        {phase === "error" && (
          <div className="taffy-ink absolute inset-0 flex items-center justify-center p-6 text-center text-[22px] font-bold text-[#2a241d]/70">
            Could not start audio in this browser. Try a different one, or reopen the demo.
          </div>
        )}
        {phase === "ready" && (
          <>
          <div className={`scroll-thin flex shrink-0 items-start overflow-x-auto px-3 pt-[50px] sm:px-6 ${desat}`}>
            <div
              ref={rackRef}
              className={`mx-auto flex w-fit items-stretch gap-2.5 pb-2 transition-opacity duration-700 sm:gap-3 ${
                mixed ? "" : "opacity-[0.72]"
              }`}
            >
              {TRACKS.map((t, i) => {
                const cs = chan[t.id];
                const dimmed = anySolo && !cs.solo && !cs.mute;
                return (
                  <Strip
                    key={t.id}
                    id={t.id}
                    label={t.label}
                    color={t.color}
                    seed={i * 1337 + 7}
                    db={mixed ? faders[t.id] : 0}
                    pan={mixed ? pans[t.id] : 0}
                    muted={cs.mute}
                    soloed={cs.solo}
                    dimmed={dimmed}
                    eq={mixed ? eqStates[t.id] : flatEqDisplay}
                    onEq={(eq) => setEq(t.id, eq)}
                    onPrintEq={(eq) => printEq(t.id, eq)}
                    compOn={mixed ? comps[t.id].on : false}
                    onOpenComp={() => setCompOpen(t.id)}
                    isOh={t.id === "oh-left" || t.id === "oh-right"}
                    ohLink={ohLink}
                    onOhLink={() => setOhLink((v) => !v)}
                    needleRef={(el) => (needleRefs.current[t.id] = el)}
                    grRef={(el) => (grRefs.current[t.id] = el)}
                    meterRef={(el) => (meterRefs.current[t.id] = el)}
                    peakRef={(el) => (peakRefs.current[t.id] = el)}
                    onFader={(db) => setFader(t.id, db)}
                    onPan={(p) => setPan(t.id, p)}
                    onMute={() => toggle(t.id, "mute")}
                    onSolo={() => toggle(t.id, "solo")}
                  />
                );
              })}
              <BusStrip
                db={mixed ? faders.bus : 0}
                eq={mixed ? eqStates.bus : flatEqDisplay}
                onEq={(eq) => setEq("bus", eq)}
                onPrintEq={(eq) => printEq("bus", eq)}
                compOn={mixed ? comps.bus.on : false}
                onOpenComp={() => setCompOpen("bus")}
                reverb={mixed ? reverb : 0}
                onReverb={onReverb}
                needleRef={(el) => (needleRefs.current["bus"] = el)}
                grRef={(el) => (grRefs.current["bus"] = el)}
                meterLRef={(el) => (meterRefs.current["bus-l"] = el)}
                meterRRef={(el) => (meterRefs.current["bus-r"] = el)}
                peakLRef={(el) => (peakRefs.current["bus-l"] = el)}
                peakRRef={(el) => (peakRefs.current["bus-r"] = el)}
                onFader={(db) => setFader("bus", db)}
              />
            </div>
          </div>

          {/* the story + buttons fill the space below the strips; this block is
              NOT desaturated, so Auto Mix keeps its color when Taffy is off */}
          <div className="flex flex-1 flex-col items-center justify-center px-8 pb-8">
            {/* block is centered on screen; the text inside is left-aligned */}
            <div className="flex w-full max-w-[1000px] flex-col items-start gap-8 text-left">
            <p className="taffy-ink text-[32px] font-bold leading-snug text-[#2a241d]/85 sm:text-[38px]" style={{ WebkitTextStroke: "0.4px #2a241d" }}>
              Those nine channels are the raw, unmixed drum mics, straight off the kit. Hit Auto Mix and watch Taffy identify every mic, pull the bleed, shape each drum, and glue the whole thing into a finished mix. Then dig in yourself: click any channel and push the faders, EQ, and compression wherever you want.
            </p>
            <div className="flex flex-wrap items-center gap-6">
              {/* Auto Mix: the ONE thing that keeps its color when Taffy is off */}
              <button
                id="taffy-automix"
                type="button"
                onClick={autoMix}
                disabled={countdown !== null}
                title="Auto Mix: build the finished mix"
                className={`taffy-ink relative transition active:translate-y-[2px] disabled:opacity-40 focus-visible:outline-none ${
                  !mixed && !mixing && countdown === null ? "taffy-breathe" : ""
                }`}
              >
                <WobbleBox seed={42} fill="busfill" stroke="rainbow" sw={5} amp={3} shadow>
                  <div className="flex items-center justify-center gap-3 px-12 py-4 text-[40px] font-bold leading-none">
                    <span aria-hidden="true" className="text-[30px]">✦</span>
                    Auto Mix
                  </div>
                </WobbleBox>
              </button>
              {/* Taffy Off: bypass to the raw mics; greys out with everything else */}
              <button
                type="button"
                onClick={taffyOff}
                disabled={countdown !== null}
                title="Taffy Off: bypass to the raw mics"
                className={`taffy-ink relative transition active:translate-y-[2px] disabled:opacity-40 focus-visible:outline-none ${desat}`}
              >
                <WobbleBox seed={43} fill="#fffdf7" stroke={INK} sw={3.5} amp={2.4} shadow>
                  <div className="flex items-center justify-center px-9 py-4 text-[30px] font-bold leading-none text-[#2a241d]/70">
                    Taffy Off
                  </div>
                </WobbleBox>
              </button>
            </div>
            </div>
          </div>
          </>
        )}
      </div>

      {/* first-press reveal: big countdown over everything, then color bursts in */}
      {countdown !== null && (
        <div className="absolute inset-0 z-[40] flex items-center justify-center" style={{ background: "rgba(20,16,12,0.28)" }}>
          <div
            key={countdown}
            className="taffy-ink font-bold leading-none text-[#fffdf7]"
            style={{
              fontSize: "clamp(140px, 34vw, 360px)",
              textShadow: "0 6px 30px rgba(0,0,0,0.4)",
              animation: "taffy-pop 1s ease-out",
            }}
          >
            {countdown}
          </div>
        </div>
      )}

      {/* compressor popup */}
      {compOpen && (
        <CompPopup
          label={compOpen === "bus" ? "Bus" : (TRACKS.find((t) => t.id === compOpen)?.label ?? compOpen)}
          color={compOpen === "bus" ? "#8338ec" : (TRACKS.find((t) => t.id === compOpen)?.color ?? "#8338ec")}
          comp={comps[compOpen]}
          onChange={(c) => setComp(compOpen, c)}
          onCommit={(c) => printComp(compOpen, c)}
          getReduction={() => engineRef.current?.getReduction(compOpen) ?? 0}
          onClose={() => setCompOpen(null)}
        />
      )}

      {/* tiny, almost-hidden export (just for tuning the baked mix) */}
      {phase === "ready" && (
        <button
          type="button"
          onClick={copyMix}
          title="Copy the current mix as JSON"
          className={`absolute bottom-1.5 right-3 z-[2] text-[11px] lowercase tracking-wide text-[#2a241d]/25 transition hover:text-[#2a241d]/60 ${desat}`}
        >
          {copied ? "copied ✓" : "export"}
        </button>
      )}
    </div>
  );
}

// ---- wobble box / button -----------------------------------------------------

function WobbleBox({
  seed,
  fill = "none",
  stroke = INK,
  sw = 3.5,
  amp = 2.4,
  shadow = true,
  alpha = 1,
  className = "",
  style,
  children,
  onClick,
}: Partial<WobbleOpts> & {
  seed: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const paint = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      const { viewBox, html } = buildWobbleSVG(w, h, { fill, stroke, sw, amp, shadow, alpha, seed });
      const svg = svgRef.current;
      if (svg) { svg.setAttribute("viewBox", viewBox); svg.innerHTML = html; }
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill, stroke, sw, amp, shadow, alpha, seed]);
  return (
    <div ref={ref} className={`relative ${className}`} style={style} onClick={onClick}>
      <svg ref={svgRef} className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true" />
      <div className="relative" style={{ zIndex: 1 }}>{children}</div>
    </div>
  );
}

function WobbleButton({
  children,
  onClick,
  disabled,
  className = "",
  fill = "#fffdf7",
  stroke = INK,
  sw = 2.6,
  seed,
  id,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  fill?: string;
  stroke?: string;
  sw?: number;
  seed: number;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      disabled={disabled}
      className="taffy-ink font-bold leading-tight text-[#2a241d] transition active:translate-y-[2px] disabled:opacity-40 focus-visible:outline-none"
    >
      <WobbleBox seed={seed} fill={fill} stroke={stroke} sw={sw} amp={2} shadow>
        {/* generous built-in padding so the text never touches the wobbly edge */}
        <div className={`flex items-center justify-center gap-2 px-6 py-2.5 ${className}`}>{children}</div>
      </WobbleBox>
    </button>
  );
}

// ---- channel strip -----------------------------------------------------------

function Strip(props: {
  id: string;
  label: string;
  color: string;
  seed: number;
  db: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  dimmed: boolean;
  eq: EqState;
  onEq: (eq: EqState) => void;
  onPrintEq: (eq: EqState) => void;
  compOn: boolean;
  onOpenComp: () => void;
  isOh: boolean;
  ohLink: boolean;
  onOhLink: () => void;
  needleRef: (el: SVGLineElement | null) => void;
  grRef: (el: SVGRectElement | null) => void;
  meterRef: (el: HTMLDivElement | null) => void;
  peakRef: (el: HTMLDivElement | null) => void;
  onFader: (db: number) => void;
  onPan: (p: number) => void;
  onMute: () => void;
  onSolo: () => void;
}) {
  const { db, color, pan, muted, soloed, dimmed } = props;
  const fill = `g:${hexMix(color, "#ffffff", 0.8)}:${hexMix(color, "#ffffff", 0.95)}`;
  return (
    <WobbleBox
      seed={props.seed}
      fill={fill}
      stroke={color}
      sw={3.5}
      amp={2.4}
      shadow
      alpha={0.9}
      className={`w-[126px] shrink-0 transition-opacity sm:w-[140px] ${dimmed ? "opacity-40" : "opacity-100"}`}
    >
      <div className="flex flex-col items-center px-3 pb-3.5 pt-3">
        <div className="taffy-ink truncate text-[29px] font-bold leading-none" style={{ color }}>
          {props.label}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <MsButton on={muted} kind="m" label={`${props.label} mute`} onClick={props.onMute} />
          <MsButton on={soloed} kind="s" label={`${props.label} solo`} onClick={props.onSolo} />
          {props.isOh && (
            <button
              onClick={props.onOhLink}
              aria-pressed={props.ohLink}
              title="Link overheads (shared EQ/level/comp)"
              className="taffy-ink taffy-hand-sm flex h-[24px] items-center border-[2.5px] px-1.5 text-[15px] font-bold leading-none transition active:translate-y-[1px] focus-visible:outline-none"
              style={props.ohLink ? { background: "#3a86ff", color: "#fff", borderColor: "#3a86ff" } : { background: "rgba(255,255,255,0.5)", color: INK, borderColor: INK }}
            >
              🔗
            </button>
          )}
        </div>

        <EqGraph eq={props.eq} onChange={props.onEq} onCommit={props.onPrintEq} color={color} />
        <VuDial color={color} seed={props.seed} needleRef={props.needleRef} grRef={props.grRef} compOn={props.compOn} onClick={props.onOpenComp} />
        <PanSlider value={pan} onChange={props.onPan} color={color} />

        <div className="mt-2.5 flex h-[225px] items-stretch justify-center gap-3">
          <Fader db={db} onChange={props.onFader} label={props.label} color={color} />
          <MeterBar meterRef={props.meterRef} peakRef={props.peakRef} />
        </div>

        <div className="taffy-ink mt-2 text-[18px] font-bold leading-none tabular-nums text-[#2a241d]/75">
          {db <= FADER_MIN ? "-∞" : `${db > 0 ? "+" : ""}${db.toFixed(1)}`} dB
        </div>
      </div>
    </WobbleBox>
  );
}

// ---- bus / master strip ------------------------------------------------------

function BusStrip(props: {
  db: number;
  eq: EqState;
  onEq: (eq: EqState) => void;
  onPrintEq: (eq: EqState) => void;
  compOn: boolean;
  onOpenComp: () => void;
  reverb: number;
  onReverb: (v: number) => void;
  needleRef: (el: SVGLineElement | null) => void;
  grRef: (el: SVGRectElement | null) => void;
  meterLRef: (el: HTMLDivElement | null) => void;
  meterRRef: (el: HTMLDivElement | null) => void;
  peakLRef: (el: HTMLDivElement | null) => void;
  peakRRef: (el: HTMLDivElement | null) => void;
  onFader: (db: number) => void;
}) {
  const { db } = props;
  const RB = "linear-gradient(95deg,#e63946,#ff6b35,#e0a000,#0a9b6c,#3a86ff,#8338ec)";
  return (
    <WobbleBox seed={9001} fill="busfill" stroke="rainbow" sw={3.5} amp={2.4} shadow alpha={0.85} className="w-[144px] shrink-0 sm:w-[158px]">
      <div className="flex flex-col items-center px-3 pb-3.5 pt-3">
        <div
          className="taffy-ink text-[29px] font-bold leading-none"
          style={{ background: RB, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
        >
          Bus
        </div>
        {/* reverb knob sits where the channels' M/S row is, above the EQ */}
        <Knob label="reverb" value={props.reverb} onChange={props.onReverb} color="#8338ec" />
        <EqGraph eq={props.eq} onChange={props.onEq} onCommit={props.onPrintEq} color="#8338ec" rainbow />
        <VuDial color="#8338ec" seed={9001} needleRef={props.needleRef} grRef={props.grRef} compOn={props.compOn} onClick={props.onOpenComp} />
        {/* spacer where the channels' pan slider is, to keep the faders aligned */}
        <div className="mt-2 h-[17px]" />

        <div className="mt-2.5 flex h-[225px] items-stretch justify-center gap-2.5">
          <Fader db={db} onChange={props.onFader} label="Bus master" color="#8338ec" capFill={RB} />
          <MeterBar meterRef={props.meterLRef} peakRef={props.peakLRef} />
          <MeterBar meterRef={props.meterRRef} peakRef={props.peakRRef} />
        </div>

        <div className="taffy-ink mt-2 text-[18px] font-bold leading-none tabular-nums text-[#2a241d]/75">
          {db <= FADER_MIN ? "-∞" : `${db > 0 ? "+" : ""}${db.toFixed(1)}`} dB
        </div>
      </div>
    </WobbleBox>
  );
}

// ---- mute / solo button ------------------------------------------------------

function MsButton({ on, kind, label, onClick }: { on: boolean; kind: "m" | "s"; label: string; onClick: () => void }) {
  const onStyle =
    kind === "m"
      ? { background: "#e63946", color: "#fff", borderColor: "#e63946" }
      : { background: "#ffd166", color: INK, borderColor: "#caa000" };
  const off = { background: "rgba(255,255,255,0.5)", color: INK, borderColor: INK };
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className="taffy-ink taffy-hand-sm flex h-[29px] w-[34px] items-center justify-center border-[2.5px] text-[18px] font-bold leading-none transition active:translate-y-[1px] focus-visible:outline-none"
      style={on ? onStyle : off}
    >
      {kind.toUpperCase()}
    </button>
  );
}

// ---- analog VU dial ----------------------------------------------------------

function VuDial({
  color,
  seed,
  needleRef,
  grRef,
  compOn,
  onClick,
}: {
  color: string;
  seed: number;
  needleRef: (el: SVGLineElement | null) => void;
  grRef: (el: SVGRectElement | null) => void;
  compOn?: boolean;
  onClick?: () => void;
}) {
  // Static geometry, computed once per dial.
  const { ticks, nums, arcInk, arcRed, glass, grBox, leds } = useMemo(() => {
    const PX = 60, PY = 74, rTick = 50, rIn = 44, rNum = 38;
    const pol = (deg: number, r: number): [number, number] => {
      const a = ((deg - 90) * Math.PI) / 180;
      return [+(PX + r * Math.cos(a)).toFixed(1), +(PY + r * Math.sin(a)).toFixed(1)];
    };
    const TICKS: [number, string][] = [
      [-60, "20"], [-44, ""], [-29, "10"], [-14, "5"], [0, "3"], [18, ""], [36, "0"], [50, ""], [60, "+3"],
    ];
    const tk = TICKS.map((t) => {
      const o = pol(t[0], rIn), i = pol(t[0], rTick);
      return { o, i, label: t[1], n: pol(t[0], rNum) };
    });
    const aL = pol(-60, rTick), aM = pol(36, rTick), aR = pol(60, rTick);
    const ledLines = Array.from({ length: 13 }, (_, k) => +(9 + (104 * (k + 1)) / 14).toFixed(1));
    return {
      ticks: tk,
      nums: tk.filter((t) => t.label),
      arcInk: `M${aL[0]} ${aL[1]} A${rTick} ${rTick} 0 0 1 ${aM[0]} ${aM[1]}`,
      arcRed: `M${aM[0]} ${aM[1]} A${rTick} ${rTick} 0 0 1 ${aR[0]} ${aR[1]}`,
      glass: wobblePath(120, 86, 5, 1.5, seed * 61 + 13),
      grBox: wobblePath(110, 12, 1.6, 1.0, seed * 61 + 29),
      leds: ledLines,
    };
  }, [seed]);

  const gid = `gr${seed}`;
  const clip = `grc${seed}`;
  const glow = `gl${seed}`;
  return (
   <button
     type="button"
     onClick={onClick}
     title="Compressor (click to open)"
     className="relative mt-2 block w-full cursor-pointer focus-visible:outline-none"
   >
    {compOn && (
      <span className="taffy-ink absolute right-1 top-0 z-[2] rounded-sm px-1 text-[11px] font-bold leading-none text-[#fffdf7]" style={{ background: color }}>
        COMP
      </span>
    )}
    <svg className="block w-full" viewBox="0 0 120 102" preserveAspectRatio="xMidYMid meet" style={{ height: 106 }}>
      <defs>
        <linearGradient id={glow} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.5)" />
          <stop offset="0.55" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e63946" />
          <stop offset="0.5" stopColor="#ff7a2f" />
          <stop offset="1" stopColor="#ffcf3a" />
        </linearGradient>
        <clipPath id={clip}>
          <path d={grBox} transform="translate(5,88)" />
        </clipPath>
      </defs>
      <path d={glass} fill="#f4ead0" stroke={INK} strokeWidth="2.5" />
      <path d={arcInk} fill="none" stroke={INK} strokeWidth="1.5" />
      <path d={arcRed} fill="none" stroke="#e63946" strokeWidth="3.2" />
      {ticks.map((t, i) => (
        <line key={i} x1={t.o[0]} y1={t.o[1]} x2={t.i[0]} y2={t.i[1]} stroke={INK} strokeWidth="1.4" />
      ))}
      {nums.map((t, i) => (
        <text key={i} x={t.n[0]} y={t.n[1]} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fill="#6f6457">
          {t.label}
        </text>
      ))}
      <line ref={needleRef} x1="60" y1="74" x2="60" y2="24" stroke={INK} strokeWidth="2.2" strokeLinecap="round" transform="rotate(-60 60 74)" />
      <circle cx="60" cy="74" r="4" fill={color} stroke={INK} strokeWidth="2" />
      <rect x="9" y="9" width="102" height="30" rx="7" fill={`url(#${glow})`} pointerEvents="none" />
      <path d={grBox} transform="translate(5,88)" fill="#efe7d6" stroke={INK} strokeWidth="2" />
      <g clipPath={`url(#${clip})`}>
        <rect ref={grRef} x="113" y="88" width="0" height="12" fill={`url(#${gid})`} />
        {leds.map((x, i) => (
          <line key={i} x1={x} y1="90" x2={x} y2="98" stroke="rgba(42,36,29,.3)" strokeWidth="1" />
        ))}
      </g>
    </svg>
   </button>
  );
}

// ---- EQ graph (live, draggable: 4 bands in 2D + HPF/LPF) ----------------------

const EQ_W = 100, EQ_H = 56, EQ_DB = 15;
const LOG_MIN = Math.log10(20), LOG_MAX = Math.log10(20000);
const fxOf = (freq: number) => (Math.log10(freq) - LOG_MIN) / (LOG_MAX - LOG_MIN);
const freqOfFx = (xf: number) => Math.pow(10, LOG_MIN + Math.max(0, Math.min(1, xf)) * (LOG_MAX - LOG_MIN));
const gainToY = (g: number) => EQ_H / 2 - (g / EQ_DB) * (EQ_H / 2 - 5);

// Build the EqBand[] (for curvePath) from the live EQ state.
function eqToBands(eq: EqState): EqBand[] {
  const out: EqBand[] = [];
  if (eq.hpf) out.push({ type: "highpass", freq: eq.hpfFreq, gain: 0, q: 0.7 });
  eq.bands.forEach((b, i) => {
    const def = EQ_BAND_DEFAULTS[i];
    out.push({ type: def.type as EqBand["type"], freq: b.freq, gain: b.gain, q: def.q });
  });
  if (eq.lpf) out.push({ type: "lowpass", freq: eq.lpfFreq, gain: 0, q: 0.7 });
  return out;
}

function EqGraph({
  eq,
  onChange,
  onCommit,
  color,
  rainbow,
}: {
  eq: EqState;
  onChange: (eq: EqState) => void;
  onCommit: (eq: EqState) => void;
  color: string;
  rainbow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragBand = useRef<number>(-1);
  const latest = useRef<EqState>(eq);
  latest.current = eq;
  const path = curvePath(eqToBands(eq), EQ_W, EQ_H, 80, EQ_DB);
  const stroke = rainbow ? "url(#eq-rainbow)" : color;

  const bandAt = (xf: number) => {
    let best = 0, bd = Infinity;
    eq.bands.forEach((b, i) => { const d = Math.abs(fxOf(b.freq) - xf); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const fromEvent = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const xf = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const yf = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    if (dragBand.current < 0) dragBand.current = bandAt(xf);
    const i = dragBand.current;
    const freq = Math.max(EQ_FREQ_MIN, Math.min(EQ_FREQ_MAX, freqOfFx(xf)));
    const gain = Math.max(-EQ_DB, Math.min(EQ_DB, ((EQ_H / 2 - yf * EQ_H) / (EQ_H / 2 - 5)) * EQ_DB));
    const bands = latest.current.bands.map((b, j) => (j === i ? { freq, gain } : b));
    onChange({ ...latest.current, bands });
  };
  const onDown = (e: React.PointerEvent) => { dragBand.current = -1; try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {} fromEvent(e); };
  const onMove = (e: React.PointerEvent) => { if (dragBand.current >= 0) fromEvent(e); };
  const onUp = () => { if (dragBand.current >= 0) onCommit(latest.current); dragBand.current = -1; };
  const toggle = (key: "hpf" | "lpf") => { const next = { ...latest.current, [key]: !latest.current[key] }; onChange(next); onCommit(next); };

  return (
    <div className="mt-2 w-full">
      {/* HPF / LPF toggles */}
      <div className="mb-1 flex justify-between gap-1">
        <EqToggle on={eq.hpf} label="HPF" onClick={() => toggle("hpf")} />
        <EqToggle on={eq.lpf} label="LPF" onClick={() => toggle("lpf")} />
      </div>
      <div
        ref={ref}
        className="taffy-hand-sm relative w-full cursor-move touch-none select-none overflow-hidden border-[2px] border-[#2a241d]"
        style={{ background: "#efe7d6" }}
        title="Drag a band: up/down = gain, left/right = frequency · double-click to flatten a band"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={(e) => {
          const el = ref.current; if (!el) return;
          const r = el.getBoundingClientRect();
          const i = bandAt((e.clientX - r.left) / r.width);
          const next = { ...eq, bands: eq.bands.map((b, j) => (j === i ? { ...b, gain: 0 } : b)) };
          onChange(next); onCommit(next);
        }}
      >
        <svg viewBox={`0 0 ${EQ_W} ${EQ_H}`} className="block h-[56px] w-full" preserveAspectRatio="none">
          {rainbow && (
            <defs>
              <linearGradient id="eq-rainbow" x1="0" y1="0" x2="1" y2="0">
                {RAINBOW.map((c, i) => <stop key={i} offset={i / (RAINBOW.length - 1)} stopColor={c} />)}
              </linearGradient>
            </defs>
          )}
          <line x1="0" y1={EQ_H / 2} x2={EQ_W} y2={EQ_H / 2} stroke="rgba(42,36,29,0.16)" strokeWidth="1" />
          <path d={path} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {eq.bands.map((b, i) => (
            <circle
              key={i}
              cx={fxOf(b.freq) * EQ_W}
              cy={gainToY(b.gain)}
              r="3.4"
              fill="#fffdf7"
              stroke={rainbow ? RAINBOW[i % RAINBOW.length] : color}
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

function EqToggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="taffy-ink taffy-hand-sm flex-1 border-[2px] py-[1px] text-[13px] font-bold leading-tight transition active:translate-y-[1px] focus-visible:outline-none"
      style={on ? { background: "#8338ec", color: "#fff", borderColor: "#8338ec" } : { background: "rgba(255,255,255,0.5)", color: INK, borderColor: INK }}
    >
      {label}
    </button>
  );
}

// ---- level meter bar ---------------------------------------------------------

function MeterBar({ meterRef, peakRef }: { meterRef: (el: HTMLDivElement | null) => void; peakRef: (el: HTMLDivElement | null) => void }) {
  return (
    <div
      className="relative h-full w-[17px] overflow-hidden border-[2.5px] border-[#2a241d]"
      style={{
        borderRadius: 5,
        background: "linear-gradient(0deg,#12a06d 0%,#2bb87e 52%,#9ccc3a 68%,#e6b21f 81%,#ff7a2f 91%,#e63946 100%)",
      }}
    >
      <div ref={meterRef} className="absolute inset-x-0 top-0" style={{ height: "100%", background: "#efe7d6" }} />
      <div ref={peakRef} className="absolute inset-x-0 z-[3] h-[2.5px] bg-[#2a241d]/70" style={{ bottom: "0%" }} />
    </div>
  );
}

// ---- pan slider --------------------------------------------------------------

function PanSlider({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const fromX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onChange(Math.max(-1, Math.min(1, ((clientX - r.left) / r.width - 0.5) * 2)));
  }, [onChange]);
  const onDown = (e: React.PointerEvent) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); fromX(e.clientX); };
  const onMove = (e: React.PointerEvent) => { if (dragging.current) fromX(e.clientX); };
  const onUp = () => { dragging.current = false; };
  const lbl = value === 0 ? "C" : value < 0 ? `L${Math.round(-value * 100)}` : `R${Math.round(value * 100)}`;
  return (
    <div className="mt-2 flex w-full flex-col items-center">
      <div
        ref={trackRef}
        role="slider"
        aria-label="Pan"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={lbl}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => onChange(0)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { onChange(value - 0.05); e.preventDefault(); }
          else if (e.key === "ArrowRight") { onChange(value + 0.05); e.preventDefault(); }
        }}
        className="relative h-[17px] w-[80%] cursor-ew-resize touch-none select-none focus-visible:outline-none"
        title={`Pan ${lbl} (double-click to center)`}
      >
        {/* track well */}
        <div className="absolute left-0 right-0 top-1/2 h-[6px] -translate-y-1/2 border-[2px] border-[#2a241d]" style={{ background: "#efe7d6", borderRadius: 4 }} />
        {/* center tick */}
        <div className="absolute left-1/2 top-1/2 h-[15px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-[#2a241d]/45" />
        {/* dot */}
        <div
          className="absolute top-1/2 h-[16px] w-[16px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-[#2a241d]"
          style={{ left: `${50 + value * 46}%`, background: color, boxShadow: "1px 1px 0 rgba(42,36,29,0.25)" }}
        />
      </div>
    </div>
  );
}

// ---- knob (reverb amount) ----------------------------------------------------

function Knob({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  const dy = useRef<number | null>(null);
  const dv = useRef(0);
  const onDown = (e: React.PointerEvent) => { dy.current = e.clientY; dv.current = value; try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {} };
  const onMove = (e: React.PointerEvent) => { if (dy.current == null) return; onChange(Math.max(0, Math.min(1, dv.current + (dy.current - e.clientY) / 150))); };
  const onUp = () => { dy.current = null; };
  const R = 13, cx = 18, cy = 18, a0 = Math.PI * 0.75, a1 = a0 + Math.PI * 1.5 * value;
  const sx = cx + Math.cos(a0) * R, sy = cy + Math.sin(a0) * R, ex = cx + Math.cos(a1) * R, ey = cy + Math.sin(a1) * R, lg = a1 - a0 > Math.PI ? 1 : 0;
  return (
    <div
      className="taffy-ink mt-2 flex h-[30px] cursor-ns-resize touch-none select-none flex-row items-center justify-center gap-1.5"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={() => onChange(0.15)}
      title={`${label} (drag, double-click to reset)`}
    >
      <svg width="30" height="30" viewBox="0 0 36 36" className="shrink-0">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#ece0c8" strokeWidth="4" />
        <path d={`M${sx.toFixed(1)} ${sy.toFixed(1)} A${R} ${R} 0 ${lg} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="7" fill="#fffdf7" stroke={INK} strokeWidth="2" />
        <line x1={cx} y1={cy - 2} x2={cx} y2={cy - 9.5} stroke={INK} strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${-135 + 270 * value} ${cx} ${cy})`} />
      </svg>
      <div className="whitespace-nowrap text-[15px] font-bold leading-none text-[#2a241d]/75">{label} {Math.round(value * 100)}%</div>
    </div>
  );
}

// ---- vertical fader ----------------------------------------------------------

function Fader({ db, onChange, label, color, capFill }: { db: number; onChange: (db: number) => void; label: string; color: string; capFill?: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const fromClientY = useCallback((clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = 1 - Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    onChange(fracToDb(frac));
  }, [onChange]);
  const onDown = (e: React.PointerEvent) => { dragging.current = true; try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic */ } fromClientY(e.clientY); };
  const onMove = (e: React.PointerEvent) => { if (dragging.current) fromClientY(e.clientY); };
  const onUp = () => { dragging.current = false; };
  const onKey = (e: React.KeyboardEvent) => {
    const big = e.shiftKey ? 6 : 1;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { onChange(db + big); e.preventDefault(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { onChange(db - big); e.preventDefault(); }
  };
  const top = dbToTop(db);
  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={`${label} fader`}
      aria-valuemin={FADER_MIN}
      aria-valuemax={FADER_MAX}
      aria-valuenow={Math.round(db)}
      aria-valuetext={`${db.toFixed(1)} decibels`}
      tabIndex={0}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
      className="relative h-full w-10 cursor-ns-resize touch-none select-none focus-visible:outline-none"
    >
      <div className="absolute left-1/2 top-1.5 bottom-1.5 w-[9px] -translate-x-1/2 border-[2.5px] border-[#2a241d]" style={{ background: "#efe7d6", borderRadius: 5 }} />
      {/* unity tick at 0 dB */}
      <div className="absolute left-1/2 h-[2px] w-4 -translate-x-1/2 bg-[#2a241d]/40" style={{ top: `${dbToTop(0)}%` }} />
      <div
        className="absolute left-1/2 h-[23px] w-[36px] -translate-x-1/2 -translate-y-1/2 border-[2.5px] border-[#2a241d]"
        style={{ top: `${top}%`, background: capFill || color, borderRadius: 6, boxShadow: "2px 3px 0 rgba(42,36,29,0.22)" }}
      >
        <div className="absolute inset-x-1 top-1/2 h-[2.5px] -translate-y-1/2 rounded bg-[#2a241d]/55" />
      </div>
    </div>
  );
}

// ---- scrubbable bus waveform player ------------------------------------------

const WF_W = 1000, WF_H = 100;
function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function WaveformPlayer({
  engineRef,
  looping,
  onPlay,
  onPause,
  onStop,
  onLoop,
}: {
  engineRef: React.MutableRefObject<TaffyEngine | null>;
  looping: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onLoop: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<SVGLineElement | null>(null);
  const playedRef = useRef<SVGRectElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const drag = useRef({ active: false, startF: 0, moved: false });
  const [sel, setSel] = useState<[number, number] | null>(null); // loop region, fractions

  const path = useMemo(() => {
    const wf = engineRef.current?.waveform || [];
    if (!wf.length) return "";
    const n = wf.length;
    let top = `M0,${WF_H / 2}`;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * WF_W;
      const a = Math.pow(wf[i], 0.8) * (WF_H / 2 - 3);
      top += ` L${x.toFixed(1)},${(WF_H / 2 - a).toFixed(1)}`;
    }
    for (let i = n - 1; i >= 0; i--) {
      const x = (i / (n - 1)) * WF_W;
      const a = Math.pow(wf[i], 0.8) * (WF_H / 2 - 3);
      top += ` L${x.toFixed(1)},${(WF_H / 2 + a).toFixed(1)}`;
    }
    return top + " Z";
  }, [engineRef]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const e = engineRef.current;
      if (e && e.loopLen) {
        const x = (e.getPosition() / e.loopLen) * WF_W;
        headRef.current?.setAttribute("x1", x.toFixed(1));
        headRef.current?.setAttribute("x2", x.toFixed(1));
        playedRef.current?.setAttribute("width", x.toFixed(1));
        if (timeRef.current) timeRef.current.textContent = `${fmtTime(e.getPosition())} / ${fmtTime(e.loopLen)}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engineRef]);

  const fracOf = (clientX: number) => {
    const el = boxRef.current; if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  const onDown = (e: React.PointerEvent) => {
    drag.current = { active: true, startF: fracOf(e.clientX), moved: false };
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {}
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const f = fracOf(e.clientX);
    if (Math.abs(f - drag.current.startF) > 0.01) drag.current.moved = true;
    if (drag.current.moved) setSel([Math.min(drag.current.startF, f), Math.max(drag.current.startF, f)]);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const eng = engineRef.current;
    if (drag.current.moved && eng) {
      const f = fracOf(e.clientX);
      const a = Math.min(drag.current.startF, f), b = Math.max(drag.current.startF, f);
      setSel([a, b]);
      eng.setLoopRegion([a * eng.loopLen, b * eng.loopLen]);
    } else if (eng) {
      // a click = scrub, and clear any selection (loop the whole clip)
      setSel(null);
      eng.setLoopRegion(null);
      eng.seek(drag.current.startF * eng.loopLen);
    }
    drag.current.active = false;
  };

  return (
    <div className="w-full">
      {/* waveform (clean rectangular frame, no wobble) */}
      <div
        ref={boxRef}
        className="relative h-[174px] w-full cursor-text touch-none select-none overflow-hidden rounded-[10px] border-[3px] border-[#2a241d]"
        style={{ background: "#fffdf7", boxShadow: "2px 3px 0 rgba(42,36,29,0.18)" }}
        title="Click to scrub · drag to select a loop section · double-click to clear"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => { setSel(null); engineRef.current?.setLoopRegion(null); }}
      >
        <svg viewBox={`0 0 ${WF_W} ${WF_H}`} className="block h-full w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="wf-rb" x1="0" y1="0" x2="1" y2="0">
              {RAINBOW.map((c, i) => <stop key={i} offset={i / (RAINBOW.length - 1)} stopColor={c} />)}
            </linearGradient>
            <clipPath id="wf-played"><rect ref={playedRef} x="0" y="0" width="0" height={WF_H} /></clipPath>
          </defs>
          <path d={path} fill="url(#wf-rb)" opacity="0.3" />
          <path d={path} fill="url(#wf-rb)" clipPath="url(#wf-played)" />
          {sel && (
            <g>
              <rect x={sel[0] * WF_W} y="0" width={(sel[1] - sel[0]) * WF_W} height={WF_H} fill="rgba(42,36,29,0.12)" />
              <line x1={sel[0] * WF_W} y1="0" x2={sel[0] * WF_W} y2={WF_H} stroke={INK} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <line x1={sel[1] * WF_W} y1="0" x2={sel[1] * WF_W} y2={WF_H} stroke={INK} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </g>
          )}
          <line ref={headRef} x1="0" y1="0" x2="0" y2={WF_H} stroke={INK} strokeWidth="3.5" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      {/* transport: one consistent set of black icons, same size, no colors */}
      <div className="mt-3 flex items-center gap-7">
        <button type="button" onClick={onPlay} aria-label="Play"
          className="text-[#2a241d]/75 transition hover:scale-110 hover:text-[#2a241d] active:translate-y-[1px]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z" /></svg>
        </button>
        <button type="button" onClick={onPause} aria-label="Pause"
          className="text-[#2a241d]/75 transition hover:scale-110 hover:text-[#2a241d] active:translate-y-[1px]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5.5" width="3.6" height="13" rx="0.6" /><rect x="13.9" y="5.5" width="3.6" height="13" rx="0.6" /></svg>
        </button>
        <button type="button" onClick={onStop} aria-label="Stop"
          className="text-[#2a241d]/75 transition hover:scale-110 hover:text-[#2a241d] active:translate-y-[1px]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.4" /></svg>
        </button>
        <button type="button" onClick={onLoop} aria-label={looping ? "Looping" : "Loop off"} aria-pressed={looping}
          className={`transition hover:scale-110 active:translate-y-[1px] ${looping ? "text-[#2a241d]" : "text-[#2a241d]/40 hover:text-[#2a241d]/75"}`}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" />
            <path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
          </svg>
        </button>
        <span ref={timeRef} className="taffy-ink ml-auto whitespace-nowrap text-[28px] font-bold tabular-nums leading-none text-[#2a241d]/80">0:00 / 1:00</span>
      </div>
    </div>
  );
}

// ---- compressor popup --------------------------------------------------------

function ParamKnob({
  label, value, min, max, fmt, color, onChange, onCommit,
}: {
  label: string; value: number; min: number; max: number;
  fmt: (v: number) => string; color: string;
  onChange: (v: number) => void; onCommit: () => void;
}) {
  const dy = useRef<number | null>(null);
  const dv = useRef(0);
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const onDown = (e: React.PointerEvent) => { dy.current = e.clientY; dv.current = norm; try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {} };
  const onMove = (e: React.PointerEvent) => {
    if (dy.current == null) return;
    const n = Math.max(0, Math.min(1, dv.current + (dy.current - e.clientY) / 180));
    onChange(min + n * (max - min));
  };
  const onUp = () => { if (dy.current != null) onCommit(); dy.current = null; };
  const R = 18, cx = 24, cy = 24, a0 = Math.PI * 0.75, a1 = a0 + Math.PI * 1.5 * norm;
  const sx = cx + Math.cos(a0) * R, sy = cy + Math.sin(a0) * R, ex = cx + Math.cos(a1) * R, ey = cy + Math.sin(a1) * R, lg = a1 - a0 > Math.PI ? 1 : 0;
  return (
    <div className="taffy-ink flex w-[78px] cursor-ns-resize touch-none select-none flex-col items-center"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <svg width="52" height="52" viewBox="0 0 48 48">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#ece0c8" strokeWidth="5" />
        <path d={`M${sx.toFixed(1)} ${sy.toFixed(1)} A${R} ${R} 0 ${lg} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="9" fill="#fffdf7" stroke={INK} strokeWidth="2.5" />
        <line x1={cx} y1={cy - 3} x2={cx} y2={cy - 13} stroke={INK} strokeWidth="3" strokeLinecap="round" transform={`rotate(${-135 + 270 * norm} ${cx} ${cy})`} />
      </svg>
      <div className="mt-0.5 text-[15px] font-bold leading-none">{fmt(value)}</div>
      <div className="text-[13px] font-bold uppercase leading-tight text-[#2a241d]/55">{label}</div>
    </div>
  );
}

function CompPopup({
  label, color, comp, onChange, onCommit, getReduction, onClose,
}: {
  label: string; color: string; comp: CompState;
  onChange: (c: CompState) => void; onCommit: (c: CompState) => void;
  getReduction: () => number; onClose: () => void;
}) {
  const grRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef(comp);
  latest.current = comp;
  const set = (patch: Partial<CompState>) => onChange({ ...latest.current, ...patch });
  const commit = () => onCommit(latest.current);
  // toggle + print the *new* state in one shot (commit() alone would print the stale value)
  const setCommit = (patch: Partial<CompState>) => { const next = { ...latest.current, ...patch }; latest.current = next; onChange(next); onCommit(next); };

  useEffect(() => {
    let raf = 0;
    const tick = () => { const r = getReduction(); if (grRef.current) grRef.current.style.height = `${Math.max(0, Math.min(1, r / 18)) * 100}%`; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getReduction]);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-[20] flex items-center justify-center p-4" style={{ background: "rgba(42,36,29,0.28)" }} onClick={onClose}>
      <WobbleBox seed={555} fill="#fffdf7" stroke={color} sw={4} amp={2.4} shadow alpha={1} className="max-w-[560px]">
        <div className="taffy-ink px-6 py-5" onClick={(e) => e.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between gap-6">
            <div className="flex items-baseline gap-3">
              <span className="text-[26px] font-bold leading-none" style={{ color }}>{label}</span>
              <span className="text-[18px] font-bold leading-none text-[#2a241d]/55">compressor</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCommit({ on: !comp.on })}
                role="switch"
                aria-checked={comp.on}
                aria-label="Compressor on/off"
                className="taffy-ink flex items-center gap-2"
                title="Compressor on/off"
              >
                <span className="text-[15px] font-bold uppercase leading-none" style={{ color: comp.on ? color : "#2a241d80" }}>
                  {comp.on ? "on" : "off"}
                </span>
                {/* sliding pill switch */}
                <span
                  className="relative inline-block h-[26px] w-[46px] rounded-full border-[2.5px] transition-colors duration-150"
                  style={{ background: comp.on ? color : "#e6ddca", borderColor: comp.on ? color : "#2a241d40" }}
                >
                  <span
                    className="absolute top-[1px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all duration-150"
                    style={{ left: comp.on ? "23px" : "2px" }}
                  />
                </span>
              </button>
              <button onClick={onClose} className="taffy-ink taffy-hand-sm border-[2.5px] border-[#2a241d] bg-[#fffdf7] px-3 py-1 text-[16px] font-bold leading-tight transition active:translate-y-[1px]">done</button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-1 flex-wrap justify-center gap-1">
              <ParamKnob label="thresh" value={comp.threshold} min={-60} max={0} fmt={(v) => `${v.toFixed(0)}dB`} color={color} onChange={(v) => set({ threshold: v })} onCommit={commit} />
              <ParamKnob label="ratio" value={comp.ratio} min={1} max={20} fmt={(v) => `${v.toFixed(1)}:1`} color={color} onChange={(v) => set({ ratio: v })} onCommit={commit} />
              <ParamKnob label="attack" value={comp.attack} min={0.001} max={0.25} fmt={(v) => `${(v * 1000).toFixed(0)}ms`} color={color} onChange={(v) => set({ attack: v })} onCommit={commit} />
              <ParamKnob label="release" value={comp.release} min={0.02} max={0.6} fmt={(v) => `${(v * 1000).toFixed(0)}ms`} color={color} onChange={(v) => set({ release: v })} onCommit={commit} />
              <ParamKnob label="knee" value={comp.knee} min={0} max={40} fmt={(v) => `${v.toFixed(0)}`} color={color} onChange={(v) => set({ knee: v })} onCommit={commit} />
              <ParamKnob label="makeup" value={comp.makeup} min={0} max={12} fmt={(v) => `+${v.toFixed(1)}`} color={color} onChange={(v) => set({ makeup: v })} onCommit={commit} />
            </div>
            {/* gain-reduction meter */}
            <div className="flex flex-col items-center">
              <div className="relative h-[120px] w-[16px] overflow-hidden rounded border-[2.5px] border-[#2a241d]" style={{ background: "#efe7d6" }}>
                <div ref={grRef} className="absolute inset-x-0 top-0" style={{ height: "0%", background: "linear-gradient(180deg,#e63946,#ff7a2f 60%,#ffcf3a)" }} />
              </div>
              <div className="mt-1 text-[12px] font-bold uppercase text-[#2a241d]/55">GR</div>
            </div>
          </div>
          <div className="mt-3 text-center text-[13px] font-bold leading-tight text-[#2a241d]/45">auto gain-matched · drag knobs · values print to the console for the mix</div>
        </div>
      </WobbleBox>
    </div>
  );
}
