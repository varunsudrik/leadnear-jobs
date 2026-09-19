import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatChecks, SEVERITIES } from "../lib/resume/format-checks.mjs";
import { buildScan } from "../lib/resume/score.mjs";
import { parseResume } from "../lib/resume/parse.mjs";

const mk = (arr) => ({ lines: arr.map((t, i) => ({ n: i + 1, text: t })), pages: 1, text: arr.join("\n") });
// Like `mk`, but for lines that also carry position data (x, h), so tests
// can exercise indentation-based bullets and height-based headings without
// going through a real PDF.
const mkPos = (arr) => ({
  lines: arr.map((l, i) => ({ n: i + 1, text: l.text, ...(l.x !== undefined ? { x: l.x } : {}), ...(l.h !== undefined ? { h: l.h } : {}) })),
  pages: 1,
  text: arr.map((l) => l.text).join("\n"),
});

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

// FIX 1: a fault describing N lines must carry all N of them, not just the
// first. This is the assertion whose absence let a fault naming "41 of 41
// bullets" set `line` to only the first one, so of 28 such lines that fell
// inside the stored preview window, exactly 1 ever rendered highlighted.
assert.deepEqual(impact.lines, [2, 3], "the fault must carry every vague bullet's line number, not just the first");
assert.equal(impact.line, impact.lines[0], "`line` must stay a working alias for `lines[0]`");

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

// Impact (FIX 2) is now ALSO derived from weakBullets/totalBullets — the
// very ratio this fixture pair deliberately varies to produce the format
// fault under test — so without pinning it, fixing the format fault would
// also move Impact and contaminate this format-only comparison. Pin it to
// the same value on both sides so the only thing that can still move
// between the two scans is the format fault itself.
const pinnedImpactInputs = { weakBullets: withFaultChecks.weakBullets, totalBullets: withFaultChecks.totalBullets };
const extracted = { skills: ["Go", "Python"], impact: [] };
const withFaultScan = buildScan({ parsed: { pages: 1, lines: withFault.lines }, checks: { ...withFaultChecks, ...pinnedImpactInputs }, extracted, filename: "a.pdf" });
const withoutFaultScan = buildScan({ parsed: { pages: 1, lines: withoutFault.lines }, checks: { ...withoutFaultChecks, ...pinnedImpactInputs }, extracted, filename: "a.pdf" });

const advertised = Number(highFault.impact.replace("+", ""));
const actualDelta = withoutFaultScan.score - withFaultScan.score;
assert.equal(
  advertised, actualDelta,
  `advertised impact (+${advertised}) must equal the real overall-score delta from removing the fault (+${actualDelta})`
);

// TASK: positional bullets. Real resumes routinely hang-indent achievement
// lines with no bullet glyph at all (see docs/superpowers/.../
// parser-evidence.md - the actual redacted fixture has ZERO bullet
// characters anywhere). The old glyph-only BULLET regex finds nothing on
// such a resume, so the flagship "no measurable outcomes" fault can never
// fire; this must fail against that old behaviour.
const indentedInput = [
  { text: "EXPERIENCE", x: 40 },
  { text: "Senior Engineer, Acme Corp", x: 40 },
  { text: "Owned the checkout service end to end.", x: 60 },
  { text: "Mentored two junior engineers on the team.", x: 60 },
  { text: "Led the migration to a new billing platform.", x: 60 },
  { text: "Cut page load time from 4s to 1s.", x: 60 },
];
const indented = formatChecks(mkPos(indentedInput));
const indentedFault = indented.faults.find((f) => /measurable/i.test(f.issue));
assert.ok(indentedFault, "indented achievement lines with no glyph must still be detected as bullets");
assert.ok(/3 of 4/.test(indentedFault.issue), `expected 3 of 4 vague, got: ${indentedFault.issue}`);
// None of these lines carry a bullet glyph, so the rule this replaces
// (glyph-only) would have found zero bullets and never raised this fault.
const BULLET_GLYPH_ONLY = /^\s*[-*•]\s+/;
assert.equal(indentedInput.filter((l) => BULLET_GLYPH_ONLY.test(l.text)).length, 0);

