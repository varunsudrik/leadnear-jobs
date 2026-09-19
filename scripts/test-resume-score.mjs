import assert from "node:assert/strict";
import { buildScan, PREVIEW_LINES } from "../lib/resume/score.mjs";

const parsed = {
  ok: true, pages: 2,
  text: "ARJUN MEHTA\nSKILLS\nGo, PostgreSQL",
  lines: Array.from({ length: 120 }, (_, i) => ({ n: i + 1, text: `line ${i + 1}` })),
};
const checks = {
  parseScore: 96, formatScore: 78,
  faults: [
    { sev: "High", issue: "No measurable outcomes in 6 of 11 bullets", fix: "add a number", impact: "+5", line: 15 },
    // A fault with no location must never crash the line-flagging pass, and
    // must never coerce to line 0 (or any other in-window line) and flag it.
    { sev: "Low", issue: "'Present' used in two roles", fix: "add start months", impact: "+1", line: null },
    // A fault past the retained window must not create a phantom flagged
    // line: PREVIEW_LINES caps what is stored, so line 87 has nowhere to land.
    { sev: "Medium", issue: "Dangling section past the fold", fix: "trim to one page", impact: "+1", line: 87 },
  ],
};
const extracted = {
  ok: true, skills: ["Go", "PostgreSQL", "gRPC"],
  impact: [{ bullet: "Worked on the pipeline", why: "no outcome" }],
  headline: "Passes most ATS filters.", subline: "Keyword coverage is the drag.",
};

const out = buildScan({ parsed, checks, extracted, filename: "arjun.pdf" });

// The four bars the design draws, in the design's order.
assert.deepEqual(out.parts.map((p) => p.label), ["Parse", "Keywords", "Format", "Impact"]);
for (const p of out.parts) {
  assert.ok(Number.isInteger(p.value) && p.value >= 0 && p.value <= 100, `bad part value: ${p.value}`);
  assert.ok(/^#[0-9a-f]{6}$/i.test(p.color), `part needs a colour: ${p.color}`);
}

// Each bar must reflect its own source, not just land in range: a part that
// silently reports the wrong number (or another part's number) must fail
// here even though every value independently still passes the range check
// above. Keywords/Impact are recomputed independently of the module under
// test so a mutated formula cannot coincidentally match.
const byLabel = Object.fromEntries(out.parts.map((p) => [p.label, p.value]));
assert.equal(byLabel.Parse, checks.parseScore, "Parse bar must equal checks.parseScore");
assert.equal(byLabel.Format, checks.formatScore, "Format bar must equal checks.formatScore");
assert.equal(
  byLabel.Keywords,
  Math.round((extracted.skills.length / 12) * 100),
  "Keywords bar must be derived from distinct stated skills"
);
assert.equal(
  byLabel.Impact,
  Math.max(0, 100 - extracted.impact.length * 8),
  "Impact bar must be derived from the count of unmeasured bullets"
);

// Overall score is a bounded integer derived from the parts, not a constant.
assert.ok(Number.isInteger(out.score) && out.score >= 0 && out.score <= 100);

// Spec D11: only the displayed lines are retained, never the whole document.
assert.ok(out.scan.lines.length <= PREVIEW_LINES, `retained ${out.scan.lines.length} lines, cap is ${PREVIEW_LINES}`);
assert.equal("text" in out.scan, false, "the full extracted text must not be carried into the stored shape");

// Lines flagged by a fault are marked so the parser view can highlight them.
const flagged = out.scan.lines.find((l) => l.n === 15);
assert.ok(flagged && flagged.flag, "line 15 carries a fault and must be flagged");

// A fault with line: null must not crash the flagging pass and must not
// coerce to some in-window line (line 0, or line 1 by an off-by-one) and
// flag it by accident.
const line1 = out.scan.lines.find((l) => l.n === 1);
assert.ok(line1 && !line1.flag, "a null-line fault must not flag an unrelated line");

// A fault whose line falls past PREVIEW_LINES has nowhere to land: it must
// not produce a phantom retained line, and must not shift another line's
// flag.
assert.ok(!out.scan.lines.some((l) => l.n === 87), "no retained line may exceed PREVIEW_LINES");
assert.equal(
  out.scan.lines.filter((l) => l.flag).length,
  1,
  "only the one in-window fault (line 15) may flag a retained line"
);

// Both fault sources merge into one issues list.
assert.ok(out.issues.length >= 2, "format faults and AI impact findings must merge");

// Prose and skills pass through.
assert.equal(out.headline, "Passes most ATS filters.");
assert.deepEqual(out.skills, ["Go", "PostgreSQL", "gRPC"]);

// A worse resume must score lower. Reverting the weighting breaks this.
const worse = buildScan({
  parsed, filename: "x.pdf", extracted,
  checks: { parseScore: 40, formatScore: 30, faults: checks.faults },
});
assert.ok(worse.score < out.score, "lower subscores must produce a lower overall score");

console.log("resume-score ok");
