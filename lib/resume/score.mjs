// Pure assembly. Every number the user sees is produced here, from plain data,
// so the whole scoring behaviour is table-testable with no network and no DB.
//
// Keywords cannot be scored honestly yet: the dimension is meant to be
// coverage against what live postings actually ask for, and that corpus
// comparison is deliberately deferred to a later plan. A raw count of stated
// skills (`skills.length / 12`) is not keyword coverage - a resume that lists
// 40 skills saturated it at 100 every time regardless of whether any of them
// matched anything real. Rather than ship that fabricated number, the
// Keywords bar is marked unavailable (see `parts` below) and excluded from
// the overall score entirely, with its weight redistributed across Parse,
// Format and Impact.

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

  // Impact: the real ratio behind format-checks' "no measurable outcomes"
  // fault - weak bullets over total bullets, from the deterministic
  // positional analysis - not the AI's `impact` list, which the extraction
  // schema caps at 12 entries regardless of how many bullets a resume
  // actually has. That cap is what made this score floor at 4 for almost
  // any real resume: `100 - impact.length * 8` hits its floor the moment
  // the model reports 12 or more vague bullets, which a real two-page
  // resume does constantly.
  //
  // Linear in the ratio, deliberately: a resume that's half measured and
  // half vague is a genuinely middling resume on this axis, so it should
  // read as ~50, not collapse toward either extreme the way the old count
  // did. At the true extremes - every bullet measured, or none of them -
  // the score legitimately IS 100 or 0; that's the ratio being honest, not
  // a floor or a ceiling being imposed on it. When no bullets were detected
  // at all there is no evidence to score in either direction, so this
  // defaults to a neutral midpoint rather than fabricating confidence.
  const impactScore = checks.totalBullets > 0
    ? Math.round(100 * (1 - checks.weakBullets / checks.totalBullets))
    : 50;

  const parts = [
    { label: "Parse", value: checks.parseScore, color: colorFor(checks.parseScore) },
    // Keywords has no honest number yet (see the module comment above):
    // `value`/`color` are left absent rather than a fake 0, and `available:
    // false` tells the UI to render it as a visible, explicit "not yet
    // measured" state instead of guessing from a missing value.
    { label: "Keywords", available: false },
    { label: "Format", value: checks.formatScore, color: colorFor(checks.formatScore) },
    { label: "Impact", value: impactScore, color: colorFor(impactScore) },
  ];

  // Parse used to carry the largest weight (0.35) on the theory that bad
  // extraction poisons everything downstream. That reasoning stopped being
  // honest once positional reconstruction landed: checks.parseScore was a
  // line-density proxy that floored at 60 for any non-empty extraction and
  // hit 100 for any reasonably dense page. It has since been rebuilt from
  // real readability signals (see format-checks.mjs), but is still the
  // subscore with the least direct bearing on content quality, so it keeps
  // the smallest share.
  //
  // Keywords is excluded from this sum entirely - it has no honest number
  // to weight (see above) - and its former 0.25 share is redistributed
  // proportionally across the other three, preserving their relative order
  // (impact > format > parse): 0.2/0.75, 0.25/0.75 and 0.3/0.75 of the
  // freed 0.25, rounded to clean hundredths. Keep `parse` in sync with
  // format-checks.mjs's OVERALL_FORMAT_WEIGHT by hand (no shared import
  // between the two modules) so "Est. impact" on a format fault stays an
  // exact prediction of the real score delta from fixing it.
  const WEIGHTS = { parse: 0.27, format: 0.33, impact: 0.4 };
  const score = Math.round(
    checks.parseScore * WEIGHTS.parse
      + checks.formatScore * WEIGHTS.format + impactScore * WEIGHTS.impact
  );

  // AI impact findings no longer drive any number (impactScore above is
  // now the deterministic ratio), but they are still real, model-read
  // detail about WHICH bullets are vague and WHY - so rather than discard
  // them, they ride along as supporting examples on the one fault they
  // corroborate ("No measurable outcomes in N of M bullets") instead of
  // becoming their own rows. Task 3 already emits one aggregate fault for
  // this, and an earlier version of this file separately reported the same
  // defect as up to 12 per-bullet rows with a hardcoded sev/impact that
  // wasn't derived from anything - merging both that way turned one root
  // cause into ~7 rows and put a fabricated number in the same shape as the
  // real ones. So `issues` stays exactly Task 3's faults, one row each
  // (shallow-copied so neither the caller's faults nor this module's own
  // output can be mutated through it), with `examples` attached only to the
  // fault the AI's findings actually corroborate.
  const issues = faults.map((f) => (
    /measurable/i.test(f.issue) && impact.length
      ? { ...f, examples: impact.slice(0, 3).map((i) => i.bullet) }
      : { ...f }
  ));

  // Every line a fault knows about may flag a retained line, not just the
  // first: a fault describing 41 vague bullets used to carry a single
  // `line`, so only 1 of the ~28 such lines that fell inside the stored
  // window ever rendered highlighted. `lines` (falling back to the older
  // single `line` for any caller that still only has one) is flattened into
  // one set; `selectWindow` above already picks the window covering the
  // most flagged lines, so a richer flagged set directly means more of them
  // land in view. A fault with no location (`line: null`, empty `lines`)
  // contributes nothing here rather than coercing into some in-window line
  // by accident, and a flagged line outside the chosen window simply has no
  // corresponding retained line to match against below.
  const flagged = new Set();
  for (const f of faults) {
    for (const n of Array.isArray(f.lines) ? f.lines : (f.line != null ? [f.line] : [])) {
      if (n != null) flagged.add(n);
    }
  }
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