// A short indented entry (a skills-list value, not an achievement sentence)
// must not count as a bullet just because it happens to sit at the same
// indent as real ones - it starts its own unit (the prior bullet already
// ended with a period) but is too short to read as an achievement.
const shortIndented = formatChecks(mkPos([
  { text: "EXPERIENCE", x: 40 },
  { text: "Senior Engineer, Acme Corp", x: 40 },
  { text: "Owned the checkout service end to end.", x: 60 },
  { text: "React", x: 60 },
]));
const shortIndentedFault = shortIndented.faults.find((f) => /measurable/i.test(f.issue));
assert.ok(shortIndentedFault, "the one real bullet must still be found");
assert.ok(/1 of 1/.test(shortIndentedFault.issue), `the short entry must not be counted as a second bullet, got: ${shortIndentedFault.issue}`);

// A line only slightly to the right of the margin (kerning/rounding, not a
// real hanging indent) must not be mistaken for a bullet.
const barelyOffset = formatChecks(mkPos([
  { text: "EXPERIENCE", x: 40 },
  { text: "Senior Engineer, Acme Corp", x: 41 },
  { text: "Owned the checkout service end to end.", x: 42 },
]));
assert.ok(!barelyOffset.faults.some((f) => /measurable/i.test(f.issue)), "a few points of jitter must not read as an indent");

// Lines with no position data at all (hand-built fixtures, or a pre-rewrite
// parse's flat text) must fall back to glyph detection exactly as before -
// this is what keeps every fault above and below unaffected by the fields
// simply not being present.
assert.deepEqual(formatChecks(mk(["EXPERIENCE", "Owned the checkout service"])).faults, []);

// TASK: font-height widens heading detection beyond the fixed list. An
// unlisted heading in a clearly taller font stops the skills-section scan
// window before it swallows the next paragraph...
const tallHeading = formatChecks(mkPos([
  { text: "SKILLS", h: 11 },
  { text: "Go, Python", h: 11 },
  { text: "RANDOM UNLISTED HEADING", h: 16 },
  { text: "Extensive background architecting resilient distributed systems across cloud environments and teams with strong communication skills for enterprise customers.", h: 11 },
]));
assert.ok(!tallHeading.faults.some((f) => /paragraph/i.test(f.issue)), "a tall short unlisted heading must stop the skills window");

// ...whereas the same unlisted heading at body height does not stop
// anything (proving the height signal, not something else, did that above),
// so the trailing prose is scanned and correctly flagged.
const sameHeightNotHeading = formatChecks(mkPos([
  { text: "SKILLS", h: 11 },
  { text: "Go, Python", h: 11 },
  { text: "RANDOM UNLISTED HEADING", h: 11 },
  { text: "Extensive background architecting resilient distributed systems across cloud environments and teams with strong communication skills for enterprise customers.", h: 11 },
]));
assert.ok(sameHeightNotHeading.faults.some((f) => /paragraph/i.test(f.issue)), "an unlisted heading at body height must not stop the window");

// REGRESSION GUARD: a short all-caps skill acronym at BODY height (not
// taller) must not be mistaken for a heading even under the new signal -
// this is the bug fixed earlier that must not come back.
const awsAtBodyHeight = formatChecks(mkPos([
  { text: "SKILLS", h: 11 },
  { text: "Go", h: 11 },
  { text: "Python", h: 11 },
  { text: "AWS", h: 11 },
  { text: "Experienced building scalable distributed backend systems for large teams across many products.", h: 11 },
]));
assert.ok(awsAtBodyHeight.faults.some((f) => /paragraph/i.test(f.issue)), "AWS at body height must not truncate the skills window");

// Real headings a fixed list didn't know about (found in an actual resume)
// now stop the skills window via the extended list alone, with no height
// data at all.
const unlistedRealHeading = formatChecks(mk(["TECHNICAL SKILLS", "BACKEND", "Node.js Express TypeScript JavaScript REST APIs WebSocket Microservices RabbitMQ", "FRONTEND", "React.js HTML CSS Bootstrap"]));
assert.ok(!unlistedRealHeading.faults.some((f) => /paragraph/i.test(f.issue)), "BACKEND must stop the skills window even though the original fixed list didn't know it");

