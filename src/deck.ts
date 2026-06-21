import { createContext } from "react";

// Shared so slides (e.g. the Hero CTA) can drive the deck without importing App.
export const DeckContext = createContext<{ go: (d: number) => void }>({ go: () => {} });
