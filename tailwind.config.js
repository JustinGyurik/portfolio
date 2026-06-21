/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dark, violet-tinted neutrals
        ink: "#0B0912",
        coal: "#120F1D",
        panel: "#191427",
        line: "#2A2440",
        paper: "#ECE8F7",
        muted: "#A39DBE",
        faint: "#6E6790",

        // Iridescent accent set. `clay` stays the primary token name used across
        // components, but it is now violet. `amber` is the magenta shift target.
        clay: "#9B7CFF",
        claydeep: "#6D4AE0",
        amber: "#E879F9",

        // Explicit iridescent stops for gradients / glows.
        iris: "#9B7CFF",
        violet: "#7C5CFF",
        magenta: "#E879F9",
        cyan: "#5EE7E0",
      },
      fontFamily: {
        // Two fonts only: Fraunces (serif) for titles, Inter (sans) for all UI.
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // System monospace, used solely for the JSON code box (not a display font).
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        irisdrift: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        irisdrift: "irisdrift 8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