// TASK: end-to-end through the real parser. A two-column PDF rendered with
// headless Chrome (table layout - the layout that actually produces the
// real defect - see scripts/fixtures/make-fixtures.mjs) has achievement
// lines that are indented but carry no bullet glyph. The fault must fire
// off the ACTUAL parseResume() output, not just a hand-built fixture.
const twoColParsed = await parseResume(
  readFileSync(new URL("./fixtures/resume-two-column.pdf", import.meta.url)),
  "resume-two-column.pdf",
);
assert.equal(twoColParsed.ok, true);
const twoColChecks = formatChecks(twoColParsed);
const twoColFault = twoColChecks.faults.find((f) => /measurable/i.test(f.issue));
assert.ok(twoColFault, "the real two-column fixture must trigger the measurable-outcomes fault");
assert.equal(twoColFault.sev, "High");
assert.ok(/3 of 5/.test(twoColFault.issue), `expected 3 of 5 vague bullets, got: ${twoColFault.issue}`);

// THE assertion this rule was missing: the bullet count is not an estimate
// to eyeball, it is checkable exactly against the source HTML. One of the
// five <li> achievements is written long enough to wrap across two PDF
// lines (verified below), so a naive "one reconstructed line = one bullet"
// count would report 6, not 5 - this is what catches that regression.
const { TWO_COLUMN_HTML } = await import("./fixtures/two-column-template.mjs");
const liCount = (TWO_COLUMN_HTML.match(/<li>/g) || []).length;
assert.equal(liCount, 5, "sanity: the fixture template itself has 5 <li> achievements");
const bulletCountMatch = twoColFault.issue.match(/of (\d+) bullets/);
assert.ok(bulletCountMatch, `could not read bullet count from: ${twoColFault.issue}`);
assert.equal(Number(bulletCountMatch[1]), liCount, "detected bullet count must equal the HTML's own <li> count, not the reconstructed line count");
// Confirm the wrap this is guarding against actually happened, so this test
// cannot pass for the wrong reason (e.g. every bullet fitting on one line).
const wrappedAchievementLines = twoColParsed.lines.filter((l) => l.col === 0 && /Node\.js, Express, and|TypeScript for high-volume/.test(l.text));
assert.equal(wrappedAchievementLines.length, 2, "expected the long achievement to reconstruct as two separate visual lines");

// The right-column skills values (BACKEND/FRONTEND/DATABASES/DEVOPS AND
// CLOUD and their contents) must never contribute to that count: they sit
// at x=324, "indented" only relative to the LEFT column's x=63.7 margin, not
// their own column's - the exact cross-column bug reported against the real
// resume's skills section. The bullet count already checked above (5, equal
// to the <li> count) is only proof of that if the right column is actually
// present and would have inflated a wrongly-scoped count.
const rightColumnLines = twoColParsed.lines.filter((l) => l.col === 1);
assert.ok(rightColumnLines.length >= 4, "expected the right column to be present in this fixture");

// TASK: the design specifies a "Two-column header" fault (Medium severity,
// warning that some parsers read columns out of order) for exactly the
// layout this fixture exercises, but the parser could never detect a
// column split before now. It must fire here, at Medium, with its `lines`
// covering every right-column line, and its `impact` derived the same way
// every other fault's is (not the design mockup's hardcoded "+3").
const twoColFault2 = twoColChecks.faults.find((f) => /two-column/i.test(f.issue));
assert.ok(twoColFault2, "expected the Two-column header fault on a real multi-column resume");
assert.equal(twoColFault2.sev, "Medium");
assert.match(twoColFault2.fix, /columns out of order/i);
assert.deepEqual(
  [...twoColFault2.lines].sort((a, b) => a - b),
  [...rightColumnLines.map((l) => l.n)].sort((a, b) => a - b),
  "the fault must flag every right-column line, not just one"
);
assert.equal(twoColFault2.impact, `+${Math.round(8 * 0.33)}`, "impact must be derived from SEVERITY_COST, not hardcoded");

// A genuinely single-column fixture must never raise it.
const normalParsed = await parseResume(
  readFileSync(new URL("./fixtures/resume-normal.pdf", import.meta.url)),
  "resume-normal.pdf",
);
assert.equal(normalParsed.ok, true);
const normalChecks = formatChecks(normalParsed);
assert.ok(!normalChecks.faults.some((f) => /two-column/i.test(f.issue)), "a single-column resume must not raise the two-column fault");

