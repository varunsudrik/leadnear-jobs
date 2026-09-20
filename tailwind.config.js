/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  // The job board (app/globals.css) is plain hand-written CSS that predates
  // Tailwind in this project. Preflight would reset headings, lists, buttons
  // and form controls out from under it and visually break every listing page.
  // Disabling it keeps Tailwind purely additive: the utility classes used by
  // the pages ported from leadnear-main work, and nothing else changes.
  corePlugins: {
    preflight: false,
  },
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      screens: { xlg: "1100px" },
      colors: {
        accent: { DEFAULT: "#5b4ef0", hover: "#4a3ee0", tint: "#ecebff" },
        ink:    { DEFAULT: "#15171c", 2: "#3d3f4a", 3: "#6b6d78", 4: "#9a9aa4" },
        canvas: "#f4f4f6",
        hairline: "#eaeaef",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { pill: "999px" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
