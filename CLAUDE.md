# CLAUDE.md — working notes for this repo

This is Justin Gyurik's personal portfolio. It is also a work sample: the site itself is meant to demonstrate front-end craft, motion, and AI-native product thinking for a Design Engineer application (Anthropic, Education Labs). Treat polish and interaction feel as part of the spec, not decoration.

## What this is
- Vite + React 18 + TypeScript + Tailwind, single-page.
- Identity: "studio / creative" — warm-dark, film grain, a living waveform motif, builds presented as a "tracklist." It should feel like a builder who is also a musician, without tipping into gimmick.
- The centerpiece is a real Claude-powered chat ("Ask my portfolio anything") that answers questions about Justin grounded in his actual work.

## Architecture
- `src/content/justin.ts` is the **single source of truth**. Profile, builds, experience, stack, suggested questions, and the chat's `SYSTEM_CONTEXT` all live here. Edit copy here and it updates the UI and the chat together.
- `api/chat.ts` is a Vercel serverless function (`POST /api/chat`). It calls the Anthropic Messages API with `SYSTEM_CONTEXT` as the system prompt. The API key stays server-side in `ANTHROPIC_API_KEY`. Never move the key or the model call into client code.
- Components in `src/components/`: `Hero` (typing headline + `Waveform`), `Builds` (accordion tracklist), `About` (timeline + stack), `Chat` (the assistant). `useReveal` handles scroll-in animation.

## Conventions
- Voice everywhere: direct, structured, confident without hype, **no emdashes**. This is Justin's hard rule.
- Respect `prefers-reduced-motion`. The waveform and typing effect already check it; keep that contract for anything new.
- Colors come from the Tailwind theme (`clay`, `amber`, `ink`, `paper`, etc.). Don't hardcode hex in components.
- Keep it dependency-light. No animation libs unless there's a real reason; the motion here is hand-rolled on purpose (it's the point).

## Common tasks
- **Update a project or fact:** edit `src/content/justin.ts`.
- **Change how the chat answers:** edit `SYSTEM_CONTEXT` in the same file.
- **Swap the model / cost tune:** `ANTHROPIC_MODEL` env var, or the `MODEL` default in `api/chat.ts`.
- **Add a section:** new component in `src/components/`, mount in `src/App.tsx`, add `reveal` classes for scroll-in.

