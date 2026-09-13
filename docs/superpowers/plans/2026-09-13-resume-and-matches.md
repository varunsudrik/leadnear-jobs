# Resume Scan and Matches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two screens the header's `1/3 free scans` control and a new `Matches` nav item lead to — as frontend only, with hardcoded ATS values over real job rows.

**Architecture:** Two new routes, both `noindex` and `force-dynamic`. Every fabricated value lives in `lib/demo-resume.js` or `lib/demo-fit.js` behind the existing `NEXT_PUBLIC_DEMO_FIT` switch. Matches queries a bounded cohort of real jobs and buckets them with the same `fitFor()` hash the home page already uses, so a job's tier is identical on both screens. Bucketing is a pure, tested function; the database query is thin.

**Tech Stack:** Next.js 15 (App Router), plain CSS with custom properties, Tailwind 3 (preflight disabled, utilities only), `next/font`, PostgreSQL via `lib/db.js`, Node `assert/strict` test scripts.

**Spec:** `docs/superpowers/specs/2026-09-13-resume-and-matches-design.md`. The design markup it argues from is `docs/superpowers/specs/direction-c.html` — `C Resume ATS` at lines 195–252, `C Matches` at 253–304, the phone frames inside `C Mobile` at ~430–462, and the fixtures in the state script at 466–557. Read both.

## Global Constraints

- **Exact design values, copied verbatim from the spec HTML.** Tokens already on `:root` are used rather than re-typed hex: `--accent` `#5b4ef0`, `--accent-hover` `#4a3ee0`, `--accent-tint` `#ecebff`, `--text` `#15171c`, `--text2` `#3d3f4a`, `--text3` `#6b6d78`, `--text4` `#9a9aa4`, `--bg` `#ffffff`, `--bg2` `#f4f4f6`, `--bg3` `#f0f0f3`, `--border` `#eaeaef`, `--ok-bg` `#e7f6f1`, `--ok-fg` `#0e6e57`, `--warn-bg` `#fdf4e3`, `--warn-fg` `#8a5b0a`, `--bad-bg` `#fdeeea`, `--bad-fg` `#a8341a`, `--radius` `18px`, `--radius-sm` `10px`, `--radius-pill` `999px`.
- **Every numeric is IBM Plex Mono** — scores, counts, percentages, salaries, impact figures. Apply via `var(--font-mono)` or the existing `.mono` class. Structural, not decorative.
- **Placeholder controls** take `aria-disabled="true"`, a `title`, `cursor: default` is NOT used (they respond), and reveal an inline note in an `aria-live="polite"` region on activation — the pattern in `components/HomeHeroCta.jsx`. A genuinely unavailable control (like `Hide applied`) takes a real `disabled` attribute instead.
- **Both new routes are `robots: "noindex"`** and must not appear in `app/sitemap.js`.
- **Do not add breakpoints for `.jobs-layout` / `.job-preview`.** `--preview-breakpoint` on `:root` is their single source, and `lib/previewBreakpoint.js` reads it at runtime.
- **Tailwind preflight stays disabled.** Read `AGENTS.md` before touching `tailwind.config.js` or `app/tailwind.css`.
- **Never run `npm run build` while `next dev` is running.** Both write `.next`; the collision surfaces as a misleading `Cannot find module './chunks/…'`.
- **Test convention:** plain `node scripts/test-*.mjs` using `node:assert/strict`, registered in `package.json`. There is no Jest or Vitest and this plan adds none. If node warns `MODULE_TYPELESS_PACKAGE_JSON`, ignore it.
- The app's **basePath is `/jobs`** (`next.config.mjs:7`). Routes live at `/jobs/resume` and `/jobs/matches`; `app/resume/page.jsx` and `app/matches/page.jsx` are the files.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` on its own line after a blank line.

## File Structure

| File | Responsibility |
|---|---|
| `lib/demo-resume.js` *(create)* | Every fabricated ATS value: scan metadata, score, dimensions, fixes, keywords, cohort options. Behind `DEMO_FIT`. |
| `lib/demo-fit.js` *(modify)* | Gains `whyFor(tier)` beside the existing `bannerFor(tier)`. |
| `lib/match-buckets.js` *(create)* | Pure: turns a job array into `{ strong, good, low, counts }`. No DB, no React — the one piece with real logic, so the one piece with a real unit test. |
| `lib/jobs.js` *(modify)* | Adds `getMatchCohort({ limit, remote, salaryListed })`. Thin query; the logic is in `match-buckets`. |
| `app/resume/page.jsx` *(create)* | Route, metadata + noindex. Renders `<ResumeScan />`. |
| `app/matches/page.jsx` *(create)* | Route, metadata + noindex, cohort query, filter params. Renders `<MatchBuckets />`. |
| `components/ResumeScan.jsx` *(create)* | The whole ATS result view. Client, for the fixes checkboxes. |
| `components/MatchBuckets.jsx` *(create)* | Bucket columns, `Show N more`, phone tabs. Client. |
| `components/ScanPips.jsx` *(create)* | The three-dot quota indicator, rendered in both the site header and the resume page header. Presentational. |
| `components/InertButton.jsx` *(create)* | A placeholder control that answers on press. Used by `Upload revised`, `+ Queue` and `Queue all N`. Client. |
| `components/DemoOffPanel.jsx` *(create)* | What both routes render when `DEMO_FIT` is off. |
| `app/layout.jsx` *(modify)* | Footer gains a `Resume scan` link. |
| `components/SiteNavbar.jsx` *(modify)* | `Matches` in the desktop nav; `Resume scan` + `Matches` in the mobile panel. |
| `components/AuthNav.jsx` *(modify)* | Pips become a `Link`. |
| `components/HomeHeroCta.jsx` *(modify)* | CTAs link when `DEMO_FIT` is on, keep the note when off. |
| `app/globals.css` *(modify)* | Both screens' CSS; `.home-shell` → `.console-shell`. |
| `app/page.jsx` *(modify)* | Shell class rename. |
| `scripts/test-demo-resume.mjs` *(create)* | Fixture shape and switch-off behaviour. |
| `scripts/test-match-buckets.mjs` *(create)* | Bucketing, counts, and that Low carries no actions. |
| `scripts/test-home-spec.mjs` *(modify)* | CSS assertions for the new screens. |

---

## Task 1: Rename the page shell

**Files:**
- Modify: `app/globals.css`, `app/page.jsx`, `scripts/test-home-spec.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `.console-shell` — the `max-width:1440px; padding:8px 24px 56px` wrapper that Tasks 4 and 5 both use.

`.home-shell` is named for the home page but the design gives `C Resume ATS` and `C Matches` the identical section box. Reusing a home-named class on two other routes is misleading, so it is renamed once, before anything depends on it.

- [ ] **Step 1: Update the assertions first**

In `scripts/test-home-spec.mjs`, change every `.home-shell` reference to `.console-shell`. There are two kinds — the `decl()` calls near the top:

```js
decl(".console-shell", "max-width: 1440px");
decl(".console-shell", "padding: 8px 24px 56px");
```

and the needle inside the phone-block list, which currently reads `".home-shell .filter-bar"`:

```js
  ".console-shell .filter-bar", // the strip must be scoped, not global
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run home-spec:test`
Expected: FAIL — `missing rule: .console-shell`

- [ ] **Step 3: Rename in the stylesheet and the page**

In `app/globals.css`, rename the base rule and every `.home-shell`-scoped selector in the 640px phone block (`.home-shell .filter-bar`, `.home-shell .filter-count`, `.home-shell .filter-toggle`, `.home-shell .filter-select`, `.home-shell .filter-clear`, `.home-shell .sort-select`, `.home-shell .filter-spacer`, and the `::-webkit-scrollbar` rule). Find them all first:

```bash
grep -n "home-shell" app/globals.css
```

In `app/page.jsx`, change `<div className="home-shell">` to `<div className="console-shell">`.

Then confirm nothing else referenced the old name:

```bash
grep -rn "home-shell" app components scripts
```

Expected: no output.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run home-spec:test
npm run demo-fit:test
```

Expected: `home spec ok`, `demo-fit ok`

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/page.jsx scripts/test-home-spec.mjs
git commit -m "refactor(css): rename .home-shell to .console-shell

Two more routes are about to use the same section box, and a
home-named class on /resume and /matches would misdescribe them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Resume fixtures and match copy

**Files:**
- Create: `lib/demo-resume.js`, `scripts/test-demo-resume.mjs`
- Modify: `lib/demo-fit.js`, `package.json`

**Interfaces:**
- Consumes: `DEMO_FIT` from `lib/demo-fit.js`.
- Produces, relied on by Tasks 4, 5 and 8:
  - `resumeScan(): { scan, score, parts, issues, found, missing, scoredAgainst, headline, subline } | null` — `null` when the demo layer is off.
  - `SEVERITIES: ["High", "Medium", "Low"]`
  - `whyFor(tier: string): string | null` from `lib/demo-fit.js`.

Every value below is transcribed from the design's state script (`docs/superpowers/specs/direction-c.html`, lines ~530–545) and its `C Resume ATS` markup. Do not paraphrase the copy.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-demo-resume.mjs`:

