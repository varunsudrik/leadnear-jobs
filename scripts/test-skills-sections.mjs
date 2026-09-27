import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bodyText, decodeEntities, toLines, plainText, headingLevel, requirementsSection } from "../lib/skills/sections.mjs";

// Real postings from staging (scripts/fixtures/export-job-descriptions.mjs
// records why each one is here). Synthetic fixtures alone passed while the
// resume parser failed on the first real PDF, so every behaviour below that a
// real posting can pin is pinned by one.
const fixture = (md5) =>
  readFileSync(new URL(`./fixtures/job-descriptions/${md5}.html`, import.meta.url), "utf8");
const lines = (description) => requirementsSection(description).text.split("\n");

// ─── decodeEntities ─────────────────────────────────────────────────────────
assert.equal(decodeEntities("a &amp; b &lt;p&gt; &#39;x&#39; &#x2022;"), "a & b <p> 'x' •");
assert.equal(decodeEntities("&nbsp;"), " ");
assert.equal(decodeEntities("&bogus; stays"), "&bogus; stays");
assert.equal(decodeEntities(null), "");

// ─── toLines ────────────────────────────────────────────────────────────────
assert.deepEqual(toLines("<h2>Skills</h2><p>Python</p>"), [
  { text: "Skills", marked: "h" },
  { text: "Python", marked: null },
]);
// A line that is entirely bold is a soft heading; bold inside a sentence is not.
assert.deepEqual(toLines("<p><strong>Requirements:</strong></p>"), [{ text: "Requirements:", marked: "b" }]);
assert.deepEqual(toLines("<p><b>Note</b> this is text</p>"), [{ text: "Note this is text", marked: null }]);
// Greenhouse stores HTML entity-escaped; it must parse like real HTML.
assert.deepEqual(toLines("&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;"), [
  { text: "Requirements", marked: "h" },
  { text: "• SQL", marked: null },
]);
// Workday's <li><p>…</p></li> leaves a bullet alone on its own line; dropped.
assert.deepEqual(toLines("<ul><li><p>Python</p></li></ul>"), [{ text: "Python", marked: null }]);
// Plain text (lever) keeps its lines.
assert.deepEqual(toLines("Qualifications:\n• SQL\n\n"), [
  { text: "Qualifications:", marked: null },
  { text: "• SQL", marked: null },
]);
assert.deepEqual(toLines(null), []);
assert.equal(plainText("<p>One</p><p>Two</p>"), "One\nTwo");

// ─── headingLevel ───────────────────────────────────────────────────────────
assert.equal(headingLevel({ text: "Qualifications", marked: "h" }), "h");
// ALL-CAPS is a hard heading even when it is also bold.
assert.equal(headingLevel({ text: "QUI VOUS ÊTES", marked: "b" }), "h");
// ...but a line of acronyms is not a heading at all.
assert.equal(headingLevel({ text: "SQL, AWS, GCP", marked: null }), null);
assert.equal(headingLevel({ text: "SQL AND AWS", marked: null }), null);
assert.equal(headingLevel({ text: "Profil recherché :", marked: "b" }), "b");
assert.equal(headingLevel({ text: "What Makes You a Great Fit", marked: null }), "b");
assert.equal(headingLevel({ text: "What Will You Do?", marked: null }), "b");
assert.equal(headingLevel({ text: "Benefits", marked: null }), "b");
assert.equal(headingLevel({ text: "• Python and SQL skills", marked: null }), null);
assert.equal(headingLevel({ text: "Experience building distributed systems.", marked: null }), null);
assert.equal(headingLevel({ text: "Salesforce CRM", marked: null }), null);

// ─── requirementsSection: rules ─────────────────────────────────────────────
// Inline heading: the content after the colon is the requirement.
assert.deepEqual(
  requirementsSection("About us\nWe build things.\nRequirements: Python, SQL\nBenefits\nFree lunch"),
  { text: "Python, SQL", source: "section" }
);
// A hard heading ends the section.
assert.deepEqual(
  requirementsSection("<h2>Requirements</h2><p>Python</p><h2>Our Story</h2><p>Founded 1999</p>"),
  { text: "Python", source: "section" }
);
// A neutral bold sub-heading inside Qualifications keeps the section open, and
// the JSON-LD block is labelled as such.
assert.deepEqual(
  requirementsSection("<h2>Qualifications</h2><p><strong>Tools:</strong></p><ul><li>SQL</li></ul>"),
  { text: "• SQL", source: "jsonld" }
);
// A short keyword line may be a requirement, not a heading: its text is kept.
assert.deepEqual(
  requirementsSection("Requirements:\nSQL and Python experience\nDocker"),
  { text: "SQL and Python experience\nDocker", source: "section" }
);
// Inside a company blurb, "Experience: …" is prose, not a heading; only a
// strong inline heading ("Requirements: …") opens requirements there.
assert.deepEqual(
  requirementsSection("About us\nExperience: 20 years serving AWS customers\nRequirements:\n• Python"),
  { text: "• Python", source: "section" }
);
assert.deepEqual(
  requirementsSection("Experience: 5+ years of Python\nAbout us\nA bank."),
  { text: "5+ years of Python", source: "section" }
);
// An empty Qualifications heading elsewhere does not make the tier "jsonld".
assert.deepEqual(
  requirementsSection("<h3>Requirements</h3><p>SQL</p><h2>Qualifications</h2>"),
  { text: "SQL", source: "section" }
);
assert.deepEqual(requirementsSection("<p>We are hiring.</p>"), { text: "We are hiring.", source: "body" });
assert.deepEqual(requirementsSection(null), { text: "", source: "body" });

