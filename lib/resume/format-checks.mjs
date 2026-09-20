// Pure. No IO, no AI. Everything here is a mechanical property of the parsed
// text, which is exactly what an ATS sees, so these are the findings we can
// state with certainty.
export const SEVERITIES = ["High", "Medium", "Low"];

const BULLET = /^\s*[-*•]\s+/;
// A measurable outcome isn't always written in digits - "grew the team from
// three engineers to nine" is just as quantified as "3 to 9" - so a bullet
// also counts as measured if it spells one out: the cardinals one through
// twelve, the round multiples of ten up to fifty plus hundred/thousand/
// million, and the multiplier words double/triple/half/dozen. `\b...\b`
// word-boundary matches on BOTH sides, case-insensitive, so this can only
// match a real standalone word - "someone" has no boundary before its
// "one", "often" has no boundary before its "ten", and "nineteen" has no
// boundary after its "nine", so none of those substrings ever match.
const NUMBER_WORDS = [
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "twenty", "thirty", "forty", "fifty",
  "hundred", "thousand", "million", "double", "triple", "half", "dozen",
];
const HAS_NUMBER = new RegExp(`\\d|\\b(?:${NUMBER_WORDS.join("|")})\\b`, "i");
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

const INDENT_MIN = 6; // pt beyond its own column's margin to count as a hanging indent

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

// Which of a page's 1-2 columns a line belongs to. The parser (see
// lib/resume/parse.mjs) already decides this once, correctly, per page -
// re-deriving it here from pooled x-values was the bug: a right-column
// heading's x (e.g. ~335pt) got compared against the left column's margin
// (~25pt), read as "indented", and counted as a bullet. Lines with no `col`
// (hand-built test fixtures) share one implicit group, same as before.
const groupKey = (l) => `${l.page ?? ""}:${l.col ?? 0}`;

// A bullet is a line indented past the left margin of ITS OWN column - real
// resumes routinely hang-indent achievement lines with no bullet character
// at all (see parser-evidence.md). Lines with no positional info (undefined
// `x`, as in hand-built line fixtures) leave this permanently false, so
// detection falls back to the glyph regex alone, unchanged from before.
function makeIsIndented(lines) {
  const withPos = lines.filter((l) => typeof l.x === "number");
  if (!withPos.length) return () => false;
  const marginByGroup = new Map();
  for (const l of withPos) {
    const key = groupKey(l);
    if (!marginByGroup.has(key)) marginByGroup.set(key, []);
    marginByGroup.get(key).push(l.x);
  }
  for (const [key, xs] of marginByGroup) marginByGroup.set(key, marginOf(xs));
  return (line) => {
    if (typeof line.x !== "number") return false;
    const margin = marginByGroup.get(groupKey(line));
    return margin != null && line.x - margin > INDENT_MIN;
  };
}

