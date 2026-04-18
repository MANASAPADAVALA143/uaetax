import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: "#C9A84C",
        "gold-lt": "#E8C96A",
        "gold-pale": "rgba(201,168,76,0.12)",
        deep: "#040D1F",
        navy: "#071226",
        card: "#0A1A35",
        card2: "#0E2040",
        border: "rgba(78,168,255,0.12)",
        "border-g": "rgba(201,168,76,0.22)",
        muted: "#7A9BB5",
        muted2: "#3A5070",
        green: "#2DD4A0",
        blue: "#4EA8FF",
        "blue-bright": "#60BFFF",
        red: "#FF6B6B",
        amber: "#FFA940",
      },
      fontFamily: {
        playfair: ["var(--font-playfair)", "serif"],
        sans: ["var(--font-dm-sans)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