// TASK: Parse now measures readability, not density, and must never
// saturate a multi-column resume to the same ceiling as a clean one.
assert.ok(Number.isInteger(twoColChecks.parseScore) && twoColChecks.parseScore < 100, "a multi-column resume must not saturate Parse to 100");

// Isolate the multi-column penalty itself: two documents identical in every
// Parse signal (heading count, text-per-page, line shape) except that one
// has a line in a second column must differ by exactly the flat deduction
// - the classic ATS failure mode this task calls out, made to actually
// move the number instead of being invisible under a density floor.
const parseSignalFixture = (hasCol1) => {
  const headings = ["EXPERIENCE", "SKILLS", "EDUCATION", "PROJECTS"];
  const body = [
    "Owned the checkout service end to end with strong ownership overall.",
    "Mentored two junior engineers on the team this year in total.",
    "Led the migration to a new billing platform smoothly overall.",
    "Cut page load time from four seconds down to about one now.",
  ];
  const all = [...headings, ...body];
  return {
    pages: 1, text: all.join("\n"),
    lines: all.map((t, i) => ({ n: i + 1, text: t, col: hasCol1 && i === all.length - 1 ? 1 : 0 })),
  };
};
const singleColSignals = formatChecks(parseSignalFixture(false));
const multiColSignals = formatChecks(parseSignalFixture(true));
assert.equal(
  singleColSignals.parseScore - multiColSignals.parseScore, 20,
  "a detected second column must cost exactly the flat multi-column penalty, all else held equal"
);

// REGRESSION: the wrap-merge bug. Five independent achievement bullets,
// none ending in terminal punctuation and all at uniform line-height, so
// neither the punctuation signal nor the y-gap signal can tell one bullet
// from the next - they used to all merge into a single "bullet", reporting
// Impact 100 on a resume with three genuinely unmeasured achievements. Only
// the right-edge signal (does a line actually reach its block's own
// established edge?) can separate them, and only once real position data
// is in play, so this runs through the actual parseResume() output like
// the two-column fixture above, not a hand-built one.
const noPeriodsParsed = await parseResume(
  readFileSync(new URL("./fixtures/resume-no-periods.pdf", import.meta.url)),
  "resume-no-periods.pdf",
);
assert.equal(noPeriodsParsed.ok, true);
const noPeriodsChecks = formatChecks(noPeriodsParsed);
const { NO_PERIODS_HTML } = await import("./fixtures/no-periods-template.mjs");
const noPeriodsLiCount = (NO_PERIODS_HTML.match(/<li>/g) || []).length;
assert.equal(noPeriodsLiCount, 5, "sanity: the fixture template itself has 5 <li> bullets");
assert.equal(
  noPeriodsChecks.totalBullets, noPeriodsLiCount,
  `detected bullet count must equal the HTML's own <li> count (${noPeriodsLiCount}), got ${noPeriodsChecks.totalBullets} - the wrap-merge bug collapses this to 1`
);
// None of these five bullets ever end with a digit under the HAS_NUMBER
// regex - "three engineers", "nine", "eighteen months" are spelled out, not
// digits, so only the p99/480ms/190ms bullet counts as measured. That is a
// pre-existing, unrelated property of digit-only number detection, not
// part of the wrap-merge fix; asserted here so a future change to that
// regex (e.g. to also recognise spelled-out numbers) shows up as an
// intentional change to this number, not a silent regression.
assert.equal(noPeriodsChecks.weakBullets, 4, `expected 4 of 5 bullets to read as unmeasured, got ${noPeriodsChecks.weakBullets}`);
const noPeriodsFault = noPeriodsChecks.faults.find((f) => /measurable/i.test(f.issue));
assert.ok(noPeriodsFault, "expected the measurable-outcomes fault");
assert.ok(/4 of 5/.test(noPeriodsFault.issue), `expected 4 of 5, got: ${noPeriodsFault.issue}`);

