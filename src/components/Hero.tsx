import { useContext } from "react";
import Waveform from "./Waveform";
import Chat from "./Chat";
import { DeckContext } from "../deck";

export default function Hero() {
  const { go } = useContext(DeckContext);
  return (
    <header
      id="ask"
      className="relative flex min-h-full flex-col justify-center overflow-hidden px-6 py-20"
    >
      {/* subtle iridescent waveform, low and masked so it never fights the text */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 top-1/2 opacity-55 [mask-image:radial-gradient(120%_130%_at_50%_120%,black_35%,transparent_72%)]"
        aria-hidden="true"
      >
        <Waveform />
      </div>

      <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center text-center">
        <div className="mb-5 flex items-center gap-2.5 font-sans text-xs tracking-widest text-muted">
          <span className="h-2 w-2 rounded-full bg-clay shadow-[0_0_12px_rgba(155,124,255,0.9)]" />
          JUSTIN GYURIK
        </div>

        <h1 className="font-display text-[clamp(2.2rem,6vw,4rem)] font-semibold leading-[1.05] tracking-tight">
          I build <span className="iris-text">AI-native software</span>.
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
          Mostly for people learning something hard. The assistant below knows my
          work, so go ahead and ask it anything. That's the easiest way in.
        </p>

        <div className="mt-9 w-full">
          <Chat />
        </div>

        <button
          onClick={() => go(1)}
          className="mt-8 inline-flex items-center gap-2 rounded font-sans text-[13px] tracking-widest text-faint transition hover:text-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
        >
          OR SEE THE WORK <span aria-hidden="true">→</span>
        </button>
      </div>
    </header>
  );
}
