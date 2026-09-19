// Pure assembly. Every number the user sees is produced here, from plain data,
// so the whole scoring behaviour is table-testable with no network and no DB.
//
// Keywords is a placeholder weight in plan 1: the corpus comparison that gives
// it a real denominator is plan 2. It is derived from how many distinct skills
// the resume states, which is honest on its own terms and never fabricated.

// Spec D11: the parser view shows a window, and only that window is stored.
// This is a privacy commitment, not an optimisation: the full extracted text
// must never appear in the returned shape, because the product tells users
// "we store the text we show you, never the file."
export const PREVIEW_LINES = 40;

const COLORS = { good: "#12876b", warn: "#d98324", accent: "#5b4ef0" };
const colorFor = (v) => (v >= 85 ? COLORS.good : v >= 70 ? COLORS.accent : COLORS.warn);

export function buildScan({ parsed, checks, extracted, filename }) {
  // Copy rather than reference the caller's arrays: this module must not
  // mutate its inputs, and must not hand back a live alias either.
  const skills = [...(extracted.skills || [])];
  const impact = extracted.impact || [];
  const faults = checks.faults || [];

  // Keywords: 12 distinct stated skills is a full mark. Plan 2 replaces this
  // with coverage against a real posting cohort.
  const keywords = Math.max(0, Math.min(100, Math.round((skills.length / 12) * 100)));
  const impactScore = Math.max(0, 100 - impact.length * 8);

  const parts = [
    { label: "Parse", value: checks.parseScore, color: colorFor(checks.parseScore) },
    { label: "Keywords", value: keywords, color: colorFor(keywords) },
    { label: "Format", value: checks.formatScore, color: colorFor(checks.formatScore) },
    { label: "Impact", value: impactScore, color: colorFor(impactScore) },
  ];

  // Parse is weighted hardest: if a parser cannot read the file, nothing else
  // about it matters.
  const score = Math.round(
    checks.parseScore * 0.35 + keywords * 0.25 + checks.formatScore * 0.2 + impactScore * 0.2
  );

  const issues = [
    ...faults,
    ...impact.map((i) => ({
      sev: "Medium", line: null,
      issue: i.bullet.slice(0, 80),
      fix: i.why,
      impact: "+2",
    })),
  ];

  // Only faults with a real, in-window line number may flag a retained line.
  // `line: null` (no location) is filtered out here rather than left to
  // coerce against `l.n`, so it can never match and never crash. A fault
  // whose line falls beyond PREVIEW_LINES simply has no corresponding
  // retained line to match against below, so it produces no phantom entry.
  const flagged = new Set(faults.map((f) => f.line).filter((n) => n != null));
  const lines = (parsed.lines || []).slice(0, PREVIEW_LINES).map((l) => ({
    n: l.n,
    text: l.text.slice(0, 120),
    flag: flagged.has(l.n) ? "bad" : null,
  }));

  return {
    score, parts, issues,
    found: skills,
    headline: extracted.headline,
    subline: extracted.subline,
    skills,
    // Note the absence of `text`: only the displayed window is retained.
    scan: { filename, pages: parsed.pages, lines },
  };
}