// REGRESSION: the right-edge lookup must be scoped to (page, col, x), not
// just (page, col). A real resume's left column routinely holds a wide,
// unindented header/contact line (x=25) sharing a page with a narrower
// hang-indented achievement block (x=35, its own true wrap edge much
// closer than the header's) - pooling both into one boundary let the wide
// header stand in for the block's actual edge and blocked every genuine
// wrap in it (measured on a real two-page resume: 41 real bullets read
// back as 60). Two roles here each contribute one genuinely wrapped
// two-line bullet at x=35 (so the block's own edge is corroborated twice,
// ~295), alongside one wide unindented line at x=25 reaching almost twice
// as far - that line must not affect where the x=35 block's edge is judged
// to be.
const headerPollution = formatChecks({
  pages: 1,
  text: "",
  lines: [
    { n: 1, text: "EXPERIENCE", x: 25, x2: 100, y: 700, col: 0, page: 1 },
    { n: 2, text: "Role A", x: 25, x2: 90, y: 682, col: 0, page: 1 },
    { n: 3, text: "Contact-style line reaching far wider than the achievement block ever does", x: 25, x2: 500, y: 664, col: 0, page: 1 },
    { n: 4, text: "Building distributed systems across many teams and services in", x: 35, x2: 295, y: 646, col: 0, page: 1 },
    { n: 5, text: "several regions worldwide.", x: 35, x2: 150, y: 628, col: 0, page: 1 },
    { n: 6, text: "Role B", x: 25, x2: 85, y: 610, col: 0, page: 1 },
    { n: 7, text: "Owned migration efforts across the whole platform without any", x: 35, x2: 290, y: 592, col: 0, page: 1 },
    { n: 8, text: "issues at all during the transition period.", x: 35, x2: 220, y: 574, col: 0, page: 1 },
  ],
});
assert.equal(
  headerPollution.totalBullets, 2,
  `an unrelated wide header line must not corrupt the achievement block's own wrap edge, got ${headerPollution.totalBullets} bullets (expected 2 merged ones)`
);

// REGRESSION: WRAP_MATCH_TOLERANCE must actually be wide enough for
// realistic word-wrap slack (measured up to ~57pt on a real resume), not
// just the near-zero gaps every other hand-built fixture above happens to
// use. Roles A and B each wrap a bullet whose FIRST line reaches within a
// couple of points of the same ~300pt edge - corroborating each other, so
// the block's edge is credible - while role C's first line falls 55pt
// short of that same edge before it, too, wraps. It's C's own line, not
// A's or B's, that has to clear WRAP_MATCH_TOLERANCE, so this catches a
// tolerance that regresses back toward the credibility tolerance (20) or
// anything tighter, in a way the near-zero gaps above cannot.
const wideSlack = formatChecks({
  pages: 1,
  text: "",
  lines: [
    { n: 1, text: "EXPERIENCE", x: 25, x2: 100, y: 700, col: 0, page: 1 },
    { n: 2, text: "Role A", x: 25, x2: 90, y: 682, col: 0, page: 1 },
    { n: 3, text: "Some sentence that runs most of the way across the page and", x: 35, x2: 300, y: 664, col: 0, page: 1 },
    { n: 4, text: "stops.", x: 35, x2: 100, y: 646, col: 0, page: 1 },
    { n: 5, text: "Role B", x: 25, x2: 85, y: 628, col: 0, page: 1 },
    { n: 6, text: "Another sentence that also reaches nearly the same edge and", x: 35, x2: 298, y: 610, col: 0, page: 1 },
    { n: 7, text: "ends here.", x: 35, x2: 100, y: 592, col: 0, page: 1 },
    { n: 8, text: "Role C", x: 25, x2: 80, y: 574, col: 0, page: 1 },
    { n: 9, text: "A shorter first line that still wraps despite falling well", x: 35, x2: 245, y: 556, col: 0, page: 1 },
    { n: 10, text: "short of the edge established by the other two roles.", x: 35, x2: 200, y: 538, col: 0, page: 1 },
  ],
});
assert.equal(
  wideSlack.totalBullets, 3,
  `a first line 55pt short of a credible, corroborated edge must still count as wrapped, got ${wideSlack.totalBullets} bullets (expected 3 merged ones)`
);

console.log("format-checks ok");
