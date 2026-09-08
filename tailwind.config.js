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
    },
  },
  plugins: [require("tailwindcss-animate")],
};
