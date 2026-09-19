// Pure assembly. Every number the user sees is produced here, from plain data,
// so the whole scoring behaviour is table-testable with no network and no DB.
//
// Keywords is a placeholder weight in plan 1: the corpus comparison that gives
// it a real denominator is plan 2. It is derived from how many distinct skills
// the resume states, which is honest on its own terms and never fabricated.

// Spec D11: the parser view shows a window, and only that window is stored.
// This is a privacy commitment, not an optimisation: the full extracted text
// must never appear in the returned shape, because the product tells users
// "we store the text we show you, never the file." The cap itself (40 lines)
// is part of that commitment and must never be raised — see selectWindow
// below for how the 40 lines are chosen.
export const PREVIEW_LINES = 40;

// How many lines of context to show before the first flagged line in the
// chosen window, so a highlighted line doesn't sit at the very top with
// nothing above it to orient the reader.
const CONTEXT_LINES = 5;

const COLORS = { good: "#12876b", warn: "#d98324", accent: "#5b4ef0" };
const colorFor = (v) => (v >= 85 ? COLORS.good : v >= 70 ? COLORS.accent : COLORS.warn);

// Faults usually point deep into Experience — on a real two-page resume the
// unmeasured-bullets fault can target a line around 60-100 — but the stored
// preview is capped at PREVIEW_LINES for privacy (spec D11) and cannot grow
// to reach it. Taking the first PREVIEW_LINES unconditionally, as this used
// to, means the parser view routinely highlights nothing: "Fixes · N open"
// next to a panel with no highlighted line in it.
//
// So the cap stays exactly PREVIEW_LINES, but WHICH lines fill it now
// depends on where the faults are: this picks the contiguous window of that
// size that covers as many flagged lines as possible (a two-pointer scan
// over the sorted flagged line numbers — the same shape as "smallest window
// containing K points"), then backs the window start up by CONTEXT_LINES so
// the first flagged line in it has a few lines of lead-in rather than
// sitting at the top edge. Ties (no window can cover more than one flagged
// group) keep the earliest such group, so results are deterministic. With no
// flagged lines at all, this is exactly the old behaviour: the first
// PREVIEW_LINES lines.
function selectWindow(allLines, flagged) {
  if (allLines.length <= PREVIEW_LINES) return allLines;

  const flaggedNs = allLines.map((l) => l.n).filter((n) => flagged.has(n)).sort((a, b) => a - b);
  if (!flaggedNs.length) return allLines.slice(0, PREVIEW_LINES);

  let bestCount = 0;
  let bestFirst = flaggedNs[0];
  let i = 0;
  for (let j = 0; j < flaggedNs.length; j++) {
    while (flaggedNs[j] - flaggedNs[i] > PREVIEW_LINES - 1) i++;
    const count = j - i + 1;
    if (count > bestCount) {
      bestCount = count;
      bestFirst = flaggedNs[i];
    }
  }

  const minLine = allLines[0].n;
  const maxLine = allLines[allLines.length - 1].n;
  let start = Math.max(minLine, bestFirst - CONTEXT_LINES);
  let end = start + PREVIEW_LINES - 1;
  if (end > maxLine) {
    end = maxLine;
    start = Math.max(minLine, end - PREVIEW_LINES + 1);
  }
  return allLines.filter((l) => l.n >= start && l.n <= end);
}

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

  // Parse used to carry the largest weight (0.35) on the theory that bad
  // extraction poisons everything downstream. That reasoning stopped being
  // honest once positional reconstruction landed: checks.parseScore is a
  // line-density proxy (body.length / (pages*35), floored at 60 for any
  // non-empty extraction), and a two-column resume now reconstructs into
  // MORE lines than before, not fewer, so a dense real resume routinely
  // hits its 100 ceiling regardless of whether reconstruction was actually
  // clean. That is not a confidence signal, and weighting it above every
  // other subscore let a document read as "perfect" on density alone. A
  // real per-page confidence signal (e.g. how decisively column detection
  // split, how much text needed the space-gap heuristic) isn't cheaply
  // available without more parser instrumentation, so - rather than ship a
  // number that still reads as authoritative - Parse's weight is reduced to
  // reflect what it actually measures, and the freed weight moves to the
  // three subscores that are directly derived from real content (stated
  // skills, mechanical faults, and AI-identified missing outcomes).
  const WEIGHTS = { parse: 0.2, keywords: 0.25, format: 0.25, impact: 0.3 };
  const score = Math.round(
    checks.parseScore * WEIGHTS.parse + keywords * WEIGHTS.keywords
      + checks.formatScore * WEIGHTS.format + impactScore * WEIGHTS.impact
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
  // whose line falls outside the chosen window simply has no corresponding
  // retained line to match against below, so it produces no phantom entry.
  const flagged = new Set(faults.map((f) => f.line).filter((n) => n != null));
  const lines = selectWindow(parsed.lines || [], flagged).map((l) => ({
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
