// Pure. No IO, no AI. Everything here is a mechanical property of the parsed
// text, which is exactly what an ATS sees, so these are the findings we can
// state with certainty.
export const SEVERITIES = ["High", "Medium", "Low"];

const BULLET = /^\s*[-*•]\s+/;
const HAS_NUMBER = /\d/;
const SECTION_HEADINGS = new Set([
  "SUMMARY", "OBJECTIVE", "PROFILE", "ABOUT",
  "SKILLS", "TECHNICAL SKILLS", "CORE COMPETENCIES",
  "EXPERIENCE", "WORK EXPERIENCE", "EMPLOYMENT", "EMPLOYMENT HISTORY",
  "EDUCATION", "PROJECTS", "CERTIFICATIONS", "AWARDS",
  "PUBLICATIONS", "LANGUAGES", "INTERESTS", "VOLUNTEER", "REFERENCES",
]);
const isHeading = (t) => SECTION_HEADINGS.has(t.trim().toUpperCase().replace(/[:\s]+$/, ""));

export function formatChecks({ lines = [], pages = 1, text = "" }) {
  const faults = [];
  const body = lines.filter((l) => l.text.trim());

  // Skills written as prose: parsers index comma-separated terms, not sentences.
  const skillsIdx = body.findIndex((l) => isHeading(l.text) && l.text.trim().toUpperCase().includes("SKILL"));
  if (skillsIdx >= 0) {
    // Find the extent of the skills section: up to the next heading or 8 lines.
    const nextHeadingIdx = body.slice(skillsIdx + 1).findIndex((l) => isHeading(l.text));
    const endIdx = nextHeadingIdx >= 0 ? skillsIdx + 1 + nextHeadingIdx : Math.min(skillsIdx + 8, body.length);
    const after = body.slice(skillsIdx + 1, endIdx).map((l) => l.text).join(" ");
    const delimiters = (after.match(/[,|/;•·]/g) || []).length;
    const words = after.trim().split(/\s+/).filter(Boolean).length;
    if (words > 8 && delimiters < words / 6) {
      faults.push({
        sev: "Medium", line: body[skillsIdx].n,
        issue: "Skills written as a paragraph",
        fix: "comma-separated list so each term is indexed",
        impact: "+2",
      });
    }
  }

  // Bullets with no number: the most common weakness, and measurable.
  const bullets = body.filter((l) => BULLET.test(l.text));
  const vague = bullets.filter((l) => !HAS_NUMBER.test(l.text));
  if (bullets.length && vague.length) {
    faults.push({
      sev: (vague.length >= 3 && vague.length > bullets.length / 2) ? "High" : "Medium", line: vague[0].n,
      issue: `No measurable outcomes in ${vague.length} of ${bullets.length} bullets`,
      fix: "add a number: latency, throughput, cost, team size",
      impact: `+${Math.min(6, vague.length)}`,
    });
  }

  // A wrapped contact line breaks naive field extraction.
  const contact = body.slice(0, 6).find((l) => /@/.test(l.text));
  if (contact && contact.text.length > 70) {
    faults.push({
      sev: "Medium", line: contact.n,
      issue: "Contact line wraps",
      fix: "keep email, phone and location on one short line",
      impact: "+3",
    });
  }

  // "Present" in more than one role reads as two current jobs to a date parser.
  if ((text.match(/(19|20)\d{2}\s*[-–—]\s*present\b/gi) || []).length > 1) {
    faults.push({
      sev: "Low", line: null,
      issue: "'Present' used in two roles",
      fix: "fine for humans; add start months for consistency",
      impact: "+1",
    });
  }

  // Parse score reflects extraction quality: did real content come out?
  const density = body.length ? Math.min(1, body.length / (pages * 35)) : 0;
  const parseScore = body.length ? Math.round(60 + 40 * density) : 0;

  // Format score starts clean and pays for each fault by severity.
  const cost = { High: 14, Medium: 8, Low: 3 };
  const formatScore = Math.max(0, 100 - faults.reduce((n, f) => n + cost[f.sev], 0));

  return { parseScore, formatScore, faults };
}
