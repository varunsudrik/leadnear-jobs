// The switchable demo layer for the C Home screen.
//
// The design shows a fit badge on each card, a violet fit banner in the
// preview pane, a "best fit" sort and a used-scan quota. All four need a
// resume-scoring subsystem that does not exist. This module supplies static
// stand-ins so the page matches the mock 1:1, and switches all of them off
// together when the real thing lands:
//
//   NEXT_PUBLIC_DEMO_FIT=false
//
// With it off, fitFor() and bannerFor() return null, badges and banner render
// nothing, "Sort: best fit" goes back to disabled, and the pips return to
// signed-in-only — without touching a single component. NEXT_PUBLIC_ values
// are inlined into the client bundle at build time, so set it BEFORE
// `npm run build`; see .env.example.
//
// WHAT THIS SWITCH DOES NOT COVER. This file used to claim "every fabricated
// value on the C Home screen lives here and nowhere else", which was not
// true. Two things are fabricated and deliberately outside the switch:
//
//   - components/HomeHero.jsx hard-codes the resume-upload pitch — "PDF or
//     DOCX, up to 5 MB. Three free scans, no card. Your resume is never
//     shared with employers." and "3 free scans · no card". Those are product
//     claims about a feature that does not exist, and they are the page's
//     <h1> and its subtitle. With NEXT_PUBLIC_DEMO_FIT=false the page still
//     advertises resume scoring as its headline; the switch turns off the
//     fit *values*, not the hero's premise. Retiring the hero is a design
//     decision, not a flag.
//   - components/AuthNav.jsx renders the pip quota. The count of used scans
//     comes from DEMO_SCANS_USED here, but the quota itself (3) is DEMO_QUOTA
//     below rather than a literal in that component.
export const DEMO_FIT = process.env.NEXT_PUBLIC_DEMO_FIT !== "false";

// The mock's own default (spec line 469: scansUsed range editor, default 2).
export const DEMO_SCANS_USED = 2;

// The free-scan quota the pips count against (spec line 57, "1/3 free scans").
// Exported so components/AuthNav.jsx reads the same number it subtracts from
// rather than hardcoding a 3 beside DEMO_SCANS_USED.
export const DEMO_QUOTA = 3;

export const FIT_LABEL = { strong: "Strong fit", good: "Good fit", low: "Low fit" };

// Sort order for "Sort: best fit". Unscored jobs sort last — see fitRank().
export const FIT_RANK = { strong: 0, good: 1, low: 2 };

// Ten slots in the mock's own proportion: 2 strong, 2 good, 6 low, in the
// order the design's ten job fixtures appear (spec lines 481-490).
export const TIER_BY_SLOT = [
  "strong", "low", "low", "low", "good",
  "low", "strong", "low", "low", "good",
];

// FNV-1a, 32-bit. Chosen for three properties the demo needs:
//   deterministic  — the same job keeps its badge across renders and pages;
//   pure of state  — no Date, no Math.random, so server and client agree and
//                    React does not report a hydration mismatch;
//   well spread    — adjacent slugs land in different slots, so the list
//                    shows a mix rather than runs of one tier.
function hash(value) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function fitFor(jobSlug) {
  if (!DEMO_FIT) return null;
  if (typeof jobSlug !== "string" || jobSlug === "") return null;
  return TIER_BY_SLOT[hash(jobSlug) % TIER_BY_SLOT.length];
}

// Sort key for "Sort: best fit". Anything unscored sorts after every scored
// tier rather than jumping to the top of the list.
export function fitRank(jobSlug) {
  const rank = FIT_RANK[fitFor(jobSlug)];
  return rank === undefined ? Number.MAX_SAFE_INTEGER : rank;
}

// Wording follows the mock's register — short, declarative, no hedging — but
// deliberately NOT its literal strings for `strong` and `good`.
//
// The mock's copy names technologies ("Matches Go, PostgreSQL, gRPC and 6+
// years. Missing Kubernetes.") and a "core stack". It was authored against
// ten fixtures, nine of them engineering roles. The real corpus is not that:
// components/Filters.jsx offers Sales, Marketing, People & HR, Customer
// Success, Design and Operations, so roughly one previewed job in five would
// be a Senior Recruiter or an Account Executive under a banner claiming a Go
// and gRPC match. components/JobCard.jsx already refuses to show a fabricated
// "Low fit" because it "would read as a judgement of the job"; naming a stack
// a nursing or sales posting never mentioned is a louder version of the same
// mistake — it is a fabricated claim about the *posting*, not just about the
// reader. So these two lines say only what stays true whatever the posting
// is. Scores, tier labels and the pill are the mock's, unchanged.
//
// `low` is the design's own line and is already domain-neutral; it is kept
// verbatim.
const BANNERS = {
  strong: { label: FIT_LABEL.strong, score: 81, copy: "Strong overlap with this posting's stated requirements." },
  good:   { label: FIT_LABEL.good,   score: 64, copy: "Partial overlap with this posting's stated requirements." },
  low:    { label: FIT_LABEL.low,    score: 38, copy: "Little overlap with this posting's requirements." },
};

export function bannerFor(tier) {
  if (!DEMO_FIT) return null;
  return BANNERS[tier] ?? null;
}