// How many words a hang-indented line needs to read as an achievement
// sentence rather than a short skills-list entry that happens to sit at the
// same indent as real bullets (a category value under its own column's
// heading, once margins are correctly scoped per column). Chosen from what
// is on hand: every real achievement bullet in the fixtures and the redacted
// real resume runs well past this; a skills entry ("React", "Node.js
// Express TypeScript") never does. A literal bullet glyph is a strong,
// unambiguous signal on its own and is exempt from this floor.
const MIN_INDENTED_BULLET_WORDS = 5;
const wordCount = (t) => t.trim().split(/\s+/).filter(Boolean).length;
// The wrap-vs-new-bullet signal: a line ending mid-sentence (no terminal
// punctuation) is continued by whatever comes next at the same indent.
const endsSentence = (t) => /[.!?]["'’”)\]]*\s*$/.test(t.trim());

// Did a line actually run out of horizontal room, i.e. wrap? This is the
// PRIMARY continuation signal (see buildBulletUnits below) because it is
// the only one that is always present: a resume whose bullets don't end in
// a full stop AND use uniform line spacing throughout defeats both the
// punctuation test and the y-gap test at once, and every line in it then
// looks exactly like a continuation of the one before - which is what
// merged 5 independent bullets into 1 on a real rendered fixture with
// neither terminal punctuation nor an irregular gap anywhere in it.
//
// A column's right edge isn't known in advance, so it's estimated from the
// widest right edge (`x2`) actually observed among comparable lines -
// genuinely wrapped lines are, by definition, the ones that ran up against
// it. "Comparable" has to mean more than just (page, col): a real resume's
// left column routinely holds both a hang-indented achievement block (x=35,
// wraps around x2=307) AND unindented headers, role lines and a wide
// contact line at the page's own margin (x=25, reaching x2=565 for a long
// contact line) sharing that same (page, col) - pooling all of it into one
// boundary let an unrelated wide header line stand in for the achievement
// block's actual, much narrower wrap edge, and blocked every genuine wrap
// in that block (real resume: 41 real bullets read back as 60). So the
// lookup is scoped to (page, col, x): only lines at essentially the same
// indent - the same text block - vote on where IT wraps.
//
// The other wrinkle: the single widest line in a group is trivially "at
// the boundary" if the boundary is simply its own x2, which would wrongly
// call an ordinary long-but-unwrapped line a wrap every time (exactly a
// resume whose bullets never wrap at all: whichever one is merely the
// longest would still self-qualify). The credibility check below already
// closes this: it only trusts an edge once the top two x2 values in a
// group agree within WRAP_CREDIBILITY_TOLERANCE, so by construction
// `max` and `secondMax` are never more than that far apart in any group
// this code actually treats as wrapped - there is no meaningfully
// different "boundary excluding this line" left to compute.
//
// Two different tolerances are doing two different jobs here, and
// collapsing them into one number doesn't work - measured on a real
// two-page resume, genuine wraps land anywhere from 0.3pt to ~57pt short of
// their block's edge (word-wrap can only break on a word boundary, so the
// last word that DIDN'T fit routinely leaves that much slack), while an
// adversarial fixture of five independent, never-wrapping bullets has its
// widest two lines only 28pt apart - inside that same 0-57pt range. No
// single cutoff on "distance from the edge" separates those two cases.
// What DOES separate them: on the real resume, several DIFFERENT bullets
// independently reach within a couple of points of the same ~307pt edge,
// because they're all genuinely constrained by it; on the adversarial
// fixture, no two lines agree on where an edge even is, because none of
// them are actually wrapping. So a block's edge is only trusted at all
// once its own top two lines corroborate each other (WRAP_CREDIBILITY_
// TOLERANCE, tight); once trusted, an individual line is matched against
// it with the generous word-wrap-slack allowance (WRAP_MATCH_TOLERANCE).
const WRAP_CREDIBILITY_TOLERANCE = 20; // pt; a block's own top two lines must agree this closely before its "edge" is trusted at all
const WRAP_MATCH_TOLERANCE = 65; // pt; how far short of a TRUSTED edge a line may fall and still count as wrapped - generous on purpose: the adversarial "nothing here actually wraps" case is caught entirely by the credibility gate above, not by this number, so this only needs to cover genuine word-wrap slack (measured up to ~57pt on a real two-page resume)
const rightEdgeGroupKey = (pageColKey, x) =>
  typeof x === "number" ? `${pageColKey}:${Math.round(x)}` : pageColKey;
function makeRightEdgeLookup(body) {
  const byGroup = new Map();
  for (const l of body) {
    if (typeof l.x2 !== "number") continue;
    const key = rightEdgeGroupKey(groupKey(l), l.x);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(l.x2);
  }
  const statsByGroup = new Map();
  for (const [key, xs] of byGroup) {
    const [max, secondMax] = [...xs].sort((a, b) => b - a);
    const credible = secondMax != null && (max - secondMax) <= WRAP_CREDIBILITY_TOLERANCE;
    statsByGroup.set(key, { max, credible });
  }
  return {
    // true/false is a real signal; null means "no evidence either way" (no
    // x2 on this line), in which case the caller falls back to its other
    // signals unchanged. An x2-bearing line in a block whose edge was never
    // corroborated (`credible: false`) gets a real `false`, not `null` -
    // that block's lines simply don't agree on any shared edge, which is
    // itself evidence against any of them having wrapped, and the fixture
    // this exists for has no other usable signal to fall back to.
    wraps(pageColKey, x, x2) {
      if (typeof x2 !== "number") return null;
      const stats = statsByGroup.get(rightEdgeGroupKey(pageColKey, x));
      if (!stats) return null;
      if (!stats.credible) return false;
      return Math.abs(stats.max - x2) <= WRAP_MATCH_TOLERANCE;
    },
  };
}

// A resume routinely wraps one achievement across 2-3 visual lines at the
// same x; counting each wrapped line as its own bullet is what inflated "no
// measurable outcomes" to 107 of 111 on a real two-page resume. This walks
// the body in document order and folds a continuation line into the bullet
// it wraps - same x, same column, the previous line actually ran out of
// room (see makeRightEdgeLookup above - the primary signal, since it alone
// doesn't depend on punctuation or line spacing being irregular), an
// unremarkable line-to-line gap, and the bullet so far doesn't already end
// a sentence - so the merged unit is judged as the one achievement it
// actually is. Anything else (a line that had room to keep going and
// didn't, terminal punctuation already seen, an unusually large y-gap, or a
// different x) starts a new unit; a non-bullet line (heading, role, date)
// always ends whatever run was in progress.
function buildBulletUnits(body, isIndented) {
  const typicalGap = makeTypicalGapLookup(body);
  const rightEdge = makeRightEdgeLookup(body);
  const units = [];
  let current = null;

  for (const line of body) {
    const glyph = BULLET.test(line.text);
    const indented = isIndented(line);
    if (!glyph && !indented) {
      current = null;
      continue;
    }
    const sameSpot = current
      && typeof line.x === "number" && typeof current.x === "number"
      && Math.abs(line.x - current.x) <= MARGIN_NOISE
      && groupKey(line) === current.key;
    const gapOk = current && !typicalGap.isAbnormal(current.key, current.lastY, line.y);
    const wrapSignal = current ? rightEdge.wraps(current.key, current.x, current.lastX2) : null;
    const rightEdgeOk = wrapSignal !== false; // null (unknown) stays permissive
    if (sameSpot && gapOk && rightEdgeOk && !endsSentence(current.text)) {
      current.text += (/\s$/.test(current.text) ? "" : " ") + line.text;
      current.glyph = current.glyph || glyph;
      current.lastY = line.y;
      current.lastX2 = line.x2;
    } else {
      current = { text: line.text, n: line.n, x: line.x, key: groupKey(line), glyph, lastY: line.y, lastX2: line.x2 };
      units.push(current);
    }
  }

  // A unit sourced purely from indentation (no glyph anywhere in it) still
  // needs to look like an achievement sentence, not a short label.
  return units.filter((u) => u.glyph || wordCount(u.text) >= MIN_INDENTED_BULLET_WORDS);
}

// This resume's normal line-to-line step, per (page, col), learned from
// every consecutive same-group pair (not just bullets) so an unusually big
// gap - a paragraph break with no trailing punctuation - can still end a
// bullet run even without that punctuation signal.
function makeTypicalGapLookup(body) {
  const byGroup = new Map();
  for (const l of body) {
    if (typeof l.y !== "number") continue;
    const key = groupKey(l);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(l.y);
  }
  const typicalByGroup = new Map();
  for (const [key, ys] of byGroup) {
    const gaps = [];
    for (let i = 1; i < ys.length; i++) {
      const g = ys[i - 1] - ys[i];
      if (g > 0) gaps.push(g);
    }
    typicalByGroup.set(key, mode(gaps, 0.5));
  }
  return {
    isAbnormal(key, prevY, curY) {
      if (typeof prevY !== "number" || typeof curY !== "number") return false;
      const typical = typicalByGroup.get(key);
      if (!typical) return false;
      return (prevY - curY) > typical * 1.6;
    },
  };
}

// What each fault costs the format subscore (used to compute formatScore
// below), and — because formatScore itself is only worth 33% of the overall
// score in lib/resume/score.mjs (WEIGHTS.format there, after Keywords was
// pulled out of the weighted sum entirely and its share redistributed — see
// score.mjs) — what fixing it is honestly worth on the number the user
// actually sees. "Est. impact" is not a separate estimate; it IS this
// arithmetic, so it can never drift out of sync with what removing the fault
// actually does to the score. Keep this in sync with score.mjs's
// WEIGHTS.format by hand: there is no shared import between the two modules
// (format-checks.mjs is deliberately dependency-free).
const SEVERITY_COST = { High: 14, Medium: 8, Low: 3 };
const OVERALL_FORMAT_WEIGHT = 0.33;
const estImpact = (sev) => `+${Math.round(SEVERITY_COST[sev] * OVERALL_FORMAT_WEIGHT)}`;

// Every fault now carries every offending line it knows about, not just the
// first — a fault describing 41 bullets used to set `line` to the first one
// only, so of the 28 such lines that happened to fall inside the stored
// 40-line preview window, exactly 1 ever rendered highlighted under a
// caption reading "Highlighted lines are the ones costing you points". Most
// call sites already computed the full set (`vague`, `col1Lines`, ...) and
// simply threw it away when building the fault object. `line` stays as an
// alias for `lines[0]` so any older reader of a single line number keeps
// working unchanged.
const mkFault = (sev, lines, issue, fix) => ({
  sev, lines, line: lines.length ? lines[0] : null, issue, fix, impact: estImpact(sev),
});

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
      // The heading plus every prose line in the section it introduces —
      // that whole span is what reads as a paragraph, not just its heading.
      const sectionLines = body.slice(skillsIdx, endIdx).map((l) => l.n);
      faults.push(mkFault("Medium", sectionLines, "Skills written as a paragraph", "comma-separated list so each term is indexed"));
    }
  }

  // Bullets with no number: the most common weakness, and measurable. A
  // bullet is a line that either carries a glyph or hangs indented past its
  // own column's margin - real resumes routinely do the latter with no
  // glyph at all - with wrapped continuation lines folded into the one
  // bullet they belong to (see buildBulletUnits).
  const bulletUnits = buildBulletUnits(body, isIndented);
  const vague = bulletUnits.filter((u) => !HAS_NUMBER.test(u.text));
  if (bulletUnits.length && vague.length) {
    const sev = (vague.length >= 3 && vague.length > bulletUnits.length / 2) ? "High" : "Medium";
    faults.push(mkFault(
      sev, vague.map((u) => u.n),
      `No measurable outcomes in ${vague.length} of ${bulletUnits.length} bullets`,
      "add a number: latency, throughput, cost, team size",
    ));
  }

  // A wrapped contact line breaks naive field extraction.
  const contact = body.slice(0, 6).find((l) => /@/.test(l.text));
  if (contact && contact.text.length > 70) {
    faults.push(mkFault("Medium", [contact.n], "Contact line wraps", "keep email, phone and location on one short line"));
  }

  // "Present" in more than one role reads as two current jobs to a date
  // parser. Matched per line (not against the whole joined text) so the
  // fault can point at the actual role lines instead of nowhere at all.
  const PRESENT_RE = /(19|20)\d{2}\s*[-–—]\s*present\b/i;
  const presentLines = body.filter((l) => PRESENT_RE.test(l.text));
  if (presentLines.length > 1) {
    faults.push(mkFault(
      "Low", presentLines.map((l) => l.n),
      "'Present' used in two roles", "fine for humans; add start months for consistency",
    ));
  }

  // Multi-column layout is the classic ATS failure mode: plenty of real
  // parsers still read a page in content-stream order, not visual order,
  // and weld the second column's text into the middle of the first one's
  // sentences. This parser reconstructs columns correctly (see parse.mjs),
  // but that says nothing about every OTHER parser a resume might meet, so
  // the fault fires whenever a second column was detected at all.
  const col1Lines = body.filter((l) => l.col === 1);
  if (col1Lines.length) {
    faults.push(mkFault(
      "Medium", col1Lines.map((l) => l.n),
      "Two-column header", "some parsers read columns out of order; use one column",
    ));
  }

  // Parse answers "can a parser read this file at all?" - it used to be
  // `60 + 40 * (lines per page)`, a pure density proxy that floored at 60
  // for ANY non-empty extraction and hit 100 for any reasonably dense page,
  // regardless of whether the content that came out means anything. Real
  // signals for actual readability, all cheaply available from what's
  // already been reconstructed:
  //   - textPerPageScore: substantive text came out per page at all. A
  //     ~900-char page (roughly what a normal one-page resume's worth of
  //     prose runs to) earns full credit; less scales down linearly.
  //   - headingsScore: recognisable section headings (SKILLS, EXPERIENCE,
  //     ...) were actually found. A resume with no located headings was
  //     probably not segmented correctly even if text did come out; ~4
  //     recognised sections (the common Summary/Skills/Experience/Education
  //     shape) earns full credit.
  //   - lineShapeScore: the average reconstructed line lands in a plausible
  //     character-count band. Lines far shorter than that mean fragmented
  //     reconstruction (glyphs that never got joined); lines far longer
  //     mean unrelated content got welded onto one line (columns
  //     interleaved, or wrapped text wrongly merged).
  //   - a flat deduction when a second column was detected at all. Even
  //     handled correctly HERE, multi-column layout is the classic ATS
  //     failure mode (see the "Two-column header" fault above) - a real
  //     signal about whether this file is broadly readable, not just about
  //     this parser's own confidence.
  // None of these floor or saturate a resume outside of its genuine
  // extremes: a resume with real, well-formed single-column content can
  // reach 100, and one with barely any recognisable structure can fall to
  // single digits, which the old formula could never do.
  const TEXT_PER_PAGE_TARGET = 900; // chars/page; a normal dense page's worth of prose
  const HEADINGS_TARGET = 4; // typical resume section count (Summary/Skills/Experience/Education)
  const LINE_LEN_LOW = 20, LINE_LEN_HIGH = 100; // plausible band for a line's average length, in chars
  const LINE_LEN_TOLERANCE = 60; // chars beyond the band before this signal bottoms out at 0
  const MULTI_COLUMN_PENALTY = 20; // flat deduction, applied on top of the continuous signals - not a floor

  const bandScore = (value, lo, hi, tolerance) => {
    if (value >= lo && value <= hi) return 100;
    const dist = value < lo ? lo - value : value - hi;
    return Math.max(0, 100 - (dist / tolerance) * 100);
  };

  let parseScore = 0;
  if (body.length) {
    const totalChars = body.reduce((n, l) => n + l.text.length, 0);
    const textPerPageScore = Math.min(100, (totalChars / pages / TEXT_PER_PAGE_TARGET) * 100);
    const headingsCount = body.filter((l) => isHeading(l, bodyHeight)).length;
    const headingsScore = Math.min(100, (headingsCount / HEADINGS_TARGET) * 100);
    const avgLineLen = totalChars / body.length;
    const lineShapeScore = bandScore(avgLineLen, LINE_LEN_LOW, LINE_LEN_HIGH, LINE_LEN_TOLERANCE);
    const hasMultiColumn = col1Lines.length > 0;
    const composite = textPerPageScore * 0.3 + headingsScore * 0.35 + lineShapeScore * 0.35;
    parseScore = Math.round(Math.max(0, composite - (hasMultiColumn ? MULTI_COLUMN_PENALTY : 0)));
  }

  // Format score starts clean and pays for each fault by severity.
  const formatScore = Math.max(0, 100 - faults.reduce((n, f) => n + SEVERITY_COST[f.sev], 0));

  // The real ratio behind the "no measurable outcomes" fault, exposed so
  // score.mjs can derive Impact from actual bullet content instead of the
  // AI's capped, count-only `impact` list (see score.mjs's impactScore).
  return {
    parseScore, formatScore, faults,
    weakBullets: vague.length,
    totalBullets: bulletUnits.length,
  };
}
