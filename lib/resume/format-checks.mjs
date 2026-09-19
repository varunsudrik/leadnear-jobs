// Pure. No IO, no AI. Everything here is a mechanical property of the parsed
// text, which is exactly what an ATS sees, so these are the findings we can
// state with certainty.
export const SEVERITIES = ["High", "Medium", "Low"];

const BULLET = /^\s*[-*•]\s+/;
const HAS_NUMBER = /\d/;
// Single source of truth for what counts as a "skills" heading, so the
// section finder below can never drift from the headings the parser knows
// about. Kept as a subset of SECTION_HEADINGS.
const SKILLS_HEADINGS = new Set(["SKILLS", "TECHNICAL SKILLS", "CORE COMPETENCIES", "COMPETENCIES"]);
const SECTION_HEADINGS = new Set([
  "SUMMARY", "OBJECTIVE", "PROFILE", "ABOUT",
  ...SKILLS_HEADINGS,
  "EXPERIENCE", "WORK EXPERIENCE", "EMPLOYMENT", "EMPLOYMENT HISTORY",
  "EDUCATION", "PROJECTS", "CERTIFICATIONS", "AWARDS",
  "PUBLICATIONS", "LANGUAGES", "INTERESTS", "VOLUNTEER", "REFERENCES",
]);
const normalizeHeading = (t) => t.trim().toUpperCase().replace(/[:\s]+$/, "");
const isHeading = (t) => SECTION_HEADINGS.has(normalizeHeading(t));
const isSkillsHeading = (t) => SKILLS_HEADINGS.has(normalizeHeading(t));

// What each fault costs the format subscore (used to compute formatScore
// below), and — because formatScore itself is only worth 20% of the overall
// score in lib/resume/score.mjs — what fixing it is honestly worth on the
// number the user actually sees. "Est. impact" is not a separate estimate;
// it IS this arithmetic, so it can never drift out of sync with what
// removing the fault actually does to the score.
const SEVERITY_COST = { High: 14, Medium: 8, Low: 3 };
const OVERALL_FORMAT_WEIGHT = 0.2;
const estImpact = (sev) => `+${Math.round(SEVERITY_COST[sev] * OVERALL_FORMAT_WEIGHT)}`;

export function formatChecks({ lines = [], pages = 1, text = "" }) {
  const faults = [];
  const body = lines.filter((l) => l.text.trim());

  // Skills written as prose: parsers index comma-separated terms, not sentences.
  const skillsIdx = body.findIndex((l) => isSkillsHeading(l.text));
  if (skillsIdx >= 0) {
    // Find the extent of the skills section: up to the next heading or 8 lines.
    const nextHeadingIdx = body.slice(skillsIdx + 1).findIndex((l) => isHeading(l.text));
    const endIdx = nextHeadingIdx >= 0 ? skillsIdx + 1 + nextHeadingIdx : Math.min(skillsIdx + 8, body.length);
    const after = body.slice(skillsIdx + 1, endIdx).map((l) => l.text).join(" ");
    const delimiters = (after.match(/[,|/;•·]/g) || []).length;
    const words = after.trim().split(/\s+/).filter(Boolean).length;
    if (words > 8 && delimiters < words / 6) {
      const sev = "Medium";
      faults.push({
        sev, line: body[skillsIdx].n,
        issue: "Skills written as a paragraph",
        fix: "comma-separated list so each term is indexed",
        impact: estImpact(sev),
      });
    }
  }

  // Bullets with no number: the most common weakness, and measurable.
  const bullets = body.filter((l) => BULLET.test(l.text));
  const vague = bullets.filter((l) => !HAS_NUMBER.test(l.text));
  if (bullets.length && vague.length) {
    const sev = (vague.length >= 3 && vague.length > bullets.length / 2) ? "High" : "Medium";
    faults.push({
      sev, line: vague[0].n,
      issue: `No measurable outcomes in ${vague.length} of ${bullets.length} bullets`,
      fix: "add a number: latency, throughput, cost, team size",
      impact: estImpact(sev),
    });
  }

  // A wrapped contact line breaks naive field extraction.
  const contact = body.slice(0, 6).find((l) => /@/.test(l.text));
  if (contact && contact.text.length > 70) {
    const sev = "Medium";
    faults.push({
      sev, line: contact.n,
      issue: "Contact line wraps",
      fix: "keep email, phone and location on one short line",
      impact: estImpact(sev),
    });
  }

  // "Present" in more than one role reads as two current jobs to a date parser.
  if ((text.match(/(19|20)\d{2}\s*[-–—]\s*present\b/gi) || []).length > 1) {
    const sev = "Low";
    faults.push({
      sev, line: null,
      issue: "'Present' used in two roles",
      fix: "fine for humans; add start months for consistency",
      impact: estImpact(sev),
    });
  }

  // Parse score reflects extraction quality: did real content come out?
  const density = body.length ? Math.min(1, body.length / (pages * 35)) : 0;
  const parseScore = body.length ? Math.round(60 + 40 * density) : 0;

  // Format score starts clean and pays for each fault by severity.
  const formatScore = Math.max(0, 100 - faults.reduce((n, f) => n + SEVERITY_COST[f.sev], 0));

  return { parseScore, formatScore, faults };
}
