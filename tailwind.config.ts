import type { Config } from "tailwindcss";

// Note: Next.js + Tailwind CSS v4 uses CSS variables in app/globals.css 
// via the @theme directive by default. 
// This file is provided for legacy plugin compatibility or explicit overrides if needed.

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};

export default config;
