import assert from "node:assert/strict";
import {
  DEMO_FIT, DEMO_SCANS_USED, TIER_BY_SLOT, FIT_LABEL, FIT_RANK, fitFor, bannerFor,
} from "../lib/demo-fit.js";

// On by default: nothing has to be configured for the demo layer to render.
assert.equal(DEMO_FIT, true);
assert.equal(DEMO_SCANS_USED, 2);

// The mock's own ten job fixtures are 2 strong, 2 good, 6 low (spec lines
// 481-490). The slot table reproduces that ratio exactly, so this is an
// exact-count assertion rather than a statistical band over sampled slugs.
assert.equal(TIER_BY_SLOT.length, 10);
assert.equal(TIER_BY_SLOT.filter((t) => t === "strong").length, 2);
assert.equal(TIER_BY_SLOT.filter((t) => t === "good").length, 2);
assert.equal(TIER_BY_SLOT.filter((t) => t === "low").length, 6);

// Deterministic: the same slug must produce the same tier on every call, or
// the list reshuffles as you page back and forth, and — because JobCard is a
// client component fed by server-rendered data — server and client output
// disagree and React logs a hydration mismatch.
for (const slug of ["senior-backend-engineer-go-northwind-labs", "ios-engineer-lantern-works"]) {
  assert.equal(fitFor(slug), fitFor(slug));
  assert.ok(["strong", "good", "low"].includes(fitFor(slug)));
}

// All three tiers must be reachable, otherwise the page only ever shows one
// badge colour and the demo looks broken rather than varied.
const sampled = new Set(Array.from({ length: 200 }, (_, i) => fitFor(`job-${i}`)));
assert.deepEqual([...sampled].sort(), ["good", "low", "strong"]);

// Absent or malformed slugs yield no badge at all — never a fabricated one.
assert.equal(fitFor(""), null);
assert.equal(fitFor(undefined), null);
assert.equal(fitFor(null), null);

// The card badge and the preview banner must agree for the same job. If they
// can disagree, clicking a "Low fit" card opens a "Strong fit" banner and the
// whole demo reads as a bug.
const tier = fitFor("platform-engineer-kubernetes-tessellate");
assert.equal(bannerFor(tier).label, FIT_LABEL[tier]);

// Banner copy is tier-keyed and complete for every tier.
for (const t of ["strong", "good", "low"]) {
  const banner = bannerFor(t);
  assert.equal(banner.label, FIT_LABEL[t]);
  assert.equal(typeof banner.copy, "string");
  assert.ok(banner.copy.length > 0);
  assert.ok(Number.isInteger(banner.score) && banner.score > 0 && banner.score <= 100);
}
assert.equal(bannerFor("nonsense"), null);
assert.equal(bannerFor(null), null);

// Best-fit sort order: strong first, low last.
assert.deepEqual(
  ["low", "strong", "good"].sort((a, b) => FIT_RANK[a] - FIT_RANK[b]),
  ["strong", "good", "low"]
);

// Switch off: re-import a separate module instance with the env var set, so
// the constant is evaluated again. The query string is what makes Node treat
// it as a distinct module rather than serving the cached one.
process.env.NEXT_PUBLIC_DEMO_FIT = "false";
const off = await import(new URL("../lib/demo-fit.js?off", import.meta.url).href);
assert.equal(off.DEMO_FIT, false);
assert.equal(off.fitFor("platform-engineer-kubernetes-tessellate"), null);
assert.equal(off.bannerFor("strong"), null);

console.log("demo-fit ok");
