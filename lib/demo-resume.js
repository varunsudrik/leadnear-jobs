// Every fabricated value on the Resume scan screen, plus the one line the
// Matches screen borrows from it (matchesSubtitle). Transcribed verbatim from
// the design's state script (docs/superpowers/specs/direction-c.html, the
// scoreParts and issues arrays) and its C Resume ATS markup.
//
// Nothing here is computed and nothing is real: no resume is parsed, no
// posting corpus is consulted. NEXT_PUBLIC_DEMO_FIT=false empties the whole
// screen — see resumeScan() below.
import { DEMO_FIT } from "./demo-fit.js";

export const SEVERITIES = ["High", "Medium", "Low"];

const SCAN = {
  filename: "arjun-mehta-resume.pdf",
  pages: 2,
  scannedAt: "today 14:02",
  durationSeconds: 18,
  // How long ago /matches claims the cohort was last ranked. Only that screen
  // shows it; it lives here so the subtitle it appears in is assembled in one
  // place — see matchesSubtitle() below.
  refreshedAgo: "2h ago",
};

const SCORE = 72;

// Colours are the design's own, not tokens: each bar is coloured by how good
// its number is, so they do not map onto the semantic palette.
const SCORE_PARTS = [
  { label: "Parse",    value: 96, color: "#12876b" },
  { label: "Keywords", value: 64, color: "#d98324" },
  { label: "Format",   value: 78, color: "#5b4ef0" },
  { label: "Impact",   value: 58, color: "#d98324" },
];

const ISSUES = [
  { sev: "High",   issue: "Kubernetes not mentioned (71% of target postings)", fix: "add to Skills and one Northwind bullet",              impact: "+6" },
  { sev: "High",   issue: "No measurable outcomes in 6 of 11 bullets",         fix: "add a number: latency, throughput, cost, team size",  impact: "+5" },
  { sev: "Medium", issue: "Two-column header",                                 fix: "some parsers read columns out of order; use one column", impact: "+3" },
  { sev: "Medium", issue: "Skills written as a paragraph",                     fix: "comma-separated list so each term is indexed",        impact: "+2" },
  { sev: "Low",    issue: "'Present' used in two roles",                       fix: "fine for humans; add start months for consistency",   impact: "+1" },
];

const KEYWORDS_FOUND = ["Go", "PostgreSQL", "gRPC", "AWS", "Terraform", "REST", "CI/CD", "Redis", "Microservices"];

const KEYWORDS_MISSING = [
  { term: "Kubernetes",    share: 71 },
  { term: "Kafka",         share: 58 },
  { term: "Observability", share: 54 },
  { term: "Mentoring",     share: 52 },
];

// The title the scan was run against. Split out of SCORED_AGAINST[0] because
// /matches names it on its own, without the posting count — see
// matchesSubtitle().
const TARGET_TITLE = "Senior Backend Engineer";

const SCORED_AGAINST = [
  `${TARGET_TITLE} · 214 postings`,
  "Staff Engineer · 88 postings",
  "Platform Engineer · 161 postings",
];

const HEADLINE = "Passes most ATS filters. Keyword coverage is the drag.";
const SUBLINE = "Four terms that appear in over half of Senior Backend postings are missing. Clearing the two High items is worth about +11.";

// The line under the "N matches" heading on /matches. It is here, not in
// app/matches/page.jsx, because all three of its values are this module's:
// the filename is SCAN.filename and the title is SCORED_AGAINST[0]'s. Inlined
// on that page they were a second, silent copy — editing the fixture would
// have left the two screens disagreeing about which resume had been scanned.
export function matchesSubtitle() {
  if (!DEMO_FIT) return null;
  return `from ${SCAN.filename} · ${TARGET_TITLE} · refreshed ${SCAN.refreshedAgo}`;
}

export function resumeScan() {
  if (!DEMO_FIT) return null;
  return {
    scan: SCAN,
    score: SCORE,
    parts: SCORE_PARTS,
    issues: ISSUES,
    found: KEYWORDS_FOUND,
    missing: KEYWORDS_MISSING,
    scoredAgainst: SCORED_AGAINST,
    headline: HEADLINE,
    subline: SUBLINE,
  };
}
