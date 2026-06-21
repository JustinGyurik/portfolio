import { useState } from "react";

// Framed screenshot for a build. Lazy-loads the image and, if it is missing
// (none dropped into public/builds yet), falls back to a styled placeholder
// so the site never looks broken. Swap placeholders by adding the real file.
export default function BuildMedia({
  src,
  alt,
  name,
  no,
  chrome = true,
  fill = false,
  top = false,
}: {
  src?: string;
  alt?: string;
  name: string;
  no: string;
  chrome?: boolean;
  // `fill` makes the media cover its whole parent (for image-forward cards).
  fill?: boolean;
  // `top` shows the whole image at its natural width (both edges visible, no
  // crop), sitting at the top of the card.
  top?: boolean;
}) {
  const [failed, setFailed] = useState(!src);
  const showImg = !failed && !!src;

  // Wide-friendly mode: a fixed frame so every card is the same height, with
  // the whole image fit inside (both edges visible, nothing cropped). Leftover
  // space is dark and blends into the card.
  if (top) {
    return (
      <figure className="relative aspect-[16/9] w-full overflow-hidden bg-coal">
        {showImg ? (
          <img
            src={src}
            alt={alt || name}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
        ) : (
          <Placeholder name={name} no={no} />
        )}
      </figure>
    );
  }

  return (
    <figure
      className={`group/media overflow-hidden bg-coal ${
        fill ? "absolute inset-0 h-full w-full" : "relative aspect-[16/10] w-full"
      } ${chrome ? "rounded-xl border border-line shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]" : ""}`}
    >
      {/* faux browser chrome */}
      {chrome && (
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-1.5 border-b border-line/70 bg-ink/60 px-3 py-2 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-claydeep/80" />
          <span className="h-2 w-2 rounded-full bg-amber/80" />
          <span className="h-2 w-2 rounded-full bg-clay/80" />
          <span className="ml-2 truncate font-sans text-[12px] tracking-wider text-faint">
            {name}
          </span>
        </div>
      )}

      {showImg ? (
        <img
          src={src}
          alt={alt || name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover/media:scale-[1.02] ${
            chrome ? "pt-8" : ""
          }`}
        />
      ) : (
        <Placeholder name={name} no={no} />
      )}
    </figure>
  );
}

// Branded empty state: reads as intentional cover art, not a missing image.
// Seeded off the build number so each tile differs slightly.
function Placeholder({ name, no }: { name: string; no: string }) {
  const seed = parseInt(no, 10) || 1;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[radial-gradient(130%_120%_at_50%_-10%,rgba(155,124,255,0.18),transparent_62%)] pt-8 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 280 56"
        className="h-12 w-48 text-clay/45"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      >
        {Array.from({ length: 28 }).map((_, i) => {
          const x = 8 + i * 9.6;
          const h = 6 + Math.abs(Math.sin(i * 0.7 + seed)) * 38;
          return <line key={i} x1={x} y1={28 - h / 2} x2={x} y2={28 + h / 2} />;
        })}
      </svg>
      <div className="font-display text-lg text-paper/85">{name}</div>
      <div className="font-sans text-[12px] uppercase tracking-[0.2em] text-faint">
        {no} / studio
      </div>
    </div>
  );
}
