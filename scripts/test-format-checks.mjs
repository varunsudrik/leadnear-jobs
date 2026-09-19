import assert from "node:assert/strict";
import { formatChecks, SEVERITIES } from "../lib/resume/format-checks.mjs";
import { buildScan } from "../lib/resume/score.mjs";

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

// Long contact line wraps and breaks ATS parsing.
const longContact = formatChecks(mk(["John Doe | john.doe@company.com | (555) 123-4567 | San Francisco CA 94102"]));
const contactFault = longContact.faults.find((f) => /contact/i.test(f.issue));
assert.ok(contactFault, "expected contact line wrap fault for >70 chars");
assert.ok(contactFault.sev === "Medium", `expected Medium severity, got ${contactFault.sev}`);

// Short contact line on one line is fine.
const shortContact = formatChecks(mk(["john@example.com | (555) 1234"]));
assert.ok(!shortContact.faults.some((f) => /contact/i.test(f.issue)), "short contact line must not be flagged");

// "Present" in two roles confuses date parsers.
const twoPresent = formatChecks(mk(["Role 1, Jan 2020 - Present", "Role 2, Jan 2022 - Present"]));
const presentFault = twoPresent.faults.find((f) => /Present/i.test(f.issue));
assert.ok(presentFault, "expected fault for 'Present' in two roles");
assert.ok(presentFault.sev === "Low", `expected Low severity, got ${presentFault.sev}`);

// "Present" in only one role is fine.
const onePresent = formatChecks(mk(["Role 1, Jan 2020 - Present"]));
assert.ok(!onePresent.faults.some((f) => /Present/i.test(f.issue)), "'Present' in one role must not be flagged");

// CORRECTION 1: Present rule now requires date context.
// Lowercase "present" with date should fire.
const lowerPresent = formatChecks(mk(["Jan 2020 - present", "Jan 2022 - present"]));
assert.ok(lowerPresent.faults.some((f) => /Present/i.test(f.issue)), "lowercase 'present' with dates should fire");

// "Present" as a verb (without date) should not fire.
const verbPresent = formatChecks(mk(["- Present monthly metrics to leadership", "Jan 2022 - present"]));
assert.ok(!verbPresent.faults.some((f) => /Present/i.test(f.issue)), "'Present' verb with one date should not fire");

// CORRECTION 2: Skills can use pipe, slash, semicolon delimiters.
// Pipe-delimited list should not be flagged.
const pipeList = formatChecks(mk(["SKILLS", "Python | Go | Java | PostgreSQL | Kubernetes | AWS"]));
assert.ok(!pipeList.faults.some((f) => /paragraph/i.test(f.issue)), "pipe-delimited list must not be flagged");

// Prose paragraph should still be flagged.
const stillProse = formatChecks(mk(["SKILLS", "Languages and tools include Go, Python and PostgreSQL across several teams."]));
assert.ok(stillProse.faults.some((f) => /paragraph/i.test(f.issue)), "prose paragraph must still be flagged");

// CORRECTION 3: Skills scan extends to next heading or 8 lines.
// Exact case: AWS acronym should not stop the window prematurely.
const awsCase = formatChecks(mk(["SKILLS", "Go", "Python", "AWS", "Experienced building scalable distributed backend systems for large teams."]));
assert.ok(awsCase.faults.some((f) => /paragraph/i.test(f.issue)), "AWS acronym must not truncate skills window, prose on 5th line should fire");

// Skills section terminated by real heading must stop there. The line after
// EXPERIENCE is long prose with no delimiters (not a short bullet), so this
// only passes if the window genuinely stopped at the heading: if EXPERIENCE
// were removed from SECTION_HEADINGS, the scan would swallow this prose too
// (words > 8, delimiters < words / 6) and wrongly raise the paragraph fault.
const skillsThenExperience = formatChecks(mk(["SKILLS", "Go, Python", "EXPERIENCE", "Managed engineering teams responsible for building scalable distributed systems across many different products and services for enterprise customers worldwide"]));
assert.ok(!skillsThenExperience.faults.some((f) => /paragraph/i.test(f.issue)), "EXPERIENCE heading stops window, no prose fault");

