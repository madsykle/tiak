import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        // Premium neutral palette (Zinc-like)
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          subtle: "rgb(var(--surface-subtle) / <alpha-value>)",
          strong: "rgb(var(--surface-strong) / <alpha-value>)",
        },
        content: {
          DEFAULT: "rgb(var(--content) / <alpha-value>)",
          muted: "rgb(var(--content-muted) / <alpha-value>)",
          subtle: "rgb(var(--content-subtle) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--border) / <alpha-value>)",
          subtle: "rgb(var(--border-subtle) / <alpha-value>)",
        },
        neon: {
          cyan: "rgb(var(--neon-cyan) / <alpha-value>)",
          pink: "rgb(var(--neon-pink) / <alpha-value>)",
          red: "rgb(var(--neon-red) / <alpha-value>)",
          purple: "rgb(var(--neon-purple) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
