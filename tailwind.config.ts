import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        steam: {
          DEFAULT: "#66c0f4",
          dark: "#1b2838",
          panel: "#16202d",
          border: "#2a475e",
        },
      },
    },
  },
  plugins: [],
};
export default config;
