import assert from "node:assert/strict";
import { resumeScan, SEVERITIES } from "../lib/demo-resume.js";
import { whyFor } from "../lib/demo-fit.js";

const s = resumeScan();
assert.ok(s, "resumeScan() should return a payload while the demo layer is on");

// Header metadata drives "arjun-mehta-resume.pdf · 2 pages · scanned today 14:02 in 18s".
assert.equal(s.scan.filename, "arjun-mehta-resume.pdf");
assert.equal(s.scan.pages, 2);
assert.equal(typeof s.scan.scannedAt, "string");
assert.equal(s.scan.durationSeconds, 18);

// The headline score and the donut both read this one number.
assert.equal(s.score, 72);

// Four dimensions, each 0-100, each with a bar colour.
assert.equal(s.parts.length, 4);
assert.deepEqual(s.parts.map((p) => p.label), ["Parse", "Keywords", "Format", "Impact"]);
for (const p of s.parts) {
  assert.ok(Number.isInteger(p.value) && p.value >= 0 && p.value <= 100, `${p.label} out of range`);
  assert.match(p.color, /^#[0-9a-f]{6}$/i, `${p.label} needs a bar colour`);
}

// Five fixes. The header renders "Fixes · 5 open" from this length, so a
// sixth entry would silently contradict the heading unless it is derived.
assert.equal(s.issues.length, 5);
for (const i of s.issues) {
  assert.ok(SEVERITIES.includes(i.sev), `unknown severity ${i.sev}`);
  assert.ok(i.issue.length > 0 && i.fix.length > 0);
  assert.match(i.impact, /^\+\d+$/, "impact reads as +N");
}

// Keyword chips.
assert.equal(s.found.length, 9);
assert.equal(s.missing.length, 4);
for (const m of s.missing) {
  assert.ok(m.term.length > 0);
  assert.ok(Number.isInteger(m.share) && m.share > 0 && m.share <= 100, `${m.term} share out of range`);
}

// The "Scored against" select.
assert.equal(s.scoredAgainst.length, 3);

// Match copy is domain-neutral: this corpus spans Sales, HR and Design, so a
// "why" naming specific technologies would be nonsense on most rows.
for (const tier of ["strong", "good", "low"]) {
  const why = whyFor(tier);
  assert.equal(typeof why, "string");
  assert.ok(why.length > 0);
  for (const tech of ["Go", "Kubernetes", "PostgreSQL", "gRPC", "Kafka"]) {
    assert.ok(!why.includes(tech), `whyFor(${tier}) must not name ${tech}`);
  }
}
assert.equal(whyFor("nonsense"), null);

// Switch off: a separate module instance with the env var set.
process.env.NEXT_PUBLIC_DEMO_FIT = "false";
const offResume = await import(new URL("../lib/demo-resume.js?off", import.meta.url).href);
const offFit = await import(new URL("../lib/demo-fit.js?off", import.meta.url).href);
assert.equal(offResume.resumeScan(), null);
assert.equal(offFit.whyFor("strong"), null);

console.log("demo-resume ok");
