import { useContext, useState } from "react";
import Waveform from "./Waveform";
import Chat from "./Chat";
import MobileChat from "./MobileChat";
import { useIsMobile } from "../hooks/useIsMobile";
import { DeckContext } from "../deck";

export default function Hero() {
  const { go } = useContext(DeckContext);
  const isMobile = useIsMobile();
  // Lets the waveform lift its amplitude briefly while a reply is streaming,
  // without the two components needing to know about each other directly.
  const [streaming, setStreaming] = useState(false);
  return (
    <header
      id="ask"
      className="relative flex min-h-full flex-col justify-center overflow-hidden px-6 py-8 sm:py-12"
    >
      {/* subtle iridescent waveform, low and masked so it never fights the text */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 top-1/2 opacity-55 [mask-image:radial-gradient(120%_130%_at_50%_120%,black_35%,transparent_72%)]"
        aria-hidden="true"
      >
        <Waveform boost={streaming} />
      </div>

      <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center text-center lg:max-w-3xl">
        <div className="mb-3 flex items-center gap-2.5 font-sans text-xs tracking-widest text-muted">
          <span className="h-2 w-2 rounded-full bg-clay shadow-[0_0_12px_rgba(155,124,255,0.9)]" />
          JUSTIN GYURIK
        </div>

        <h1 className="max-w-2xl font-display text-[clamp(2.2rem,6vw,4rem)] font-semibold leading-[1.05] tracking-tight">
          I build <span className="iris-text">AI-native software</span>.
        </h1>
        <p className="mt-3 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
          Mostly for people learning something hard. The assistant below knows my
          work, so go ahead and ask it anything. That's the easiest way in.
        </p>

        <div className="relative mt-6 w-full">
          {/* Ambient glow behind the chat panel: the centerpiece gets a slow,
              barely-there breath of light. Disabled under reduced motion via
              the .hero-chat-glow rule in index.css. */}
          <div
            className="hero-chat-glow pointer-events-none absolute -inset-x-6 -inset-y-8 -z-10 rounded-[48px] blur-3xl sm:-inset-x-10"
            style={{ background: "radial-gradient(60% 60% at 50% 45%, rgba(155,124,255,0.55), transparent 75%)" }}
            aria-hidden="true"
          />
          {isMobile ? <MobileChat /> : <Chat onStreamingChange={setStreaming} />}
        </div>

        {!isMobile && (
          <button
            onClick={() => go(1)}
            className="group mt-5 inline-flex items-center gap-2 rounded-full border border-line px-5 py-2 font-sans text-[13px] font-medium tracking-widest text-muted transition hover:border-clay/60 hover:text-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
          >
            OR SEE THE WORK
            <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
