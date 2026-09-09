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

console.log("design tokens ok");
