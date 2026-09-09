import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));

const expected = {
  "--accent": "#5b4ef0",
  "--accent-hover": "#4a3ee0",
  "--accent-tint": "#ecebff",
  "--text": "#15171c",
  "--text2": "#3d3f4a",
  "--text3": "#6b6d78",
  "--text4": "#9a9aa4",
  "--bg": "#ffffff",
  "--bg2": "#f4f4f6",
  "--border": "#eaeaef",
  "--ok-bg": "#e7f6f1",
  "--ok-fg": "#0e6e57",
  "--warn-bg": "#fdf4e3",
  "--warn-fg": "#8a5b0a",
  "--bad-bg": "#fdeeea",
  "--bad-fg": "#a8341a",
  "--radius-pill": "999px",
};

for (const [name, value] of Object.entries(expected)) {
  const found = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(root);
  assert.ok(found, `missing token ${name}`);
  assert.equal(found[1].trim().toLowerCase(), value, `${name} should be ${value}`);
}

// The legacy palette must be gone from the whole stylesheet, not just :root —
// a half-migrated sweep is the likeliest failure mode here.
for (const legacy of ["#1d4ed8", "#2563eb", "#0f172a", "#eff6ff", "#020617"]) {
  assert.ok(!css.toLowerCase().includes(legacy), `legacy colour ${legacy} still present`);
}

// The split-pane "hide preview below this width" breakpoint is duplicated in
// three places that can't share a single source at runtime: the
// --preview-breakpoint custom property (what lib/previewBreakpoint.js reads
// via matchMedia), the @media literal right above .jobs-layout (CSS media
// queries can't use var(), so it must carry its own number), and that same
// file's PREVIEW_BREAKPOINT_FALLBACK_PX (used before hydration / in SSR).
// Nothing enforces these three stay equal, and drift fails silently (dead
// clicks on the split-pane preview, no error, no failing test) — so assert
// it here instead.
const bp = /--preview-breakpoint:\s*(\d+)px/.exec(root);
assert.ok(bp, "missing --preview-breakpoint on :root");

const mq = /@media \(max-width: (\d+)px\) \{\s*\.jobs-layout/.exec(css);
assert.ok(mq, "missing the @media (max-width: ...) rule above .jobs-layout");
assert.equal(mq[1], bp[1], "@media literal must equal --preview-breakpoint");

const previewBreakpointJs = readFileSync(
  new URL("../lib/previewBreakpoint.js", import.meta.url),
  "utf8"
);
const fallback = /PREVIEW_BREAKPOINT_FALLBACK_PX\s*=\s*(\d+)/.exec(previewBreakpointJs);
assert.ok(fallback, "missing PREVIEW_BREAKPOINT_FALLBACK_PX in lib/previewBreakpoint.js");
assert.equal(
  fallback[1],
  bp[1],
  "lib/previewBreakpoint.js's PREVIEW_BREAKPOINT_FALLBACK_PX must equal --preview-breakpoint"
);

console.log("design tokens ok");