// ─── bodyText (no requirements section to target) ───────────────────────────
// Company blurbs, perks and EEO text are dropped; responsibilities are kept.
assert.equal(
  bodyText("About us\nWe are Acme, trusted by AWS and Databricks.\nWhat you'll do\nBuild services with Python.\nBenefits\nHome Office stipend"),
  "What you'll do\nBuild services with Python."
);
assert.equal(bodyText("<p>No headings at all.</p><p>Every line stays.</p>"), "No headings at all.\nEvery line stays.");
// The body fallback of requirementsSection uses it too.
assert.deepEqual(
  requirementsSection("<h2>Who we are</h2><p>A bank.</p><h2>The role</h2><p>Manage home loans.</p>"),
  { text: "The role\nManage home loans.", source: "body" }
);

// ─── requirementsSection: real postings ─────────────────────────────────────
// smartrecruiters: JSON-LD Qualifications with a nested bold sub-heading
// ("To be successful in this role:") that must not end the block.
{
  const d = fixture("02c555922c9d5a7cf8fc25cde2387d88");
  assert.equal(requirementsSection(d).source, "jsonld");
  assert.deepEqual(lines(d), [
    "• You must be 18 years of age or over to work in one of our betting shops.",
    "• Previous work in a customer-facing setting.",
    "• Confidence working with customers in person.",
    "• Familiarity with cash handling and payment transactions.",
  ]);
}
// smartrecruiters, French: ALL-CAPS bold headings reset state, so "QUI NOUS
// SOMMES" (about us) and "CE QUE NOUS OFFRONS" (benefits) stay out. Its
// <h2>Qualifications</h2> is empty; the lines come from "QUI VOUS ÊTES", so the
// tier is "section", not "jsonld".
{
  const d = fixture("01d39d5344915c6cd908ddf16e4cf025");
  const text = requirementsSection(d).text;
  assert.equal(requirementsSection(d).source, "section");
  assert.equal(lines(d).length, 11);
  assert.equal(lines(d)[0], "Nous recherchons des collaborateurs ayant...");
  assert.doesNotMatch(text, /Le groupe H&M/);
  assert.doesNotMatch(text, /rémunération/);
}
// greenhouse: entity-escaped HTML decoded, required and preferred both kept,
// company intro and responsibilities left out.
{
  const d = fixture("1cda1fa73adc4518b181c0be5c26212e");
  const text = requirementsSection(d).text;
  assert.equal(requirementsSection(d).source, "section");
  assert.equal(lines(d)[0], "• Bachelor’s degree in an engineering discipline");
  assert.match(text, /Master’s degree in welding engineering/);
  assert.doesNotMatch(text, /SpaceX was founded/);
  assert.doesNotMatch(text, /Work closely with design, tooling/);
  assert.doesNotMatch(text, /&lt;|&amp;/);
}
// lever: plain text, question-style headings; the section starts at "What
// Makes You a Great Fit", keeps "Desirable", and stops at "Why You’ll Love
// Working Here".
{
  const d = fixture("0215b108f224ed5ac1c4121c410dd754");
  const text = requirementsSection(d).text;
  assert.equal(requirementsSection(d).source, "section");
  assert.equal(lines(d).length, 16);
  assert.equal(lines(d)[0], "What Makes You a Great Fit");
  assert.match(text, /HubSpot/);
  assert.match(text, /^Desirable$/m);
  assert.doesNotMatch(text, /Rocket‑Fuelled Growth/);
  assert.doesNotMatch(text, /Build and manage a pipeline/);
}
// workday: bullets on their own line are dropped, not kept as "•" lines.
{
  const d = fixture("0082c726c7e9f44dd1803326d66b30b1");
  assert.equal(requirementsSection(d).source, "section");
  assert.equal(lines(d).length, 8);
  assert.match(lines(d)[0], /^3\+ years of relevant clinical/);
  assert.ok(!lines(d).includes("•"));
  assert.doesNotMatch(requirementsSection(d).text, /Work Flexibility/);
}
// breezy: page-template placeholders only — nothing to target, so body.
{
  const d = fixture("01f40505eac208b71053b00e99eeb619");
  assert.equal(requirementsSection(d).source, "body");
  assert.match(requirementsSection(d).text, /%BUTTON_APPLY_TO_POSITION%/);
}
// oraclecloud: the heading element carries its own content.
assert.deepEqual(requirementsSection(fixture("013dac763cb5ca903933eb6402de879f")), {
  text: "Graduate, Masters/Postgraduate",
  source: "section",
});

console.log("skills-sections ok");
