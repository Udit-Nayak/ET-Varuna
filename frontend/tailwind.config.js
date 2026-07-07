/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0B0F14",
        surface: "#121924",
        "surface-2": "#1A2430",
        "surface-3": "#233042",
        border: "#24303D",
        amber: "#E8A33D",
        risk: "#D64545",
        safe: "#3FA796",
        ink: "#E7ECEF",
        muted: "#8A96A3",
      },
      fontFamily: {
        display: ["\"Space Grotesk\"", "sans-serif"],
        body: ["\"Inter\"", "sans-serif"],
        mono: ["\"JetBrains Mono\"", "monospace"],
      },
      backgroundImage: {
        grid:
          "linear-gradient(rgba(36,48,61,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(36,48,61,0.5) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: 1, transform: "scale(1)" },
          "50%": { opacity: 0.4, transform: "scale(1.4)" },
        },
        scanline: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        pulseDot: "pulseDot 2s ease-in-out infinite",
        scanline: "scanline 3s linear infinite",
      },
    },
  },
  plugins: [],
};
