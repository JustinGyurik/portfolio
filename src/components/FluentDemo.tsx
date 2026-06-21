import { useEffect, useState } from "react";

// Fluent is a single self-contained HTML artifact. Drop the file at
//   public/demos/fluent/index.html
// and it loads here, full screen, in an iframe. Until then this shows a clean
// "not installed yet" state instead of accidentally embedding the portfolio
// itself (the dev server serves the SPA shell for any missing path).

const FLUENT_URL = "/demos/fluent/index.html";

type Status = "checking" | "ready" | "missing";

export default function FluentDemo({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;
    fetch(FLUENT_URL)
      .then(async (res) => {
        if (!res.ok) return "missing" as const;
        const text = await res.text();
        // The portfolio shell, not Fluent, gets served when the file is absent.
        const isShell = text.includes('<div id="root">') || text.includes("Justin Gyurik —");
        return isShell ? ("missing" as const) : ("ready" as const);
      })
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus("missing"));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="flex h-full w-full flex-col bg-ink text-paper">
      <header className="flex items-center justify-between gap-4 border-b border-line/70 bg-coal/80 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="font-display text-lg font-semibold tracking-tight">Fluent</span>
          <span className="hidden font-sans text-[13px] uppercase tracking-wider text-faint sm:inline">
            adaptive AI fluency assessment
          </span>
        </div>
        <div className="flex items-center gap-2">
          {status === "ready" && (
            <a
              href={FLUENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-full border border-line bg-panel/70 px-3 py-1.5 font-sans text-[13px] uppercase tracking-wider text-paper transition hover:border-clay hover:text-clay sm:inline-flex"
            >
              Open in new tab ↗
            </a>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-ink/60 text-paper transition hover:border-clay hover:text-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden bg-coal">
        {status === "checking" && (
          <div className="absolute inset-0 flex items-center justify-center font-sans text-xs uppercase tracking-widest text-faint">
            loading assessment…
          </div>
        )}
        {status === "ready" && (
          <iframe
            title="Fluent — adaptive AI fluency assessment"
            src={FLUENT_URL}
            className="h-full w-full border-0"
            allow="clipboard-write"
          />
        )}
        {status === "missing" && (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="font-display text-xl text-paper">Assessment not installed yet</div>
            <p className="text-sm leading-relaxed text-muted">
              Fluent runs as one self-contained HTML file. Drop the build at{" "}
              <code className="rounded bg-panel/70 px-1.5 py-0.5 font-sans text-[12px] text-clay">
                public/demos/fluent/index.html
              </code>{" "}
              and it loads right here, full screen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
