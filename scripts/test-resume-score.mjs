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

// FIX 5: the window is chosen around flagged lines instead of always from
// the top, with a few lines of context before the first one. Lines 15 and
// 87 are too far apart to both land in one 40-line window, so the earlier
// flagged group (15) wins the tie and the window opens 5 lines before it —
// no longer at line 1.
assert.equal(
  out.scan.lines[0].n, 10,
  `window should open CONTEXT_LINES before line 15, got line ${out.scan.lines[0]?.n}`
);
assert.equal(out.scan.lines.length, PREVIEW_LINES, "a document longer than the cap must still fill it");

// A fault with line: null must not crash the flagging pass and must not
// coerce to some in-window line (line 0, or an off-by-one) and flag it by
// accident. Line 20 sits inside the chosen window (10-49) but carries no
// fault of its own.
const untouched = out.scan.lines.find((l) => l.n === 20);
assert.ok(untouched && !untouched.flag, "a null-line fault must not flag an unrelated line");

// The losing flagged group (87) can't share a window with line 15, so it has
// nowhere to land here: it must not produce a phantom retained line, and
// must not shift another line's flag.
assert.ok(!out.scan.lines.some((l) => l.n === 87), "the losing flagged group must not appear in the chosen window");
assert.equal(
  out.scan.lines.filter((l) => l.flag).length,
  1,
  "only the winning in-window fault (line 15) may flag a retained line"
);

// FIX 5, the case this whole change exists for: a fault deep in the document
// (line 87, past where the old fixed top-40 slice ever reached) must still
// be visible in the stored window when it's the only thing to build a
// window around — this is the "Fixes · 2 open" panel with nothing
// highlighted that real two-page resumes were hitting.
const deepChecks = {
  parseScore: 90, formatScore: 86,
  faults: [{ sev: "High", issue: "No measurable outcomes in 6 of 11 bullets", fix: "add a number", impact: "+3", line: 87 }],
};
const deepOut = buildScan({ parsed, checks: deepChecks, extracted, filename: "deep.pdf" });
assert.ok(
  deepOut.scan.lines.length <= PREVIEW_LINES,
  `retained ${deepOut.scan.lines.length} lines, cap is ${PREVIEW_LINES}`
);
const deepFlagged = deepOut.scan.lines.find((l) => l.n === 87);
assert.ok(deepFlagged && deepFlagged.flag, "a fault at line 87 must be visible in the stored window");
// The cap (a privacy commitment, spec D11) must not move to accommodate it.
assert.equal(deepOut.scan.lines.length, PREVIEW_LINES, "the 40-line cap must not be raised to reach a deep fault");
// It must have real lead-in context, not sit at the window's own top edge.
assert.equal(deepOut.scan.lines[0].n, 81, "window should back up from the flagged line rather than start on it");

// With no flagged lines at all, the window is exactly today's behaviour:
// the first PREVIEW_LINES lines from the top.
const noFaultOut = buildScan({ parsed, checks: { parseScore: 90, formatScore: 100, faults: [] }, extracted, filename: "clean.pdf" });
assert.equal(noFaultOut.scan.lines[0].n, 1, "with no faults, the window must start at line 1");
assert.equal(noFaultOut.scan.lines.length, PREVIEW_LINES, "with no faults, the window must still fill the cap");

// AI impact findings drive the Impact subscore only; they must not also
// produce issue rows (that would double-count one root cause as ~7 rows
// and inject a hardcoded sev/impact alongside Task 3's real ones).
// `issues` must be exactly Task 3's faults: same count, same `issue` text.
assert.equal(out.issues.length, checks.faults.length, "issues must be exactly Task 3's faults, not merged with AI findings");
assert.deepEqual(
  out.issues.map((i) => i.issue).sort(),
  checks.faults.map((f) => f.issue).sort(),
  "every issue row must trace back to a format-checks fault"
);
for (const bullet of extracted.impact) {
  assert.ok(
    !out.issues.some((i) => i.issue === bullet.bullet.slice(0, 80)),
    "an AI impact finding must never appear as an issue row"
  );
}

// AI impact findings must still be USED, just not displayed: they move the
// Impact part and the overall score. Two scans differing only in
// extracted.impact.length must disagree on both numbers.
const fewerImpact = buildScan({
  parsed, checks, filename: "arjun.pdf",
  extracted: { ...extracted, impact: [] },
});
const fewerByLabel = Object.fromEntries(fewerImpact.parts.map((p) => [p.label, p.value]));
assert.notEqual(fewerByLabel.Impact, byLabel.Impact, "changing extracted.impact.length must change the Impact part");
assert.notEqual(fewerImpact.score, out.score, "changing extracted.impact.length must change the overall score");

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
