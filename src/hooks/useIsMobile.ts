import { useEffect, useState } from "react";

// Phone AND tablet/medium viewports get the responsive vertical layout instead
// of the desktop horizontal slide-deck. The deck is mouse-first (hover, precise
// drag, the 3D carousel), so anything below a real desktop (<1024px: phones,
// tablets, split-screen, medium windows) gets the touch-friendly layout.
// Initialized synchronously so the right layout renders on first paint (no flash).
const QUERY = "(max-width: 1023px)";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return isMobile;
}
