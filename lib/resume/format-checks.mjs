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
// A fixed list can never know every heading a real resume uses (real
// examples that showed up in testing: BACKEND, FRONTEND, DATABASES, DEVOPS
// AND CLOUD, ENGINEERING PRACTICES, AI DEVELOPMENT TOOLS, CORE STRENGTHS,
// EXPERIENCE CONTINUED, CERTIFICATES). `isHeading` below also checks font
// height for the ones this list still misses.
const SECTION_HEADINGS = new Set([
  "SUMMARY", "OBJECTIVE", "PROFILE", "ABOUT",
  ...SKILLS_HEADINGS,
  "EXPERIENCE", "WORK EXPERIENCE", "EMPLOYMENT", "EMPLOYMENT HISTORY",
  "EDUCATION", "PROJECTS", "CERTIFICATIONS", "CERTIFICATES", "AWARDS",
  "PUBLICATIONS", "LANGUAGES", "INTERESTS", "VOLUNTEER", "REFERENCES",
  "BACKEND", "FRONTEND", "DATABASES", "DEVOPS AND CLOUD",
  "ENGINEERING PRACTICES", "AI DEVELOPMENT TOOLS", "CORE STRENGTHS",
  "EXPERIENCE CONTINUED",
]);
const normalizeHeading = (t) => t.trim().toUpperCase().replace(/[:\s]+$/, "");
const isSkillsHeading = (t) => SKILLS_HEADINGS.has(normalizeHeading(t));

// A line whose font is clearly taller than the document's body text and
// whose text is short reads as a heading even when its exact wording isn't
// in SECTION_HEADINGS - this is how real resumes' own unlisted headings
// (see above) get picked up without an ever-growing list. `bodyHeight` is
// undefined for line data with no positional info (hand-built test fixtures,
// or the flat text a pre-rewrite parse produced), in which case this signal
// simply never fires and detection falls back to the known-list check alone.
// This is also what keeps a short all-caps skill acronym like "AWS" or "SQL"
// from being mistaken for a heading: in real position data it sits at body
// height like its neighbouring skills, so the height test correctly says no,
// exactly as the known-list check already did on its own.
const HEADING_HEIGHT_RATIO = 1.3;
const HEADING_MAX_WORDS = 5;
const HEADING_MAX_CHARS = 40;
function looksLikeHeadingByHeight(line, bodyHeight) {
  if (!bodyHeight || typeof line.h !== "number") return false;
  if (line.h < bodyHeight * HEADING_HEIGHT_RATIO) return false;
  const t = line.text.trim();
  if (!t || t.length > HEADING_MAX_CHARS) return false;
  if (t.split(/\s+/).length > HEADING_MAX_WORDS) return false;
  return true;
}
const isHeading = (line, bodyHeight) =>
  SECTION_HEADINGS.has(normalizeHeading(line.text)) || looksLikeHeadingByHeight(line, bodyHeight);

// Most-common (mode) value, rounded to `precision` points, so a handful of
// headings or one stray outlier can't shift what "typical" means.
function mode(values, precision = 1) {
  if (!values.length) return null;
  const counts = new Map();
  for (const v of values) {
    const key = Math.round(v / precision) * precision;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null, bestCount = 0;
  for (const [k, c] of counts) if (c > bestCount) { bestCount = c; best = k; }
  return best;
}

// Mirrors the parser's own column detection (see lib/resume/parse.mjs) so a
// right-column heading's x is never compared against a left-column margin.
const COLUMN_GAP_MIN = 60;
const COLUMN_MIN_ITEMS = 4;
const INDENT_MIN = 6; // pt beyond its own column's margin to count as a hanging indent

function detectColumnBoundary(xs) {
  if (xs.length < COLUMN_MIN_ITEMS * 2) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  let bestGap = 0, bestIdx = -1;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > bestGap) { bestGap = gap; bestIdx = i; }
  }
  if (bestIdx < 0 || bestGap < COLUMN_GAP_MIN) return null;
  if (bestIdx < COLUMN_MIN_ITEMS || sorted.length - bestIdx < COLUMN_MIN_ITEMS) return null;
  return (sorted[bestIdx - 1] + sorted[bestIdx]) / 2;
}

// The left margin of a group of x-values. Deliberately NOT the mode: a
// resume routinely has far more indented achievement lines than margin-level
// heading/role lines (the real fixture measured 33 indented vs 18 at the
// margin - see parser-evidence.md), so the most COMMON x is often the indent
// itself. Indentation only ever moves right, so the margin is the smallest
// x actually seen, taking the mode of values within a small jitter of that
// minimum (kerning/rounding noise) so one freak low outlier can't set it.
const MARGIN_NOISE = 3;
function marginOf(xs) {
  if (!xs.length) return null;
  const minX = Math.min(...xs);
  const atMargin = xs.filter((x) => x - minX <= MARGIN_NOISE);
  return mode(atMargin) ?? minX;
}

// A bullet is a line indented past the left margin of its own column - real
// resumes routinely hang-indent achievement lines with no bullet character
// at all (see parser-evidence.md). `xs` with no positional data (undefined
// `x`, as in hand-built line fixtures) leaves this permanently false, so
// detection falls back to the glyph regex alone, unchanged from before.
function makeIsIndented(lines) {
  const xs = lines.map((l) => l.x).filter((x) => typeof x === "number");
  if (!xs.length) return () => false;
  const boundary = detectColumnBoundary(xs);
  const left = boundary === null ? xs : xs.filter((x) => x < boundary);
  const right = boundary === null ? [] : xs.filter((x) => x >= boundary);
  const leftMargin = marginOf(left);
  const rightMargin = right.length ? marginOf(right) : null;
  return (line) => {
    if (typeof line.x !== "number") return false;
    const margin = boundary === null || line.x < boundary ? leftMargin : rightMargin;
    return margin !== null && line.x - margin > INDENT_MIN;
  };
}

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
  // The document's own typical text height, so a line can be judged against
  // ITS resume rather than a fixed pt value that would be wrong for a 9pt
  // dense CV or a 12pt sparse one. Undefined when no line carries `h`.
  const bodyHeight = mode(body.map((l) => l.h).filter((h) => typeof h === "number" && h > 0));
  const isIndented = makeIsIndented(body);

  // Skills written as prose: parsers index comma-separated terms, not sentences.
  const skillsIdx = body.findIndex((l) => isSkillsHeading(l.text));
  if (skillsIdx >= 0) {
    // Find the extent of the skills section: up to the next heading or 8 lines.
    const nextHeadingIdx = body.slice(skillsIdx + 1).findIndex((l) => isHeading(l, bodyHeight));
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

  // Bullets with no number: the most common weakness, and measurable. A
  // bullet is a line that either carries a glyph or hangs indented past its
  // own column's margin - real resumes routinely do the latter with no
  // glyph at all.
  const bullets = body.filter((l) => BULLET.test(l.text) || isIndented(l));
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