```js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resumeScan, SEVERITIES } from "../lib/demo-resume.js";
import { whyFor } from "../lib/demo-fit.js";

const s = resumeScan();
assert.ok(s, "resumeScan() should return a payload while the demo layer is on");

// Header metadata drives "arjun-mehta-resume.pdf · 2 pages · scanned today 14:02 in 18s".
assert.equal(s.scan.filename, "arjun-mehta-resume.pdf");
assert.equal(s.scan.pages, 2);
assert.equal(typeof s.scan.scannedAt, "string");
assert.equal(s.scan.durationSeconds, 18);

// The headline score and the donut both read this one number.
assert.equal(s.score, 72);

// Four dimensions, each 0-100, each with a bar colour.
assert.equal(s.parts.length, 4);
assert.deepEqual(s.parts.map((p) => p.label), ["Parse", "Keywords", "Format", "Impact"]);
for (const p of s.parts) {
  assert.ok(Number.isInteger(p.value) && p.value >= 0 && p.value <= 100, `${p.label} out of range`);
  assert.match(p.color, /^#[0-9a-f]{6}$/i, `${p.label} needs a bar colour`);
}

// Five fixes. The header renders "Fixes · 5 open" from this length, so a
// sixth entry would silently contradict the heading unless it is derived.
assert.equal(s.issues.length, 5);
for (const i of s.issues) {
  assert.ok(SEVERITIES.includes(i.sev), `unknown severity ${i.sev}`);
  assert.ok(i.issue.length > 0 && i.fix.length > 0);
  assert.match(i.impact, /^\+\d+$/, "impact reads as +N");
}

// Keyword chips.
assert.equal(s.found.length, 9);
assert.equal(s.missing.length, 4);
for (const m of s.missing) {
  assert.ok(m.term.length > 0);
  assert.ok(Number.isInteger(m.share) && m.share > 0 && m.share <= 100, `${m.term} share out of range`);
}

// The "Scored against" select.
assert.equal(s.scoredAgainst.length, 3);

// Match copy is domain-neutral: this corpus spans Sales, HR and Design, so a
// "why" naming specific technologies would be nonsense on most rows.
for (const tier of ["strong", "good", "low"]) {
  const why = whyFor(tier);
  assert.equal(typeof why, "string");
  assert.ok(why.length > 0);
  for (const tech of ["Go", "Kubernetes", "PostgreSQL", "gRPC", "Kafka"]) {
    assert.ok(!why.includes(tech), `whyFor(${tier}) must not name ${tech}`);
  }
}
assert.equal(whyFor("nonsense"), null);

// Switch off: a fresh process, not a cache-busted import. `?off` yields a new
// instance of the module you name, but its static imports resolve without
// the query and reuse the cached graph — so demo-fit.js would still report
// DEMO_FIT=true and this assertion would pass for the wrong reason. Only a
// new process re-evaluates the whole graph, which is also how the switch
// really behaves: NEXT_PUBLIC_ variables are fixed at process and build time.
const resumeUrl = new URL("../lib/demo-resume.js", import.meta.url).href;
const fitUrl = new URL("../lib/demo-fit.js", import.meta.url).href;
const out = execFileSync(
  process.execPath,
  ["--input-type=module", "-e",
   `const { resumeScan } = await import(${JSON.stringify(resumeUrl)});
    const { whyFor } = await import(${JSON.stringify(fitUrl)});
    console.log(JSON.stringify({ scan: resumeScan(), why: whyFor("strong") }));`],
  { env: { ...process.env, NEXT_PUBLIC_DEMO_FIT: "false" }, encoding: "utf8" }
);
const off = JSON.parse(out);
assert.equal(off.scan, null);
assert.equal(off.why, null);

console.log("demo-resume ok");
```

Note: the off-path spawns a real subprocess rather than a cache-busted
`?off` import, because a static `import { DEMO_FIT } from "./demo-fit.js"`
resolves via ordinary relative-URL merge, which drops the query string —
so a cache-busted `demo-resume.js` would still import the already-cached
`demo-fit.js` with `DEMO_FIT` frozen at `true`, and the assertion below
would fail. Only a fresh process re-evaluates the whole module graph.

- [ ] **Step 2: Register and run it to verify it fails**

Add to `package.json` under `scripts`, after `"home-spec:test"`:

```json
"demo-resume:test": "node scripts/test-demo-resume.mjs",
```

Run: `npm run demo-resume:test`
Expected: FAIL — `Cannot find module .../lib/demo-resume.js`

- [ ] **Step 3: Add `whyFor` to the demo-fit module**

In `lib/demo-fit.js`, beside the existing `BANNERS` block:

```js
// Why a job landed in its bucket. Domain-neutral for the same reason the
// banner copy is: this corpus spans Sales, Marketing, People & HR, Customer
// Success, Design and Operations, so a line naming Go and Kubernetes would be
// nonsense on most rows.
const WHY = {
  strong: "Strong overlap with this posting's stated requirements.",
  good: "Covers most of what this posting asks for; some requirements aren't evidenced.",
  low: "Little overlap with this posting's requirements.",
};

export function whyFor(tier) {
  if (!DEMO_FIT) return null;
  return WHY[tier] ?? null;
}
```

- [ ] **Step 4: Write the fixtures module**

Create `lib/demo-resume.js`:

```js
// Every fabricated value on the Resume scan screen. Transcribed verbatim from
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

const SCORED_AGAINST = [
  "Senior Backend Engineer · 214 postings",
  "Staff Engineer · 88 postings",
  "Platform Engineer · 161 postings",
];

const HEADLINE = "Passes most ATS filters. Keyword coverage is the drag.";
const SUBLINE = "Four terms that appear in over half of Senior Backend postings are missing. Clearing the two High items is worth about +11.";

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
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run demo-resume:test
npm run demo-fit:test
```

Expected: `demo-resume ok`, `demo-fit ok`

- [ ] **Step 6: Commit**

```bash
git add lib/demo-resume.js lib/demo-fit.js scripts/test-demo-resume.mjs package.json
git commit -m "feat(resume): ATS fixtures and tier-keyed match copy

Both behind the existing NEXT_PUBLIC_DEMO_FIT switch. The why strings
are domain-neutral because the corpus is not an engineering board.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Cohort query and bucketing

**Files:**
- Create: `lib/match-buckets.js`, `scripts/test-match-buckets.mjs`
- Modify: `lib/jobs.js`, `package.json`

**Interfaces:**
- Consumes: `fitFor`, `whyFor` from `lib/demo-fit.js` (Task 2); `query` and `attachLocations`, both already in `lib/jobs.js`.
- Produces, relied on by Task 5:
  - `bucketJobs(jobs): { strong: Row[], good: Row[], low: Row[], counts: { strong, good, low, total } }` where `Row` is the job object with `tier` and `why` attached.
  - `getMatchCohort({ limit = 214, remote = false, salaryListed = false }): Promise<Job[]>`

The split matters: the query is three lines of SQL with nothing to assert, while the bucketing is the only real logic on either screen. Putting bucketing in its own pure module makes it unit-testable without a database.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-match-buckets.mjs`:

```js
import assert from "node:assert/strict";
import { bucketJobs } from "../lib/match-buckets.js";
import { fitFor } from "../lib/demo-fit.js";

// Enough slugs that all three tiers appear; fitFor spreads ~20/20/60.
const jobs = Array.from({ length: 120 }, (_, i) => ({
  db_id: i,
  job_slug: `job-${i}`,
  title: `Role ${i}`,
  company: `Company ${i}`,
}));

const b = bucketJobs(jobs);

// Every job lands in exactly one bucket, and nothing is invented or dropped.
assert.equal(b.strong.length + b.good.length + b.low.length, jobs.length);
assert.equal(b.counts.total, jobs.length);
assert.equal(b.counts.strong, b.strong.length);
assert.equal(b.counts.good, b.good.length);
assert.equal(b.counts.low, b.low.length);
assert.ok(b.counts.strong > 0 && b.counts.good > 0 && b.counts.low > 0, "all three tiers should be represented");

// Placement agrees with fitFor — the same hash the job card uses, so a job
// badged "Strong fit" on the home page cannot appear under Good here.
for (const row of b.strong) assert.equal(fitFor(row.job_slug), "strong");
for (const row of b.good)   assert.equal(fitFor(row.job_slug), "good");
for (const row of b.low)    assert.equal(fitFor(row.job_slug), "low");

// Each row carries its tier and its explanation, so the view does no lookup.
for (const row of [...b.strong, ...b.good, ...b.low]) {
  assert.ok(["strong", "good", "low"].includes(row.tier));
  assert.equal(typeof row.why, "string");
  assert.ok(row.why.length > 0);
}

// Order within a bucket follows the input order, so "newest first" survives.
const strongSlugs = b.strong.map((r) => r.job_slug);
assert.deepEqual(strongSlugs, [...strongSlugs].sort(
  (a, x) => jobs.findIndex((j) => j.job_slug === a) - jobs.findIndex((j) => j.job_slug === x)
));

// An empty cohort buckets cleanly rather than throwing — /matches renders an
// empty state from these zeros.
const empty = bucketJobs([]);
assert.deepEqual(empty.counts, { strong: 0, good: 0, low: 0, total: 0 });
assert.deepEqual(empty.strong, []);

// A job with no slug cannot be tiered; it must be dropped, not defaulted into
// Low, which would read as a judgement of the job.
const unslugged = bucketJobs([{ db_id: 1, job_slug: "" }]);
assert.equal(unslugged.counts.total, 0);

console.log("match-buckets ok");
```

- [ ] **Step 2: Register and run it to verify it fails**

Add to `package.json`:

```json
"match-buckets:test": "node scripts/test-match-buckets.mjs",
```

Run: `npm run match-buckets:test`
Expected: FAIL — `Cannot find module .../lib/match-buckets.js`

- [ ] **Step 3: Write the bucketing module**

Create `lib/match-buckets.js`:

```js
// Turns a cohort of real jobs into the three buckets the Matches screen draws.
//
// Pure on purpose: no database, no React, no environment. The tier comes from
// the same fitFor() hash components/JobCard.jsx uses, so a job's bucket here
// always agrees with its badge on the home page.
import { fitFor, whyFor } from "./demo-fit.js";

export function bucketJobs(jobs) {
  const strong = [];
  const good = [];
  const low = [];
  const byTier = { strong, good, low };

  for (const job of jobs ?? []) {
    const tier = fitFor(job.job_slug);
    // No tier means no slug to hash, or the demo layer is off. Drop the row
    // rather than defaulting it into Low — an invented "low fit" reads as a
    // judgement of the job.
    if (!tier) continue;
    byTier[tier].push({ ...job, tier, why: whyFor(tier) });
  }

  return {
    strong,
    good,
    low,
    counts: { strong: strong.length, good: good.length, low: low.length,
              total: strong.length + good.length + low.length },
  };
}
```

- [ ] **Step 4: Add the cohort query**

In `lib/jobs.js`, directly after `searchJobs` ends, add:

```js
// The Matches screen needs one bounded set of rows to bucket, and searchJobs
// caps at PAGE_SIZE (20). This is that query: newest active jobs, same column
// shape, and attachLocations applied exactly as searchJobs does — without it
// every match row renders with no location.
//
// The default of 214 is the mock's number. The cohort is arbitrary but real,
// so the counts the screen shows are true of what is on it.
export async function getMatchCohort({ limit = 214, remote = false, salaryListed = false } = {}) {
  const conds = ["j.status = 'success'"];
  if (remote) conds.push("j.remote = 1");
  // Same column searchJobs' salary_min filter uses, so the two agree.
  if (salaryListed) conds.push("j.salary_annual_usd IS NOT NULL");

  const safeLimit = Math.min(Math.max(1, Number(limit) || 214), 500);
  const jobs = await query(
    // apply_url_md5 is not displayed, but attachLocations joins job_locations
    // on it — omit the column and every row comes back with no locations at
    // all, silently, because attachLocations returns the jobs untouched when
    // it finds no md5s.
    `SELECT j.db_id, j.job_slug, j.apply_url_md5, j.title, j.company, j.company_slug,
            j.employment_type, j.remote, j.salary_min, j.salary_max,
            j.salary_currency, j.salary_period, j.posted_at
     FROM jobs j WHERE ${conds.join(" AND ")}
     ORDER BY j.posted_at DESC
     LIMIT ${safeLimit}`
  );
  return attachLocations(jobs);
}
```

`limit` is clamped and coerced rather than interpolated raw — it reaches this function from a URL in Task 5.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run match-buckets:test
npm run demo-resume:test
npm run demo-fit:test
```

Expected: `match-buckets ok`, `demo-resume ok`, `demo-fit ok`

- [ ] **Step 6: Verify the query against the live database**

The database has 5,000 active jobs. Confirm the query returns rows with locations attached:

```bash
node -e "
import('./lib/load-env.mjs').then(async () => {
  const { getMatchCohort } = await import('./lib/jobs.js');
  const rows = await getMatchCohort({ limit: 5 });
  console.log('rows:', rows.length);
  console.log('carries apply_url_md5:', rows.every(r => !!r.apply_url_md5));
  console.log('any row with locations:', rows.some(r => Array.isArray(r.locations) && r.locations.length));
  console.log('sample:', rows[0]?.title, '|', rows[0]?.company, '|', rows[0]?.locations);
  process.exit(0);
});
"
```

Expected: 5 rows, `carries apply_url_md5: true`, `any row with locations: true`, and a real title/company.

`attachLocations` returns the array **unchanged** when it finds no md5s, so a missing `apply_url_md5` column produces no error and no locations — which is why this step checks the column itself rather than only the result.

- [ ] **Step 7: Commit**

```bash
git add lib/match-buckets.js lib/jobs.js scripts/test-match-buckets.mjs package.json
git commit -m "feat(matches): cohort query and pure bucketing

Bucketing is split out as a pure function so the only real logic on
either new screen has a unit test that needs no database.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The Resume scan screen

**Files:**
- Create: `app/resume/page.jsx`, `components/ResumeScan.jsx`, `components/ScanPips.jsx`, `components/InertButton.jsx`
- Modify: `app/globals.css`, `scripts/test-home-spec.mjs`

**Interfaces:**
- Consumes: `resumeScan()` from `lib/demo-resume.js`; `DEMO_SCANS_USED`, `DEMO_QUOTA` from `lib/demo-fit.js` (both Task 2); `.console-shell` (Task 1).
- Produces, relied on by Tasks 5, 6 and 8:
  - `<ScanPips used={number} quota={number} />` — the three-dot quota indicator plus its "N/3 free scans" label, presentational only. Extracted because it now renders in two places; `components/AuthNav.jsx` currently inlines this markup and Task 6 switches it over.
  - `<InertButton className={string} note={string}>{children}</InertButton>` — a placeholder control that reveals `note` in an `aria-live` region on activation. Task 5 uses it for `+ Queue` and `Queue all N`.

Spec: `docs/superpowers/specs/direction-c.html` lines 195–252. Read them before starting — every number below comes from there.

- [ ] **Step 1: Write the failing CSS assertions**

Add to `scripts/test-home-spec.mjs`, before the dead-rule loop:

```js
// ─── Resume scan (spec 195-252) ───
decl(".rs-title", "font-size: 22px");
decl(".rs-body", "grid-template-columns: minmax(250px,1fr) minmax(0,2.2fr)");
decl(".rs-preview", "aspect-ratio: 8.5/11");
decl(".rs-score", "padding: 24px");
decl(".rs-score", "gap: 32px");
decl(".rs-donut", "width: 132px");
decl(".rs-donut-inner", "width: 106px");
decl(".rs-donut-score", "font-size: 38px");
decl(".rs-parts", "grid-template-columns: repeat(4,1fr)");
decl(".rs-track", "height: 5px");
decl(".rs-fix", "grid-template-columns: 18px 70px minmax(0,1fr) 44px");
decl(".rs-fix", "padding: 13px 18px");
decl(".rs-sev.high", "background: var(--bad-bg)");
decl(".rs-sev.medium", "background: var(--warn-bg)");
decl(".rs-sev.low", "background: var(--bg2)");
decl(".rs-keywords", "grid-template-columns: 1fr 1fr");
decl(".rs-chip.found", "background: var(--ok-bg)");
decl(".rs-chip.missing", "background: var(--bad-bg)");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run home-spec:test`
Expected: FAIL — `missing rule: .rs-title`

- [ ] **Step 3: Write the two small shared components**

Create `components/ScanPips.jsx` — presentational, no link, no state, so it works inside a `Link` (Task 6) or bare:

```jsx
// The three-dot scan quota. Rendered in the site header (inside a link) and
// again in the Resume scan page header (bare), so it lives here rather than
// being inlined twice.
export default function ScanPips({ used, quota }) {
  return (
    <span className="scan-pips">
      <span className="pips" aria-hidden="true">
        {Array.from({ length: quota }, (_, i) => (
          <span key={i} className={i < used ? "pip used" : "pip"} />
        ))}
      </span>
      <span className="mono">{quota - used}</span>/{quota} free scans
    </span>
  );
}
```

Create `components/InertButton.jsx`:

```jsx
"use client";
import { useState } from "react";

// A control the design draws but the product cannot perform yet. It looks and
// measures exactly like a live button and answers on activation, because a
// `title` alone is invisible on touch and these are often the only call to
// action on a phone. The note sits in a live region so it is announced once,
// on press, rather than on every render.
export default function InertButton({ className, note, children }) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <button type="button" className={className} title={note} onClick={() => setShown(true)}>
        {children}
      </button>
      <span className="inert-note" role="status" aria-live="polite">{shown ? note : ""}</span>
    </>
  );
}
```

- [ ] **Step 4: Write the screen**

Create `components/ResumeScan.jsx` — a server component; the checkboxes are uncontrolled, so it ships no JavaScript of its own:

```jsx
import Link from "next/link";
import ScanPips from "@/components/ScanPips";
import InertButton from "@/components/InertButton";

const UPLOAD_NOT_LIVE = "Uploading a revised resume isn't live yet";

export default function ResumeScan({ data, scansUsed, quota }) {
  const { scan, score, parts, issues, found, missing, scoredAgainst, headline, subline } = data;
  const trialExhausted = scansUsed >= quota;

  return (
    <div className="console-shell">
      <div className="rs-head">
        <div className="rs-head-main">
          <h1 className="rs-title">Resume scan</h1>
          <span className="rs-meta">
            {scan.filename} · {scan.pages} pages · scanned {scan.scannedAt} in{" "}
            <span className="mono">{scan.durationSeconds}s</span>
          </span>
        </div>
        <div className="rs-actions">
          <ScanPips used={scansUsed} quota={quota} />
          {/* The design gates this on the trial being spent. At 2 of 3 it never
              renders; the branch stays so the Upgrade plan has its hook. */}
          {trialExhausted ? <span className="rs-upgrade">Unlock unlimited</span> : null}
          <InertButton className="rs-upload" note={UPLOAD_NOT_LIVE}>Upload revised</InertButton>
          <Link href="/matches" className="rs-view-matches">View matches →</Link>
        </div>
      </div>

      <div className="rs-body">
        <div className="rs-col">
          <div className="rs-card">
            <div className="rs-card-head"><span>Preview</span><span className="mono">page 1 / {scan.pages}</span></div>
            {/* The mock draws this placeholder itself — rasterising a PDF and
                mapping issues to page coordinates is a backend job. Shipping
                the design's own grey box is the honest reproduction. */}
            <div className="rs-preview">rendered resume page<br />with flagged regions highlighted</div>
          </div>
          <div className="rs-card">
            <label className="rs-label" htmlFor="scored-against">Scored against</label>
            <select id="scored-against" className="rs-select" defaultValue={scoredAgainst[0]}>
              {scoredAgainst.map((o) => <option key={o}>{o}</option>)}
            </select>
            <div className="rs-caption">Keywords weighted by how often they appear in current postings for this title.</div>
          </div>
        </div>

        <div className="rs-col">
          <div className="rs-score">
            <div
              className="rs-donut"
              aria-hidden="true"
              style={{ background: `conic-gradient(var(--accent) 0 ${score}%, var(--border) ${score}% 100%)` }}
            >
              <div className="rs-donut-inner">
                <span className="rs-donut-score">{score}</span>
                <span className="rs-donut-label">ATS SCORE</span>
              </div>
            </div>
            <div className="rs-score-copy">
              <div className="rs-headline">{headline}</div>
              <div className="rs-subline">{subline}</div>
              <div className="rs-parts">
                {parts.map((p) => (
                  <div key={p.label}>
                    <div className="rs-part-head"><span>{p.label}</span><span className="mono">{p.value}</span></div>
                    <div className="rs-track"><i style={{ width: `${p.value}%`, background: p.color }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rs-fixes">
            <div className="rs-fixes-head"><span>Fixes · {issues.length} open</span><span>Est. impact</span></div>
            {issues.map((i) => (
              <label className="rs-fix" key={i.issue}>
                <input type="checkbox" />
                <span className={`rs-sev ${i.sev.toLowerCase()}`}>{i.sev}</span>
                <span className="rs-fix-text"><b>{i.issue}</b><span> — {i.fix}</span></span>
                <span className="rs-impact">{i.impact}</span>
              </label>
            ))}
          </div>

          <div className="rs-keywords">
            <div className="rs-chip-card">
              <div className="rs-chip-head">Keywords found · {found.length}</div>
              <div className="rs-chips">
                {found.map((k) => <span className="rs-chip found" key={k}>{k}</span>)}
              </div>
            </div>
            <div className="rs-chip-card">
              <div className="rs-chip-head">Missing · {missing.length}</div>
              <div className="rs-chips">
                {missing.map((m) => (
                  <span className="rs-chip missing" key={m.term}>{m.term} · <span className="mono">{m.share}%</span></span>
                ))}
              </div>
              <div className="rs-caption">Share of current postings that mention the term.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Ticking a fix does not decrement the header count, because nothing is tracked — the count is `issues.length`, which is honest.

- [ ] **Step 5: Write the route**

Create `app/resume/page.jsx`:

```jsx
import { resumeScan } from "@/lib/demo-resume";
import { DEMO_SCANS_USED, DEMO_QUOTA } from "@/lib/demo-fit";
import ResumeScan from "@/components/ResumeScan";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Resume scan | LeadNear Jobs",
  description: "ATS score and fixes for your resume.",
  // Every value on this page is demo content. It must never be indexed, and it
  // is deliberately absent from app/sitemap.js for the same reason.
  robots: "noindex",
};

