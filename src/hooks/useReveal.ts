import { useEffect } from "react";

// In the slide deck there is no vertical page scroll, so reveal-on-scroll does
// not apply. Just fade everything in once on mount; the slide transition carries
// the motion between sections.
export function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    const id = requestAnimationFrame(() => els.forEach((el) => el.classList.add("in")));
    return () => cancelAnimationFrame(id);
  }, []);
}
