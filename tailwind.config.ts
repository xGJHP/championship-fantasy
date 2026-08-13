import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Near-black with a faint warm cast, so it sits with the amber rather
        // than fighting it. Never pure #000.
        ink: "#0A0A0B",
        panel: "#111113",
        panel2: "#17171A",
        line: "#232327",
        mute: "#8B8B93",
        // One accent, deliberately under 80% saturation
        accent: "#E9A23B",
        accent2: "#F5B45A",
        // Warnings sit in the same amber family, just duller, so an advisory
        // note never competes with a call to action
        warn: "#C98A2E",
        bad: "#E5484D",
        good: "#3FB950",
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      borderRadius: {
        // Softer on containers, tighter on the things inside them
        xl: "14px",
        lg: "10px",
        md: "7px",
      },
      boxShadow: {
        // Tinted to the background hue rather than generic black
        card: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6)",
        lift: "0 2px 4px rgba(0,0,0,0.4), 0 16px 40px -16px rgba(233,162,59,0.12)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