export default function ResumePage() {
  const data = resumeScan();
  // Task 8 replaces this with the honest switched-off panel.
  if (!data) return null;
  return <ResumeScan data={data} scansUsed={DEMO_SCANS_USED} quota={DEMO_QUOTA} />;
}
```

- [ ] **Step 6: Add the CSS**

In `app/globals.css`, add a new block after the job-preview section:

```css
/* ─── Resume scan (Direction C — spec lines 195–252) ─────────────── */
.rs-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.rs-head-main { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.rs-title { font-size: 22px; font-weight: 600; letter-spacing: -.025em; color: var(--text); }
.rs-meta { font-size: 12.5px; color: var(--text3); }
.rs-actions { display: flex; align-items: center; gap: 9px; }
.rs-upgrade { background: var(--accent); color: #fff; border: 0; border-radius: var(--radius-pill); padding: 8px 14px; font-weight: 600; font-size: 12.5px; }
.rs-upload { border: 0; background: var(--bg); box-shadow: 0 0 0 1px rgba(21,23,28,.07); border-radius: var(--radius-pill); padding: 8px 13px; font-weight: 600; font-size: 12.5px; cursor: pointer; color: var(--text2); font-family: inherit; }
.rs-view-matches { background: var(--text); color: #fff; border-radius: var(--radius-pill); padding: 9px 15px; font-weight: 600; font-size: 12.5px; display: inline-block; }
.rs-view-matches:hover { background: var(--accent); color: #fff; }

.rs-body { display: grid; grid-template-columns: minmax(250px,1fr) minmax(0,2.2fr); gap: 16px; align-items: start; }
.rs-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.rs-card { background: var(--bg); border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px; }
.rs-card-head { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text4); margin-bottom: 12px; }
.rs-card-head .mono { letter-spacing: 0; text-transform: none; }
.rs-preview { aspect-ratio: 8.5/11; border-radius: 12px; background: var(--bg2); display: flex; align-items: center; justify-content: center; text-align: center; padding: 20px; font-size: 12px; color: var(--text4); line-height: 1.5; }
.rs-label { display: block; font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text4); margin-bottom: 8px; }
.rs-select { width: 100%; background: var(--bg2); border: 0; border-radius: var(--radius-sm); padding: 10px 12px; font-size: 13.5px; font-weight: 600; color: var(--text); cursor: pointer; font-family: inherit; }
.rs-caption { color: var(--text3); margin-top: 8px; font-size: 12.5px; }

.rs-score { background: var(--bg); border-radius: var(--radius); box-shadow: var(--shadow); padding: 24px; display: grid; grid-template-columns: auto minmax(0,1fr); gap: 32px; align-items: center; }
.rs-donut { position: relative; width: 132px; height: 132px; flex-shrink: 0; border-radius: var(--radius-pill); display: flex; align-items: center; justify-content: center; }
.rs-donut-inner { width: 106px; height: 106px; border-radius: var(--radius-pill); background: var(--bg); display: flex; flex-direction: column; align-items: center; justify-content: center; }
.rs-donut-score { font-family: var(--font-mono), monospace; font-size: 38px; font-weight: 500; letter-spacing: -.03em; line-height: 1; }
.rs-donut-label { font-size: 11px; color: var(--text4); letter-spacing: .04em; }
.rs-score-copy { min-width: 0; }
.rs-headline { font-size: 16px; font-weight: 600; letter-spacing: -.015em; margin-bottom: 4px; }
.rs-subline { color: var(--text3); margin-bottom: 16px; font-size: 13.5px; }
.rs-parts { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; }
.rs-part-head { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text3); margin-bottom: 6px; }
.rs-part-head .mono { color: var(--text); }
.rs-track { height: 5px; background: var(--bg3); border-radius: var(--radius-pill); overflow: hidden; }
.rs-track > i { display: block; height: 100%; border-radius: var(--radius-pill); }

.rs-fixes { background: var(--bg); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
.rs-fixes-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text4); }
.rs-fix { display: grid; grid-template-columns: 18px 70px minmax(0,1fr) 44px; gap: 14px; padding: 13px 18px; border-top: 1px solid var(--bg2); align-items: start; cursor: pointer; }
.rs-fix input { margin-top: 2px; accent-color: var(--accent); width: 15px; height: 15px; }
.rs-sev { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: var(--radius-pill); text-align: center; }
.rs-sev.high { background: var(--bad-bg); color: var(--bad-fg); }
.rs-sev.medium { background: var(--warn-bg); color: var(--warn-fg); }
.rs-sev.low { background: var(--bg2); color: var(--text3); }
.rs-fix-text { font-size: 13.5px; line-height: 1.45; }
.rs-fix-text b { font-weight: 600; }
.rs-fix-text span { color: var(--text3); }
.rs-impact { font-family: var(--font-mono), monospace; font-size: 12.5px; text-align: right; color: #12876b; }

.rs-keywords { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.rs-chip-card { background: var(--bg); border-radius: var(--radius); box-shadow: var(--shadow); padding: 18px; }
.rs-chip-head { font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text4); margin-bottom: 12px; }
.rs-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.rs-chip { padding: 4px 10px; border-radius: var(--radius-pill); font-size: 12.5px; font-weight: 500; }
.rs-chip.found { background: var(--ok-bg); color: var(--ok-fg); }
.rs-chip.missing { background: var(--bad-bg); color: var(--bad-fg); }

/* Shared by every InertButton. Collapses to nothing until a press fills it,
   so an idle placeholder measures exactly like the live control it mimics. */
.inert-note { font-size: 12px; color: var(--text3); }
.inert-note:empty { display: none; }
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npm run home-spec:test
npm run demo-resume:test
```

Expected: `home spec ok`, `demo-resume ok`

- [ ] **Step 8: Verify it renders**

Start the dev server — `.claude/launch.json` has a configuration named `leadnear-jobs` on port 4100 — and load `http://localhost:4100/jobs/resume` at 1440px. Confirm: a violet-to-grey donut reading `72` over `ATS SCORE`; four labelled bars; five fix rows with High/Medium/Low pills and mono `+6`…`+1` impacts; nine green chips and four red chips with mono percentages; and the 8.5×11 grey preview placeholder. Check the console for errors, and confirm the page has exactly one `<h1>`:

```bash
curl -s http://localhost:4100/jobs/resume | grep -o '<h1' | wc -l
```

Expected: `1`

- [ ] **Step 9: Commit**

```bash
git add app/resume components/ResumeScan.jsx components/ScanPips.jsx components/InertButton.jsx app/globals.css scripts/test-home-spec.mjs
git commit -m "feat(resume): the ATS scan result screen

Server-rendered from hardcoded fixtures, noindex, with the design's own
placeholder for the rasterised resume preview.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The Matches screen

**Files:**
- Create: `app/matches/page.jsx`, `components/MatchBuckets.jsx`
- Modify: `app/globals.css`, `scripts/test-home-spec.mjs`

**Interfaces:**
- Consumes: `getMatchCohort`, `bucketJobs` (Task 3); `fmtSalary` from `lib/format.js`; `<InertButton>` (Task 4); `.console-shell` (Task 1).
- Produces: nothing later tasks depend on, beyond the CSS Task 7 gives a phone treatment.

Spec: lines 253–304. The desktop layout is **three columns side by side** — `grid-template-columns: repeat(3, minmax(0,1fr))` — not three stacked sections. Each bucket has its own card treatment, and Low is materially different: flat background, muted text, and **no salary row and no action buttons**.

- [ ] **Step 1: Write the failing CSS assertions**

Add to `scripts/test-home-spec.mjs`, before the dead-rule loop:

```js
// ─── Matches (spec 253-304) ───
decl(".mb-grid", "grid-template-columns: repeat(3,minmax(0,1fr))");
decl(".mb-grid", "gap: 16px");
decl(".mb-head", "padding: 0 4px 12px");
decl(".mb-dot", "width: 8px");
decl(".mb-list", "gap: 8px");
decl(".mb-card", "border-radius: 16px");
decl(".mb-card", "padding: 14px 16px");
decl(".mb-card.strong", "box-shadow: 0 1px 2px rgba(21,23,28,.05), 0 0 0 1px rgba(91,78,240,.16)");
decl(".mb-card.low", "background: #fafafb");
decl(".mb-why", "padding: 8px 10px");
decl(".mb-why", "border-radius: 10px");
decl(".mb-why.strong", "background: #f3f1ff");
decl(".mb-queue-all", "background: var(--accent-tint)");
decl(".mb-apply", "background: var(--text)");
decl(".mb-more", "background: transparent");
decl(".mb-note", "padding: 14px 16px");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run home-spec:test`
Expected: FAIL — `missing rule: .mb-grid`

- [ ] **Step 3: Write the buckets component**

Create `components/MatchBuckets.jsx` — client, for `Show N more` and (in Task 7) the phone tabs:

```jsx
"use client";
import { useState } from "react";
import Link from "next/link";
import InertButton from "@/components/InertButton";
import { fmtSalary } from "@/lib/format";

const QUEUE_NOT_LIVE = "Auto-apply isn't live yet";

// Initial rows per bucket, matching the mock.
const INITIAL = { strong: 4, good: 3, low: 2 };

const BUCKETS = [
  { key: "strong", label: "Strong", actions: true },
  { key: "good",   label: "Good",   actions: true },
  { key: "low",    label: "Low",    actions: false },
];

// attachLocations attaches location_slug values ("new-york"), not display
// text — the same shape components/JobCard.jsx receives and title-cases.
// components/JobPreview.jsx does NOT do this because getJob() gives it
// location_raw, which is already readable. Do not copy that component here.
function toLocationLabel(locations) {
  if (!Array.isArray(locations) || locations.length === 0) return "";
  return locations
    .slice(0, 2)
    .map((item) => item.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(", ");
}

function MatchRow({ row, tier, actions }) {
  const salary = fmtSalary(row);
  const location = toLocationLabel(row.locations);
  return (
    <div className={`mb-card ${tier}`}>
      <Link href={`/${row.job_slug}`} className="mb-role">{row.title}</Link>
      <div className="mb-sub">{row.company}{location ? ` · ${location}` : ""}</div>
      <div className={`mb-why ${tier}`}>{row.why}</div>
      {actions ? (
        <div className="mb-foot">
          <span className="mb-salary">{salary ?? "—"}</span>
          <div className="mb-actions">
            <InertButton className="mb-queue" note={QUEUE_NOT_LIVE}>+ Queue</InertButton>
            <Link href={`/${row.job_slug}`} className="mb-apply">Apply</Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function MatchBuckets({ buckets }) {
  const [expanded, setExpanded] = useState({});

  return (
    <div className="mb-grid">
      {BUCKETS.map(({ key, label, actions }) => {
        const rows = buckets[key];
        const shown = expanded[key] ? rows.length : Math.min(INITIAL[key], rows.length);
        const remaining = rows.length - shown;
        return (
          <section className="mb-col" key={key} aria-label={`${label} matches`}>
            <div className="mb-head">
              <span className={`mb-head-label ${key}`}>
                <span className={`mb-dot ${key}`} aria-hidden="true" />
                {label}
                <span className="mono">{rows.length}</span>
              </span>
              {/* Queue-all is a Strong-bucket affordance in the design, and the
                  count is this bucket's real size, not the mock's 18. */}
              {key === "strong" && rows.length > 0 ? (
                <InertButton className="mb-queue-all" note={QUEUE_NOT_LIVE}>
                  Queue all {rows.length}
                </InertButton>
              ) : null}
              {key === "low" ? <span className="mb-collapsed">collapsed</span> : null}
            </div>
            <div className="mb-list">
              {rows.slice(0, shown).map((row) => (
                <MatchRow key={row.db_id} row={row} tier={key} actions={actions} />
              ))}
              {remaining > 0 ? (
                <button type="button" className="mb-more" onClick={() => setExpanded((e) => ({ ...e, [key]: true }))}>
                  Show {remaining} more
                </button>
              ) : null}
              {key === "low" ? (
                <div className="mb-note">
                  Low-fit roles are excluded from auto-apply. Add a target title or close a missing keyword to move roles up.
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Write the route**

Create `app/matches/page.jsx`:

```jsx
import Link from "next/link";
import { getMatchCohort } from "@/lib/jobs";
import { bucketJobs } from "@/lib/match-buckets";
import { DEMO_FIT } from "@/lib/demo-fit";
import MatchBuckets from "@/components/MatchBuckets";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your matches | LeadNear Jobs",
  description: "Open roles ranked against your resume.",
  // Bucketing is demo content, so this page must never be indexed. It is
  // deliberately absent from app/sitemap.js for the same reason.
  robots: "noindex",
};

const HIDE_APPLIED_WHY = "Available once applications are tracked";

export default async function MatchesPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const remote = sp.remote === "1";
  const salaryListed = sp.salary === "1";

  // Filters re-query rather than filtering in the browser: the header total
  // and the per-bucket counts must agree with the rows on screen.
  const jobs = await getMatchCohort({ remote, salaryListed }).catch((error) => {
    console.error("Unable to load the match cohort", error);
    return null;
  });

  if (!DEMO_FIT) return null;          // Task 8 replaces this with the honest panel.
  if (jobs === null) {
    return (
      <div className="console-shell">
        <div className="empty-box"><p>Could not load matches. Try again shortly.</p></div>
      </div>
    );
  }

  const buckets = bucketJobs(jobs);
  const href = (next) => {
    const params = new URLSearchParams();
    if (next.remote) params.set("remote", "1");
    if (next.salary) params.set("salary", "1");
    const qs = params.toString();
    return qs ? `/matches?${qs}` : "/matches";
  };

  return (
    <div className="console-shell">
      <div className="mb-page-head">
        <div className="mb-page-title">
          <h1 className="rs-title"><span className="mono">{buckets.counts.total}</span> matches</h1>
          <span className="rs-meta">from arjun-mehta-resume.pdf · Senior Backend Engineer · refreshed 2h ago</span>
        </div>
        <div className="mb-filters">
          {/* Links, not buttons: the filter state belongs in the URL so it is
              shareable and works without JavaScript. aria-pressed is a button
              attribute and is invalid here — aria-current marks the active
              item in a set, which is what an engaged filter is. */}
          <Link href={href({ remote: !remote, salary: salaryListed })}
                className="filter-toggle" aria-current={remote ? "true" : undefined}>Remote</Link>
          <Link href={href({ remote, salary: !salaryListed })}
                className="filter-toggle" aria-current={salaryListed ? "true" : undefined}>Salary listed</Link>
          {/* Needs application state that does not exist. A real disabled
              attribute, unlike the placeholder buttons — there is nothing to
              explain on press, the control is simply unavailable. */}
          <button type="button" className="filter-toggle" disabled title={HIDE_APPLIED_WHY}>Hide applied</button>
        </div>
      </div>

      {buckets.counts.total === 0 ? (
        <div className="empty-box"><p>No matches with these filters. Try clearing one.</p></div>
      ) : (
        <MatchBuckets buckets={buckets} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add the CSS**

In `app/globals.css`, after the resume block:

```css
/* ─── Matches (Direction C — spec lines 253–304) ─────────────────── */
.mb-page-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.mb-page-title { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.mb-filters { display: flex; gap: 7px; }
.mb-filters .filter-toggle[aria-current="true"] { background: var(--text); color: #fff; box-shadow: none; }
.mb-filters .filter-toggle:disabled { opacity: .5; cursor: not-allowed; }

.mb-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 16px; align-items: start; }
.mb-col { min-width: 0; }
.mb-head { display: flex; justify-content: space-between; align-items: center; padding: 0 4px 12px; }
.mb-head-label { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
.mb-head-label.low { color: var(--text3); }
.mb-head-label .mono { color: var(--text4); font-weight: 400; }
.mb-dot { width: 8px; height: 8px; border-radius: var(--radius-pill); }
.mb-dot.strong { background: var(--accent); }
.mb-dot.good { background: #a3a4af; }
.mb-dot.low { background: #d5d5db; }
.mb-collapsed { font-size: 12px; color: var(--text4); }
.mb-queue-all { border: 0; background: var(--accent-tint); color: var(--accent-hover); border-radius: var(--radius-pill); padding: 6px 11px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }

.mb-list { display: flex; flex-direction: column; gap: 8px; }
.mb-card { background: var(--bg); border-radius: 16px; padding: 14px 16px; }
.mb-card.strong { box-shadow: 0 1px 2px rgba(21,23,28,.05), 0 0 0 1px rgba(91,78,240,.16); }
.mb-card.good { box-shadow: 0 1px 2px rgba(21,23,28,.05), 0 0 0 1px rgba(21,23,28,.05); }
.mb-card.low { background: #fafafb; box-shadow: 0 0 0 1px rgba(21,23,28,.04); }
.mb-role { font-weight: 600; font-size: 14.5px; line-height: 1.3; letter-spacing: -.01em; display: block; color: var(--text); }
.mb-card.low .mb-role { font-size: 14px; color: #4b4d58; }
.mb-sub { color: var(--text3); margin-top: 2px; }
.mb-card.low .mb-sub { color: #8b8d99; }
.mb-why { margin-top: 10px; font-size: 12.5px; padding: 8px 10px; border-radius: 10px; line-height: 1.45; }
.mb-why.strong { background: #f3f1ff; color: #3a2fa8; }
.mb-why.good { background: var(--bg2); color: var(--text2); }
/* Low's why is plain text, not a chip — the design gives it no background. */
.mb-why.low { background: transparent; padding: 0; margin-top: 8px; color: #8b8d99; }
.mb-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
.mb-salary { font-family: var(--font-mono), monospace; font-size: 12px; color: var(--text2); }
.mb-actions { display: flex; gap: 6px; align-items: center; }
.mb-queue { border: 0; background: var(--bg2); border-radius: var(--radius-pill); padding: 7px 11px; font-size: 12px; font-weight: 600; cursor: pointer; color: var(--text2); font-family: inherit; }
.mb-apply { border: 0; background: var(--text); color: #fff; border-radius: var(--radius-pill); padding: 7px 13px; font-size: 12px; font-weight: 600; display: inline-block; }
.mb-apply:hover { background: var(--accent); color: #fff; }
.mb-more { border: 0; background: transparent; padding: 8px; font-size: 12.5px; font-weight: 600; color: var(--text3); cursor: pointer; font-family: inherit; }
.mb-note { padding: 14px 16px; font-size: 12.5px; color: var(--text3); line-height: 1.5; background: var(--bg); border-radius: 16px; box-shadow: 0 0 0 1px rgba(21,23,28,.05); }
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm run home-spec:test
npm run match-buckets:test
```

Expected: `home spec ok`, `match-buckets ok`

- [ ] **Step 7: Verify it renders**

With the dev server running, load `http://localhost:4100/jobs/matches` at 1440px and confirm:
- Three columns side by side, each headed by a coloured dot, a label and a mono count.
- Strong cards carry a violet ring and a violet `why` chip; Good cards a grey ring and grey chip; Low cards are flat `#fafafb` with muted text, **no salary and no buttons**.
- `Queue all N` shows the **Strong bucket's real count**, not 18.
- `Show N more` appears where a bucket has more rows than its initial 4 / 3 / 2, and expands on click.
- Clicking a role title or `Apply` reaches a real job page that renders.
- Toggling `Remote` adds `?remote=1`, and the header total **and** the bucket counts both drop.
- `Hide applied` is visibly disabled and not clickable.
- The page has exactly one `<h1>`: `curl -s http://localhost:4100/jobs/matches | grep -o '<h1' | wc -l` → `1`

Cross-check consistency with the home page: pick a role from the Strong column, find that job on `/jobs`, and confirm its card badge reads "Strong fit". If the two disagree, the two screens are not hashing the same slug — stop and report it.

- [ ] **Step 8: Commit**

```bash
git add app/matches components/MatchBuckets.jsx app/globals.css scripts/test-home-spec.mjs
git commit -m "feat(matches): three-bucket match screen over real jobs

Buckets come from the same fitFor hash the job cards use, so a role's
tier is identical on both screens. Filters re-query so the header total
and the bucket counts cannot contradict the rows.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Entry points

**Files:**
- Modify: `components/SiteNavbar.jsx`, `components/AuthNav.jsx`, `components/HomeHeroCta.jsx`, `app/layout.jsx`

**Interfaces:**
- Consumes: `<ScanPips>` (Task 4), `DEMO_FIT` / `DEMO_SCANS_USED` / `DEMO_QUOTA` from `lib/demo-fit.js`, and the two routes from Tasks 4 and 5.
- Produces: nothing later tasks depend on.

Four controls currently dead-end. This task points them at the new screens.

**The reachability trap.** `.nav-actions` — which holds the pips — is hidden below 768px by an existing rule, and the hamburger panel renders only the `links` array plus `<AuthNav mobile />`, whose pips are suppressed by `!mobile`. Adding the routes to the desktop nav **alone would make both screens silently unreachable on phones** — the same regression class as the mobile-search defect fixed in the previous plan. Both routes get explicit entries in the mobile panel, and Step 5 verifies it.

- [ ] **Step 1: Add Matches to the desktop nav**

In `components/SiteNavbar.jsx`, extend the `links` array. Keep the existing entries — the app's real routes stay:

```jsx
const links = [
  ["Jobs", "/jobs"],
  ["Remote Jobs", "/jobs/remote"],
  ["Matches", "/jobs/matches"],
  ["Categories", "/jobs/categories"],
  ["Salary Explorer", "/jobs/salaries"],
];
```

These are absolute paths including the basePath, matching the entries already there.

- [ ] **Step 2: Add both routes to the mobile panel**

Still in `components/SiteNavbar.jsx`, inside the `mobile-navigation` nav, add a section before the existing `Discover` one. `Matches` is already in `links` and so already renders in the panel; `Resume scan` is not a top-level nav item on desktop, so it needs its own entry here:

```jsx
            <a href="/jobs/resume" onClick={closeNavigation}>Resume scan</a>
```

Place it directly after the `links.map(...)` block, so the panel reads Jobs / Remote Jobs / Matches / Categories / Salary Explorer / Resume scan.

- [ ] **Step 3: Make the pips a link and reuse ScanPips**

In `components/AuthNav.jsx`, replace the inlined pip markup with the shared component wrapped in a link. Import it and `Link`, then:

```jsx
  const showPips = !mobile && (DEMO_FIT || status === "authenticated");
  const scansUsed = DEMO_FIT ? DEMO_SCANS_USED : 0;
  const pips = showPips ? (
    <Link href="/resume" className="scan-pips-link" aria-label={`${DEMO_QUOTA - scansUsed} of ${DEMO_QUOTA} free scans — open resume scan`}>
      <ScanPips used={scansUsed} quota={DEMO_QUOTA} />
    </Link>
  ) : null;
```

Delete the inlined `<span className="scan-pips">…</span>` block it replaces — do not leave two copies of that markup.

Add to `app/globals.css` so the link is a plain wrapper and the pill styling stays on `.scan-pips`:

```css
.scan-pips-link { display: inline-flex; border-radius: var(--radius-pill); }
.scan-pips-link:hover .scan-pips { background: #e0deff; }
```

`href="/resume"` without the `/jobs` prefix — `next/link` applies `basePath` automatically, which is why the existing `Link` calls in `components/JobPreview.jsx` use bare paths while the plain `<a>` tags in `SiteNavbar.jsx` include it.

- [ ] **Step 4: Point the hero CTAs at the resume screen**

In `components/HomeHeroCta.jsx`, the buttons currently always reveal a note. They should link while the demo layer is on and keep the note for when it is off — the hero's headline and subcopy advertise resume scanning and sit outside the switch, so hiding the buttons would leave that copy above empty space:

```jsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { DEMO_FIT } from "@/lib/demo-fit";

const NOT_LIVE = "Resume scoring isn't live yet";

export default function HomeHeroCta() {
  const [note, setNote] = useState("");

  if (DEMO_FIT) {
    return (
      <div className="hh-cta">
        <Link href="/resume" className="hh-cta-primary">Upload resume</Link>
        <Link href="/resume" className="hh-cta-ghost">How scoring works</Link>
      </div>
    );
  }

  return (
    <div className="hh-cta">
      <button type="button" className="hh-cta-primary" title={NOT_LIVE} onClick={() => setNote(NOT_LIVE)}>
        Upload resume
      </button>
      <button type="button" className="hh-cta-ghost" title={NOT_LIVE} onClick={() => setNote(NOT_LIVE)}>
        How scoring works
      </button>
      <p className="hh-cta-note" role="status" aria-live="polite">{note}</p>
    </div>
  );
}
```

The existing `.hh-cta button` CSS rules must also apply to the links. Widen those selectors from `.home-hero .hh-cta button` to `.home-hero .hh-cta button, .home-hero .hh-cta a` so the two render identically — the measurement gate probes `.hh-cta-primary`'s padding and shadow, and it must still pass.

- [ ] **Step 5: Add the footer link**

In `app/layout.jsx`, the footer's `footer-links` block lists site destinations. Add `Resume scan`, which the design's own footer carries, next to the existing entries. Match the surrounding markup exactly — some of those links deliberately leave the app, so copy the local-link form used by the in-app entries rather than inventing one.

- [ ] **Step 6: Verify every entry point, at both widths**

With the dev server running:

At **1440px** — the header nav shows `Matches` and it navigates; the pips are a link and reach `/jobs/resume`; both hero buttons reach `/jobs/resume` and still look identical to before (same padding, same shadow); the footer's `Resume scan` works; `Discover ▾` still opens unclipped and every pre-existing nav item still navigates.

At **390px** — open the hamburger panel and confirm **both** `Matches` and `Resume scan` are listed and reach their routes. This is the check that matters most in this task: if either is missing, the screens are desktop-only.

- [ ] **Step 7: Run the full suite and commit**

```bash
npm run home-spec:test && npm run demo-fit:test && npm run demo-resume:test && npm run match-buckets:test
git add components/SiteNavbar.jsx components/AuthNav.jsx components/HomeHeroCta.jsx app/layout.jsx app/globals.css
git commit -m "feat(nav): route the pips, hero CTAs and nav to the new screens

Both routes get explicit mobile-panel entries: .nav-actions is hidden
below 768px, so desktop-only nav would have made them unreachable on
phones.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Phone treatments

**Files:**
- Modify: `app/globals.css`, `components/MatchBuckets.jsx`, `scripts/test-home-spec.mjs`

**Interfaces:**
- Consumes: everything from Tasks 4 and 5.
- Produces: nothing.

The design specifies phone frames for both screens (`C Mobile`, spec ~430–462). **Matches is not a reflow** — the three columns become three pill tabs showing one bucket at a time. Resume is a straightforward single-column collapse.

Both go in the existing `@media (max-width: 640px)` block, alongside the hero and card rules already there. **Do not touch the separate `@media (max-width: 900px)` block governing `.jobs-layout` / `.job-preview`.**

- [ ] **Step 1: Write the failing assertions**

In `scripts/test-home-spec.mjs`, extend the phone-block needle list with:

```js
  ".mb-tabs",                // matches becomes tabs, not columns
  "grid-template-columns: 1fr 1fr",  // resume's dimension bars, 2-up
  "min-height: 46px",        // full-width View matches button
```

and add, after that loop:

```js
// The phone Matches screen is tabs over one bucket, not three columns.
assert.ok(phone.includes("grid-template-columns: minmax(0,1fr)") || phone.includes(".mb-grid { display: block"),
  "the three-column match grid must collapse at phone width");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run home-spec:test`
Expected: FAIL — `phone breakpoint should carry ".mb-tabs"`

- [ ] **Step 3: Add the phone tab state**

In `components/MatchBuckets.jsx`, add tab state defaulting to Strong, and render the tab strip. It is CSS-hidden above 640px, so the desktop three-column layout is untouched:

```jsx
  const [tab, setTab] = useState("strong");
```

Restructure the return so the tab strip and the grid are siblings. Replace the whole `return (…)` with this — the bucket-column body is unchanged from Task 5 except for the four attributes on `<section>`:

```jsx
  return (
    <>
      <div className="mb-tabs" role="tablist" aria-label="Match strength">
        {BUCKETS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`mb-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`mb-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            className={`mb-tab${tab === key ? " active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label} <span className="mono">{buckets[key].length}</span>
          </button>
        ))}
      </div>
      <div className="mb-grid">
        {BUCKETS.map(({ key, label, actions }) => {
          const rows = buckets[key];
          const shown = expanded[key] ? rows.length : Math.min(INITIAL[key], rows.length);
          const remaining = rows.length - shown;
          return (
            <section
              className={`mb-col${tab === key ? " active" : ""}`}
              key={key}
              id={`mb-panel-${key}`}
              role="tabpanel"
              aria-labelledby={`mb-tab-${key}`}
            >
              <div className="mb-head">
                <span className={`mb-head-label ${key}`}>
                  <span className={`mb-dot ${key}`} aria-hidden="true" />
                  {label}
                  <span className="mono">{rows.length}</span>
                </span>
                {key === "strong" && rows.length > 0 ? (
                  <InertButton className="mb-queue-all" note={QUEUE_NOT_LIVE}>
                    Queue all {rows.length}
                  </InertButton>
                ) : null}
                {key === "low" ? <span className="mb-collapsed">collapsed</span> : null}
              </div>
              <div className="mb-list">
                {rows.slice(0, shown).map((row) => (
                  <MatchRow key={row.db_id} row={row} tier={key} actions={actions} />
                ))}
                {remaining > 0 ? (
                  <button type="button" className="mb-more" onClick={() => setExpanded((e) => ({ ...e, [key]: true }))}>
                    Show {remaining} more
                  </button>
                ) : null}
                {key === "low" ? (
                  <div className="mb-note">
                    Low-fit roles are excluded from auto-apply. Add a target title or close a missing keyword to move roles up.
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
```

The `aria-label` the `<section>` previously carried is dropped: `aria-labelledby` now points at the tab, which names the panel. Above 640px every panel is visible and the tab strip is `display:none`, so the tab roles are inert there; below 640px only the active panel shows.

- [ ] **Step 4: Add the phone CSS**

Inside the existing `@media (max-width: 640px)` block in `app/globals.css`:

```css
  /* ── Resume scan, phone (spec ~430-443) ── */
  .rs-body { grid-template-columns: minmax(0,1fr); }
  .rs-score { grid-template-columns: minmax(0,1fr); justify-items: center; text-align: center; gap: 14px; padding: 20px; }
  .rs-parts { grid-template-columns: 1fr 1fr; gap: 12px 18px; text-align: left; }
  .rs-keywords { grid-template-columns: minmax(0,1fr); }
  .rs-fix { grid-template-columns: 18px 70px minmax(0,1fr); gap: 11px; padding: 13px 16px; }
  /* The impact figure wraps under the text rather than squeezing a 4th column. */
  .rs-impact { grid-column: 2 / -1; text-align: left; }
  .rs-fix input { width: 16px; height: 16px; }
  .rs-actions { width: 100%; flex-wrap: wrap; }
  .rs-view-matches { width: 100%; text-align: center; padding: 14px; min-height: 46px; }

  /* ── Matches, phone (spec ~444-462): three tabs over one bucket ── */
  .mb-tabs { display: flex; gap: 7px; margin-bottom: 14px; }
  .mb-tab { flex: 1; text-align: center; border: 0; background: var(--bg); box-shadow: 0 0 0 1px rgba(21,23,28,.07); border-radius: var(--radius-pill); padding: 8px; font-size: 12.5px; font-weight: 600; color: var(--text2); cursor: pointer; font-family: inherit; }
  .mb-tab.active { background: var(--text); color: #fff; box-shadow: none; }
  .mb-grid { grid-template-columns: minmax(0,1fr); gap: 0; }
  .mb-col { display: none; }
  .mb-col.active { display: block; }
  /* The bucket heading is redundant once the tab names it. */
  .mb-head { display: none; }
  .mb-list { gap: 10px; }
  .mb-card { border-radius: 16px; padding: 15px; }
  .mb-queue { padding: 10px 13px; }
  .mb-apply { padding: 10px 15px; }
```

Above 640px the tab strip must not render. Add this as a **base** rule (outside any media query), directly above the `.mb-grid` rule in the Matches CSS block:

```css
/* Phone-only; the 640px block below turns it back on. */
.mb-tabs { display: none; }
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run home-spec:test && npm run match-buckets:test
```

Expected: `home spec ok`, `match-buckets ok`

- [ ] **Step 6: Verify all three widths**

- **1440px** — resume is two columns with four bars in a row; matches is three columns and **no tab strip is visible**.
- **900px** — both still readable, nothing overlapping or overflowing.
- **390px** — resume is one column, the donut centred, bars 2-up, `View matches →` full-width; matches shows three pill tabs with `Strong` dark and active, one bucket's rows beneath, and switching tabs swaps the rows. Confirm **no horizontal scrollbar** on either route: `document.documentElement.scrollWidth === document.documentElement.clientWidth`.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css components/MatchBuckets.jsx scripts/test-home-spec.mjs
git commit -m "feat(mobile): phone treatments for resume and matches

Matches becomes three tabs over one bucket, per the design's own phone
frame — it is a different information architecture, not a reflow.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Honest degradation when the demo layer is off

**Files:**
- Modify: `app/resume/page.jsx`, `app/matches/page.jsx`, `components/SiteNavbar.jsx`, `components/ResumeScan.jsx`
- Create: `components/DemoOffPanel.jsx`

**Interfaces:**
- Consumes: `DEMO_FIT` from `lib/demo-fit.js`.
- Produces: `<DemoOffPanel />` — the panel both routes render when the switch is off.

Both screens are entirely demo content, so `NEXT_PUBLIC_DEMO_FIT=false` empties them. Tasks 4 and 5 left `return null`, which renders a blank page. This task replaces that with something honest, and removes the nav entries that would otherwise point at it.

A 404 would be tidier but breaks links already compiled into the client bundle, so the routes stay and explain themselves.

- [ ] **Step 1: Write the panel**

Create `components/DemoOffPanel.jsx`:

```jsx
// Rendered by /resume and /matches when NEXT_PUBLIC_DEMO_FIT=false. Both
// screens are entirely demo content, so the switch leaves nothing to show —
// but the routes still exist, and a blank page is not an explanation.
export default function DemoOffPanel({ what }) {
  return (
    <div className="console-shell">
      <div className="empty-box">
        <p>{what} isn&apos;t enabled on this deployment.</p>
        <p style={{ color: "var(--text3)", marginTop: ".5rem", fontSize: ".9rem" }}>
          Resume scoring and match ranking are still being built.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Use it in both routes**

In `app/resume/page.jsx`, replace `if (!data) return null;` with:

```jsx
  if (!data) return <DemoOffPanel what="Resume scanning" />;
```

In `app/matches/page.jsx`, replace `if (!DEMO_FIT) return null;` with:

```jsx
  if (!DEMO_FIT) return <DemoOffPanel what="Match ranking" />;
```

Move that check **above** the `getMatchCohort` call in `app/matches/page.jsx` — with the layer off there is no reason to query 214 rows only to discard them.

- [ ] **Step 3: Drop the nav entries with the switch**

In `components/SiteNavbar.jsx`, build the link list from the switch so nothing points at the panel:

```jsx
import { DEMO_FIT } from "@/lib/demo-fit";

const baseLinks = [
  ["Jobs", "/jobs"],
  ["Remote Jobs", "/jobs/remote"],
  ["Categories", "/jobs/categories"],
  ["Salary Explorer", "/jobs/salaries"],
];

// Matches only exists as demo content; with the layer off it would lead to the
// "not enabled" panel, so the nav simply does not offer it.
const links = DEMO_FIT
  ? [baseLinks[0], baseLinks[1], ["Matches", "/jobs/matches"], baseLinks[2], baseLinks[3]]
  : baseLinks;
```

Gate the mobile panel's `Resume scan` entry the same way: `{DEMO_FIT ? <a href="/jobs/resume" onClick={closeNavigation}>Resume scan</a> : null}`.

The pips already disappear with the switch for anonymous visitors (`showPips` gates on `DEMO_FIT || status === "authenticated"`), and a signed-in user still sees them reading `3/3` — that behaviour is deliberate and predates this plan. Leave it. But the *link* must not lead to the panel for that user, so in `components/AuthNav.jsx` wrap in a `Link` only when `DEMO_FIT`; otherwise render `<ScanPips>` bare, as it was.

- [ ] **Step 4: Verify both states**

```bash
npm run home-spec:test && npm run demo-resume:test && npm run match-buckets:test && npm run demo-fit:test
```

Then stop the dev server and build both ways:

```bash
rm -rf .next && npm run build
```

Start it and confirm `/jobs/resume` and `/jobs/matches` render fully, and `Matches` is in the nav.

```bash
rm -rf .next && NEXT_PUBLIC_DEMO_FIT=false npm run build
```

Start it and confirm: both routes render the panel rather than a blank page; `Matches` is **absent** from the desktop nav and the mobile panel; `Resume scan` is absent from the mobile panel; the home page has no fit badges, no fit banner and a disabled best-fit sort; and the hero CTAs fall back to their inert note rather than linking. Then rebuild without the variable.

- [ ] **Step 5: Commit**

```bash
git add app/resume app/matches components/DemoOffPanel.jsx components/SiteNavbar.jsx components/AuthNav.jsx
git commit -m "feat(demo): honest panel and nav removal when the layer is off

Both new screens are entirely demo content. With the switch off they
explain themselves instead of rendering blank, and nothing in the UI
points at them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: The pixel gate

**Files:**
- Modify: none expected. Any file the measurements prove wrong.

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: two verified screens and a clean production build.

Same method as the previous plan's gate, and for the same reason: the design file is a `.dc.html` whose `<x-dc>` elements and `{{ }}` bindings only resolve under a canvas runtime the constraints forbid porting, so there is no honest screenshot to diff. The gate reads live computed styles and compares them to the spec's declared numbers — stricter than a visual diff, because it catches a 1px error the eye would not.

- [ ] **Step 1: Start the dev server and open the resume screen**

Start `leadnear-jobs` from `.claude/launch.json` (port 4100). Open `http://localhost:4100/jobs/resume` and set the viewport to 1440px wide. If a measurement returns nothing or the page reports a zero-size viewport, resize explicitly and re-read rather than concluding the page is broken.

- [ ] **Step 2: Run the resume probe**

```js
const EXPECTED = [
  [".console-shell",   { maxWidth: "1440px", paddingTop: "8px", paddingLeft: "24px" }],
  [".rs-title",        { fontSize: "22px" }],
  [".rs-meta",         { fontSize: "12.5px" }],
  [".rs-body",         { columnGap: "16px" }],
  [".rs-card",         { paddingTop: "16px", borderTopLeftRadius: "18px" }],
  [".rs-preview",      { borderTopLeftRadius: "12px" }],
  [".rs-select",       { fontSize: "13.5px", borderTopLeftRadius: "10px" }],
  [".rs-score",        { paddingTop: "24px", columnGap: "32px" }],
  [".rs-donut",        { width: "132px", height: "132px" }],
  [".rs-donut-inner",  { width: "106px", height: "106px" }],
  [".rs-donut-score",  { fontSize: "38px" }],
  [".rs-headline",     { fontSize: "16px" }],
  [".rs-subline",      { fontSize: "13.5px" }],
  [".rs-track",        { height: "5px" }],
  [".rs-fixes-head",   { paddingTop: "14px", paddingLeft: "18px" }],
  [".rs-fix",          { paddingTop: "13px", paddingLeft: "18px", columnGap: "14px" }],
  [".rs-sev",          { fontSize: "11px", paddingTop: "3px", paddingLeft: "8px" }],
  [".rs-fix-text",     { fontSize: "13.5px" }],
  [".rs-impact",       { fontSize: "12.5px" }],
  [".rs-chip-card",    { paddingTop: "18px" }],
  [".rs-chip",         { fontSize: "12.5px", paddingTop: "4px", paddingLeft: "10px" }],
];
const problems = [];
for (const [selector, expected] of EXPECTED) {
  const el = document.querySelector(selector);
  if (!el) { problems.push(`${selector}: NOT RENDERED`); continue; }
  const actual = getComputedStyle(el);
  for (const [prop, want] of Object.entries(expected)) {
    if (actual[prop] !== want) problems.push(`${selector} ${prop}: ${actual[prop]} (want ${want})`);
  }
}
problems.length ? problems : "resume: all measurements match the spec";
```

Expected: `"resume: all measurements match the spec"`. Fix the CSS any returned line names, reload, and re-run until clean. If you believe an expectation is itself wrong, say so in your report with your reasoning rather than editing it to match the code.

- [ ] **Step 3: Check the donut and the mono treatment**

```js
({
  donut: getComputedStyle(document.querySelector(".rs-donut")).backgroundImage,
  score: document.querySelector(".rs-donut-score").textContent,
  bars: [...document.querySelectorAll(".rs-track > i")].map(i => getComputedStyle(i).width),
  mono: [".rs-donut-score", ".rs-impact", ".rs-part-head .mono"]
    .map(s => getComputedStyle(document.querySelector(s)).fontFamily.slice(0, 20)),
});
```

The donut's gradient must stop at 72%, the score must read `72`, the four bar widths must be in the ratio 96 / 64 / 78 / 58, and all three mono selectors must name IBM Plex Mono.

- [ ] **Step 4: Probe the Matches screen**

Navigate to `http://localhost:4100/jobs/matches`, still at 1440px:

```js
const EXPECTED = [
  [".mb-grid",     { columnGap: "16px" }],
  [".mb-head",     { paddingBottom: "12px" }],
  [".mb-dot",      { width: "8px", height: "8px" }],
  [".mb-list",     { rowGap: "8px" }],
  [".mb-card",     { borderTopLeftRadius: "16px", paddingTop: "14px", paddingLeft: "16px" }],
  [".mb-role",     { fontSize: "14.5px" }],
  [".mb-why",      { paddingTop: "8px", paddingLeft: "10px", borderTopLeftRadius: "10px", fontSize: "12.5px" }],
  [".mb-salary",   { fontSize: "12px" }],
  [".mb-apply",    { paddingTop: "7px", paddingLeft: "13px", fontSize: "12px" }],
  [".mb-queue-all",{ paddingTop: "6px", paddingLeft: "11px", fontSize: "12px" }],
  [".mb-note",     { paddingTop: "14px", paddingLeft: "16px", fontSize: "12.5px" }],
];
const problems = [];
for (const [selector, expected] of EXPECTED) {
  const el = document.querySelector(selector);
  if (!el) { problems.push(`${selector}: NOT RENDERED`); continue; }
  const actual = getComputedStyle(el);
  for (const [prop, want] of Object.entries(expected)) {
    if (actual[prop] !== want) problems.push(`${selector} ${prop}: ${actual[prop]} (want ${want})`);
  }
}
({
  measurements: problems.length ? problems : "matches: all measurements match the spec",
  columns: getComputedStyle(document.querySelector(".mb-grid")).gridTemplateColumns.split(" ").length,
  lowHasActions: !!document.querySelector(".mb-card.low .mb-foot"),
  tabsHiddenOnDesktop: getComputedStyle(document.querySelector(".mb-tabs")).display,
});
```

Expected: the measurements line clean, `columns: 3`, `lowHasActions: false`, and `tabsHiddenOnDesktop: "none"`.

- [ ] **Step 5: Check consistency, console and network**

- Pick a role from the Strong column, open `/jobs`, find that job, and confirm its card badge reads "Strong fit". A disagreement means the two screens are not hashing the same slug.
- The console must show **no hydration mismatch warning** on either route. That warning is the failure mode the demo layer was designed around.
- Toggling `Remote` must change the header total and the bucket counts together.

- [ ] **Step 6: Check 900px and 390px**

At 390px on `/jobs/matches`: the tab strip is visible, `Strong` is active and dark, one bucket renders, switching tabs swaps the rows, and `scrollWidth === clientWidth`. At 390px on `/jobs/resume`: one column, bars 2-up, full-width `View matches →`. Both routes reachable from the hamburger panel.

- [ ] **Step 7: Run every suite and build**

```bash
npm run demo-fit:test && npm run demo-resume:test && npm run match-buckets:test && npm run home-spec:test && npm run design-tokens:test && npm run format:test
```

All six must pass. `scripts/test-autocomplete.mjs` and `scripts/test-live-count.mjs` fail independently of this work — they default to port 4000, a different application. Ignore them.

Then stop the dev server and build:

```bash
rm -rf .next && npm run build
```

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix(resume,matches): close measured gaps against the spec

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Out of scope

- `C Upgrade`, `C Auto-apply` and `C Remote` — each needs its own spec and plan.
- Real upload, parsing, scoring, matching, queueing, and any persistence.
- Making `+ Auto-apply queue` in the job preview live.
- The ten deferred minors from the previous plan, recorded in its ledger.