// Prose on 5th line should be caught.
const proseOnFifth = formatChecks(mk(["SKILLS", "Go, Python", "PostgreSQL, Redis", "gRPC, AWS", "Languages and tools include Go Python and PostgreSQL across several teams and organizations."]));
assert.ok(proseOnFifth.faults.some((f) => /paragraph/i.test(f.issue)), "prose on line 5 of skills should be caught");

// FINDING 1: SKILLS_HEADINGS must agree with SECTION_HEADINGS. A skills
// section titled "CORE COMPETENCIES" (a recognised heading) followed by
// prose must still be scanned and flagged, not silently skipped because the
// finder only looked for the substring "SKILL".
const coreCompetencies = formatChecks(mk(["CORE COMPETENCIES", "Extensive background architecting resilient distributed systems across cloud environments and teams."]));
assert.ok(coreCompetencies.faults.some((f) => /paragraph/i.test(f.issue)), "CORE COMPETENCIES prose must be caught");

// CORRECTION 4: Single vague bullet is Medium, not High.
// 1 of 1 vague is Medium.
const oneVague = formatChecks(mk(["EXPERIENCE", "- Worked on the ingestion pipeline"]));
const oneVagueFault = oneVague.faults.find((f) => /measurable/i.test(f.issue));
assert.ok(oneVagueFault, "expected fault for single vague bullet");
assert.ok(oneVagueFault.sev === "Medium", `single vague bullet should be Medium, got ${oneVagueFault.sev}`);

// 3 of 4 vague is High.
const threeVague = formatChecks(mk(["EXPERIENCE", "- Worked on something", "- Responsible for something", "- Led something", "- Reduced latency by 50%"]));
const threeVagueFault = threeVague.faults.find((f) => /measurable/i.test(f.issue));
assert.ok(threeVagueFault, "expected fault for 3-of-4 vague");
assert.ok(threeVagueFault.sev === "High", `3-of-4 vague should be High, got ${threeVagueFault.sev}`);

// FINDING 3: pin both halves of the `>= 3 && > 50%` High rule independently.
// 2 of 4 is exactly 50% (not > 50%) AND below the count threshold: Medium.
const twoOfFour = formatChecks(mk(["EXPERIENCE", "- Worked on something", "- Responsible for something", "- Reduced latency by 50%", "- Increased revenue by 10%"]));
const twoOfFourFault = twoOfFour.faults.find((f) => /measurable/i.test(f.issue));
assert.ok(twoOfFourFault, "expected fault for 2-of-4 vague");
assert.ok(twoOfFourFault.sev === "Medium", `2-of-4 (exactly 50%, below count) should be Medium, got ${twoOfFourFault.sev}`);

// 3 of 6 meets the count threshold (>= 3) but is exactly 50%, not > 50%: Medium.
// This fails if the `> 50%` clause is dropped (count-only would call it High).
const threeOfSix = formatChecks(mk(["EXPERIENCE", "- Worked on something", "- Responsible for something", "- Helped with something", "- Reduced latency by 50%", "- Increased revenue by 10%", "- Cut costs by 20%"]));
const threeOfSixFault = threeOfSix.faults.find((f) => /measurable/i.test(f.issue));
assert.ok(threeOfSixFault, "expected fault for 3-of-6 vague");
assert.ok(threeOfSixFault.sev === "Medium", `3-of-6 (count met, exactly 50%) should be Medium, got ${threeOfSixFault.sev}`);

// 3 of 5 clears both thresholds (60%, count 3): High.
const threeOfFive = formatChecks(mk(["EXPERIENCE", "- Worked on something", "- Responsible for something", "- Helped with something", "- Reduced latency by 50%", "- Increased revenue by 10%"]));
const threeOfFiveFault = threeOfFive.faults.find((f) => /measurable/i.test(f.issue));
assert.ok(threeOfFiveFault, "expected fault for 3-of-5 vague");
assert.ok(threeOfFiveFault.sev === "High", `3-of-5 (60%, count 3) should be High, got ${threeOfFiveFault.sev}`);

// CORRECTION 5: Empty lines give parseScore 0.
const empty = formatChecks(mk([]));
assert.ok(empty.parseScore === 0, `empty lines should give parseScore 0, got ${empty.parseScore}`);

