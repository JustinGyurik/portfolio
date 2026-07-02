import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Chat from "./Chat";

// On mobile the chat is NOT inlined under the hero (it dominates the screen and
// feels cramped). Instead the hero shows an inviting launcher; tapping it opens
// the chat as a full-screen experience with a clear way back out.
export default function MobileChat() {
  const [open, setOpen] = useState(false);

  // Lock background scroll + close on Escape while the overlay is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="iris-ring group flex w-full items-center gap-3 rounded-2xl border border-line bg-panel/70 px-4 py-3.5 text-left shadow-[0_30px_80px_-30px_rgba(124,92,255,0.5)] backdrop-blur transition hover:-translate-y-0.5 hover:border-clay/50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clay text-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-paper">Ask my portfolio anything</span>
          <span className="block text-[13px] text-faint">The assistant knows Justin's work. Tap to chat.</span>
        </span>
        <span aria-hidden="true" className="text-clay transition group-active:translate-x-0.5">→</span>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex h-[100dvh] flex-col bg-ink">
            <header className="flex items-center justify-between gap-3 border-b border-line/70 bg-coal/70 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-clay shadow-[0_0_12px_rgba(155,124,255,0.9)]" />
                <span className="font-display text-base font-semibold tracking-tight text-paper">
                  Ask my portfolio
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="flex items-center gap-1.5 rounded-full border border-line bg-ink/60 px-3.5 py-1.5 text-[13px] font-medium uppercase tracking-wide text-paper transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
              >
                Done
                <span aria-hidden="true">✕</span>
              </button>
            </header>
            <div className="min-h-0 flex-1">
              <Chat fullscreen />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
