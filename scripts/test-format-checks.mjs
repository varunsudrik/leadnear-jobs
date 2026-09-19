import assert from "node:assert/strict";
import { formatChecks, SEVERITIES } from "../lib/resume/format-checks.mjs";

const mk = (arr) => ({ lines: arr.map((t, i) => ({ n: i + 1, text: t })), pages: 1, text: arr.join("\n") });

// Skills as prose is a real ATS fault: parsers index list items, not sentences.
const prose = formatChecks(mk(["SKILLS", "Languages and tools include Go, Python and PostgreSQL across several teams."]));
assert.ok(prose.faults.some((f) => /paragraph/i.test(f.issue)), "expected the skills-as-paragraph fault");

// A comma list of the same terms is fine.
const list = formatChecks(mk(["SKILLS", "Go, Python, PostgreSQL, Redis, gRPC, AWS"]));
assert.ok(!list.faults.some((f) => /paragraph/i.test(f.issue)), "comma list must not be flagged");

// Bullets with no number are the "no measurable outcomes" finding.
const vague = formatChecks(mk(["EXPERIENCE", "- Worked on the ingestion pipeline", "- Responsible for the API gateway"]));
const impact = vague.faults.find((f) => /measurable/i.test(f.issue));
assert.ok(impact, "expected the measurable-outcomes fault");
assert.ok(/2 of 2/.test(impact.issue), `expected a real count, got: ${impact.issue}`);

// A bullet carrying a number is not flagged.
const measured = formatChecks(mk(["EXPERIENCE", "- Reduced p99 latency from 480ms to 190ms"]));
assert.ok(!measured.faults.some((f) => /measurable/i.test(f.issue)));

// Every fault carries a severity the UI can colour and an actionable fix.
for (const f of [...prose.faults, ...vague.faults]) {
  assert.ok(SEVERITIES.includes(f.sev), `unknown severity: ${f.sev}`);
  assert.ok(f.fix && f.fix.length > 5, "every fault needs an actionable fix");
}

// Scores are bounded integers.
for (const r of [prose, list, vague, measured]) {
  for (const s of [r.parseScore, r.formatScore]) {
    assert.ok(Number.isInteger(s) && s >= 0 && s <= 100, `score out of range: ${s}`);
  }
}

// A clean resume must outscore a faulty one, or the score means nothing.
assert.ok(list.formatScore > prose.formatScore, "clean skills list must score higher than prose");

console.log("format-checks ok");