// CORRECTION 6: Contact line scan extends to 6 lines.
// Email on 5th line should be caught if long.
const contactOnFifth = formatChecks(mk(["John Doe", "Senior Engineer", "Tech Lead", "San Francisco, CA", "john.doe@company.com | (555) 123-4567 | Very Long Additional Info Herex"]));
const contactOnFifthFault = contactOnFifth.faults.find((f) => /contact/i.test(f.issue));
assert.ok(contactOnFifthFault, "expected contact wrap fault for email on 5th line");

// Every fault carries a severity the UI can colour and an actionable fix.
for (const f of [...prose.faults, ...vague.faults, ...longContact.faults, ...twoPresent.faults, ...lowerPresent.faults, ...pipeList.faults, ...awsCase.faults, ...skillsThenExperience.faults, ...proseOnFifth.faults, ...oneVague.faults, ...threeVague.faults, ...contactOnFifth.faults, ...coreCompetencies.faults, ...twoOfFour.faults, ...threeOfSix.faults, ...threeOfFive.faults]) {
  assert.ok(SEVERITIES.includes(f.sev), `unknown severity: ${f.sev}`);
  assert.ok(f.fix && f.fix.length > 5, "every fault needs an actionable fix");
}

// Scores are bounded integers.
for (const r of [prose, list, vague, measured, longContact, shortContact, twoPresent, onePresent, lowerPresent, verbPresent, pipeList, stillProse, awsCase, skillsThenExperience, proseOnFifth, oneVague, threeVague, empty, contactOnFifth, coreCompetencies, twoOfFour, threeOfSix, threeOfFive]) {
  for (const s of [r.parseScore, r.formatScore]) {
    assert.ok(Number.isInteger(s) && s >= 0 && s <= 100, `score out of range: ${s}`);
  }
}

// A clean resume must outscore a faulty one, or the score means nothing.
assert.ok(list.formatScore > prose.formatScore, "clean skills list must score higher than prose");

// FIX 2: "Est. impact" must not be an invented number — it must equal what
// removing the fault actually does to the overall score the user sees.
// Isolate a single High fault (4-of-5 vague bullets — deliberately NOT 3,
// since the old hardcoded `+${Math.min(6, vague.length)}` happens to equal
// the correctly-derived High estimate at vague.length===3, which would let
// a reverted fix hide behind this test) against an otherwise-identical
// resume with the fault fixed, so the only thing that can move between the
// two scans is the one fault under test.
const withFault = mk(["EXPERIENCE", "- Worked on something", "- Responsible for something", "- Helped with something", "- Led something", "- Reduced latency by 50%"]);
const withoutFault = mk(["EXPERIENCE", "- Cut cost by 5%", "- Boosted output by 10%", "- Reduced errors by 15%", "- Improved uptime by 20%", "- Reduced latency by 50%"]);

const withFaultChecks = formatChecks(withFault);
const withoutFaultChecks = formatChecks(withoutFault);
const highFault = withFaultChecks.faults.find((f) => /measurable/i.test(f.issue));
assert.ok(highFault && highFault.sev === "High", "fixture must produce exactly the High measurable-outcomes fault");
assert.equal(withoutFaultChecks.faults.length, 0, "the fixed fixture must have no faults, isolating the comparison");
assert.equal(
  withFaultChecks.parseScore, withoutFaultChecks.parseScore,
  "both fixtures have the same line count, so parseScore must match and not confound the comparison"
);

const extracted = { skills: ["Go", "Python"], impact: [] };
const withFaultScan = buildScan({ parsed: { pages: 1, lines: withFault.lines }, checks: withFaultChecks, extracted, filename: "a.pdf" });
const withoutFaultScan = buildScan({ parsed: { pages: 1, lines: withoutFault.lines }, checks: withoutFaultChecks, extracted, filename: "a.pdf" });

const advertised = Number(highFault.impact.replace("+", ""));
const actualDelta = withoutFaultScan.score - withFaultScan.score;
assert.equal(
  advertised, actualDelta,
  `advertised impact (+${advertised}) must equal the real overall-score delta from removing the fault (+${actualDelta})`
);

console.log("format-checks ok");
