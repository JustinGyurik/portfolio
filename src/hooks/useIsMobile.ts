import { useEffect, useState } from "react";

// Phone-width viewports get a separate layout: a native vertical-scroll page
// instead of the desktop horizontal slide-deck. 767px = just below Tailwind's
// `md`, so tablets and up keep the deck. Initialized synchronously so the right
// layout renders on the first paint (no desktop->mobile flash).
const QUERY = "(max-width: 767px)";

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
