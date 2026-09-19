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

  // Parse carries the largest weight because extraction quality gates
  // everything downstream: a bad extraction poisons every subscore derived
  // from `parsed`/`extracted`. That doesn't make Parse dominant on its own,
  // though — format-checks.mjs floors parseScore at 60 for any non-empty
  // extraction, so a barely-readable resume (parseScore=60) with otherwise
  // perfect subscores still reaches an overall 86. Recalibrating that floor
  // is a deliberate non-goal here.
  const score = Math.round(
    checks.parseScore * 0.35 + keywords * 0.25 + checks.formatScore * 0.2 + impactScore * 0.2
  );

  // AI impact findings drive the Impact subscore only (via impactScore
  // above); they do not produce issue rows. Task 3 already emits one
  // aggregate fault for unmeasured bullets with a real derived impact
  // estimate, and Task 4 separately reports the same defect as up to 12
  // per-bullet findings with a hardcoded sev/impact that isn't derived from
  // anything. Merging both used to turn one root cause into ~7 rows and put
  // a fabricated number in the same shape as Task 3's real ones. `issues`
  // is therefore exactly Task 3's faults (copied so the caller's array
  // can't be mutated through it).
  const issues = [...faults];

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