## Interactive build demos
- Builds can carry a live, in-browser demo, launched from a "Try it out" button in the zoom panel. Set `demo: "fluent" | "taffy"` (and optional `demoLabel`) on a build in `src/content/justin.ts`. The overlay is portaled to `<body>` because it must escape the deck's transformed track, or `position: fixed` breaks. Code: `src/components/TaffyDemo.tsx`, `src/components/FluentDemo.tsx`, and `DemoHost` in `BuildsCarousel.tsx`.
- **Fluent** loads the real self-contained assessment from `public/demos/fluent/index.html` in a full-screen iframe (installed: it is a copy of `~/Documents/Onboarding Activity/ai-fluency-activity.html`). If the file is ever absent it shows a clean "not installed yet" state. In the sandbox it runs in its own built-in "offline preview" mode.
- **Taffy** is a working Web Audio mixer sim (`src/taffy/` engine, `src/components/TaffyDemo.tsx` UI) that reproduces the real shipping Taffy plugin UI, not an approximation. The hand-drawn "wobble" outlines are ported verbatim from the plugin (`src/taffy/wobble.ts` ← `Drum Plugin/Source/UI/web/js/app.js`): every card and button is a real wobbled vector path painted behind it by `<WobbleBox>` via ResizeObserver. **9 channels** (Kick In, Kick Out, Snare Top, Snare Bot, Rack Tom, Floor Tom, OH L, OH R, Room). Each strip has the channel name, M/S, **HPF/LPF toggle buttons**, a **live draggable EQ** (real biquads: a high-pass, four peaking bands you drag in 2D — up/down = gain, left/right = frequency — and a low-pass; default flat; `EQ_BAND_DEFAULTS`/`EqState`/`defaultEq` in tracks.ts, `applyEq` in the engine; dragging logs the band values via `printEq` for copy-paste mixing), a **round analog VU dial** (needle off the live RMS with peak ballistics — snappy, sensitive mapping, analyser smoothing 0.3), a **pan slider**, a fader, and a level-meter bar. A **scrubbable bus waveform player** runs across the top (`<WaveformPlayer>`): rainbow envelope of the summed bus, moving playhead, click/drag to seek (engine `seek`/`getPosition`/`computeWaveform`). The **Bus** strip (rainbow `busfill`) is the stereo master with L/R meters, a rainbow fader cap, a rainbow EQ curve, its own live master EQ, and a **reverb knob** at the top of the strip (`setReverb`, 0..1 = how much reverb is ADDED on top of the always-full dry — additive send, not a wet/dry crossfade, so turning it up never gets quieter: `comp → dryGain(1, fixed) → master` and `comp → convolver → wetGain(p) → master`; the room IR is energy-normalized so 100% adds a full-level reverb at the dry level; default 15%). Raw is the **unity stage**: every fader 0 dB, **pan centered**, EQ flat. Auto-mix rides the faders into place (never above unity), **swings the pans out** (kick/snare/room center, toms ±35, OH ±70), shapes the EQ, and **boosts the bus to "come alive"**: an internal `busBoost` makeup gain (`AUTOMIX_BUS_BOOST_DB`, +17 dB) ramps up through a master peak-limiter so the auto-mixed version is ~5 dB louder than raw, all WITHOUT moving the visible bus fader (stays at unity). A light room reverb (`AUTOMIX_REVERB_WET` ~0.12, a synthesized stereo convolver IR) also fades in on auto-mix for glue. Signal chain: channels → `busTrim` (0.55) → `busBoost` → `masterComp` (glue/brickwall) → `master` (user fader) → out, plus a reverb send off `busBoost` returning through `masterComp`; the stereo meter tap is post-everything so the bus VU jumps on auto-mix. Per-track `mixDb` values are Justin's own mix (set by ear in the live demo); tune loudness with `AUTOMIX_BUS_BOOST_DB` (higher = louder but more limiting). Engine also exposes per-channel AnalyserNodes, `setPan`, `setMasterDb`, `getMasterLevels`. The real UI reference: `~/Documents/Claude/Projects/Drum Plugin/Source/UI/web/` (index.html + js/app.js). Real stems are installed: a ~1-minute (24-bar, ~62.7s) OGG Vorbis loop per stem (~92 BPM, ~6MB total) in `public/demos/taffy/{raw,mix}/<id>.ogg`, cut from ~49s into the song so it builds from the verse into the tom-rich chorus (rack + floor fills, lots of dynamics). Raw and processed are cross-correlation-aligned and trimmed to the SAME window; loop length is refined to the groove. OGG keeps a full minute small; the loader (`rawSources`/`mixSources`) tries `.ogg` then `.wav`/`.mp3`. Auto-mix transitions (`setAutoMix` + UI `runAutoMix`): the raw<->mix SOURCE swap is a short ~90ms equal-power crossfade so the legs don't overlap long enough to flam; the boost/reverb/faders/pans bloom IN over 1.2s but snap OUT fast (~0.12-0.3s) so turning auto-mix off returns to clean raw without the boost lingering and blasting. Missing stems would fall back to a synthesized stand-in. Track colors/pan/mixDb/EQ live in `src/taffy/tracks.ts`. See `public/demos/README.md`.

## Chat
- One mode only: an assistant that answers questions about Justin in the third person (interview/first-person mode was removed). System prompt is `SYSTEM_CONTEXT` in `src/content/justin.ts`, grounded in `MASTER_KB` (`src/content/knowledge.ts`), which now has an in-depth "Featured Builds" section per tracklist item. Streamed via `api/chat.ts` (prod) and the `devChatApi` middleware in `vite.config.ts` (local dev). `VOICE_PROFILE` still exists in knowledge.ts but is unused.

## Writing
- The essay "Robots All the Way Down" is published as a 4th deck slide (`src/components/Writing.tsx`, content in `src/content/article.ts`). Source: `~/Documents/Claude/Projects/Anthropic Application/03_Reference/Article_Robots_All_the_Way_Down.txt`.

## Open follow-ups (good next steps)
- The Taffy build-card image (`public/builds/taffy-ui.png`) is the older "classic mixer" Taffy design (round VU needles); the live demo matches the newer shipping UI. Optional: regenerate the card from a demo screenshot so they match.
- Add real screenshots / a short demo clip per build (the Studio timeline). The site currently carries the work in prose; images would make it land harder.
- Consider streaming the chat response (SSE) for a snappier feel.
- Wire `justingyurik.com` as the custom domain in Vercel.
- Optional: a `/resume` route or a download button for the PDF.

## Don't
- Don't expose `ANTHROPIC_API_KEY` to the browser.
- Don't add emdashes to copy.
- Don't invent facts about Justin in `SYSTEM_CONTEXT`; the chat must stay truthful.
