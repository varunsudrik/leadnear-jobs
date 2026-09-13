# Resume Scan and Matches — Frontend-Only

**Status:** approved design, ready for an implementation plan.
**Source of truth:** `docs/superpowers/specs/direction-c.html` — screen
`C Resume ATS` (lines 195–252), screen `C Matches` (lines 253–304), and the
phone frames inside `C Mobile` (ATS result ~430–443, matches ~444–462). The
state script at 466–557 carries the fixtures.

## Goal

Build the two screens the header's `1/3 free scans` control and a new `Matches`
nav item lead to, as frontend only. Every ATS value is hardcoded; the job rows
are real. The backend lands in a later, separate plan.

## Decisions taken before this document

1. **Matches rows are real jobs.** They come from the live database and are
   bucketed with the existing `fitFor()` hash the home page already uses, so a
   job badged "Strong fit" on home appears in the Strong bucket here. Every row
   links to a real job page. The `why` string is tier-keyed and generic rather
   than per-job — we cannot explain a match that was not computed.
2. **The resume route renders the result state only.** The design never draws a
   pre-upload state, and inventing an upload flow for a scan that does not
   happen would be three invented states out of four. `/jobs/resume` always
   shows the design's scanned result.
3. **Entry points go live:** the scan pips and both hero CTAs link to
   `/jobs/resume`; `Matches` joins the header nav. `+ Auto-apply queue` in the
   job preview stays inert — its screen is not in this plan.
4. **Out of scope:** the `C Upgrade` interstitial, `C Auto-apply`, real upload,
   real scoring, real queueing, and any persistence.

## Global constraints

Inherited from the Direction C work and still binding:

- Exact design values, copied verbatim from the spec HTML. Tokens already in
  `:root` (`--accent` `#5b4ef0`, `--text` `#15171c`, `--bg2` `#f4f4f6`,
  `--radius` `18px`, `--radius-pill` `999px`, …) are used rather than re-typed
  hex.
- **Every numeric is IBM Plex Mono** — scores, counts, percentages, salaries,
  impact figures. Structural, not decorative.
- Tailwind preflight stays disabled; read `AGENTS.md` before touching
  `tailwind.config.js` or `app/tailwind.css`.
- Never run `npm run build` while `next dev` is running.
- Tests are plain `node scripts/test-*.mjs` using `node:assert/strict`. No Jest,
  no Vitest, and this plan adds none.
- Placeholder controls take `aria-disabled="true"`, a `title`, and reveal an
  inline note on activation (the pattern established in `components/HomeHeroCta.jsx`);
  genuinely unavailable controls take a real `disabled` attribute.
- Do not add breakpoints for `.jobs-layout` / `.job-preview`;
  `--preview-breakpoint` is their single source.

## Routes

| Route | File | Renders |
|---|---|---|
| `/jobs/resume` | `app/resume/page.jsx` | `C Resume ATS`, result state |
| `/jobs/matches` | `app/matches/page.jsx` | `C Matches`, three buckets |

Both are **`robots: "noindex"`** and stay out of `app/sitemap.js`. The repo
already sets this on `/search`, `/signin`, `/backoffice` and alias slugs; two
pages whose entire content is fabricated ATS claims must not be indexed.

Both use `export const dynamic = "force-dynamic"`, matching `app/page.jsx` —
Matches queries per request and neither page is cacheable content.

## What is real and what is fabricated

| Screen | Real | Fabricated |
|---|---|---|
| Resume | nothing; it is a pure result view | score 72, four dimensions, five fixes, 9 found + 4 missing keywords, filename, page count, timings |
| Matches | job rows, titles, companies, locations, salaries, bucket counts, links | bucket assignment (`fitFor` hash), the `why` strings, the resume/cohort subtitle |

### Where fabricated values live

`lib/demo-resume.js` *(create)* — the ATS fixtures, transcribed from the spec's
state script: `DEMO_SCAN` (filename, pages, scanned-at text, duration), `SCORE`
(72), `SCORE_PARTS` (Parse 96 `#12876b`, Keywords 64 `#d98324`, Format 78
`#5b4ef0`, Impact 58 `#d98324`), `ISSUES` (five, each `sev`/`issue`/`fix`/`impact`),
`KEYWORDS_FOUND` (9), `KEYWORDS_MISSING` (4, each with its share), and the
`SCORED_AGAINST` options.

`lib/demo-fit.js` *(modify)* — gains `whyFor(tier)`, returning the tier-keyed
match explanation alongside the existing `bannerFor`. The copy is domain-neutral
for the same reason `bannerFor`'s is — the corpus spans Sales, HR and Design,
not just engineering:

| Tier | `why` |
|---|---|
| `strong` | Strong overlap with this posting's stated requirements. |
| `good` | Covers most of what this posting asks for; some requirements aren't evidenced. |
| `low` | Little overlap with this posting's requirements. |

Both read the **existing** `DEMO_FIT` switch. No second flag.

### Behaviour when `NEXT_PUBLIC_DEMO_FIT=false`

Both screens are entirely demo content, so the switch empties them. Rather than
404 — which would break links that exist in the built bundle — the routes stay
and render a short honest panel ("Resume scoring isn't enabled"), and the nav
item and the pips **disappear with the switch**, so nothing in the UI points at
a hollow page.

The hero is the exception. Its headline and subcopy advertise resume scanning
and sit *outside* the switch by an earlier decision, so hiding its buttons would
leave "Drop your resume…" above empty space. Instead the hero CTAs **revert to
the inert note** they show today: `components/HomeHeroCta.jsx` keeps its note
machinery and chooses per render — a `<Link>` when `DEMO_FIT` is on, a button
revealing "Resume scoring isn't live yet" when it is off.

## Data access

`getMatchCohort({ limit = 214 })` *(create, in `lib/jobs.js`)* — `searchJobs` is
capped at `PAGE_SIZE = 20`, so Matches needs its own bounded query. Returns the
newest N active jobs in the same column shape as `searchJobs`, and **must call
`attachLocations`** exactly as `searchJobs` does, or every row renders without a
location.

The default of 214 matches the mock's number. The cohort is arbitrary but real:
the bucket counts under each heading are computed from it, so they are truthful
about what is on screen rather than transcribed from the mock.

**Filters are server-side.** `Remote` maps to `j.remote = 1` and `Salary listed`
to `j.salary_annual_usd IS NOT NULL` — the same column `searchJobs`'s
`salary_min` filter uses, so the two agree; both re-query the cohort so the bucket counts and the
header total stay consistent with the visible rows. Client-side filtering would
leave the header contradicting the list. `Hide applied` needs application state
that does not exist — it renders `disabled` with an explanatory `title`, the
treatment `Sort: best fit` had before it went live.

## Screen: Resume (spec 195–252)

Header: `h1` "Resume scan" at `22px/600/-.025em`, beside `12.5px` `#6b6d78`
metadata; then the pips, `Upload revised` (white pill, inert), and
`View 214 matches →` (dark pill, links to `/jobs/matches`). The `Unlock unlimited`
button is gated on `trialExhausted` (`scansUsed >= 3`), which is false at 2 —
the branch stays in the markup but never renders.

Body: `grid-template-columns: minmax(250px,1fr) minmax(0,2.2fr); gap:16px`.

- **Left column.** The preview card — note the mock itself draws a grey
  `aspect-ratio:8.5/11` box reading "rendered resume page with flagged regions
  highlighted", so we ship exactly that placeholder and invent nothing. Below
  it, the `Scored against` card: a `select` with the three static cohort
  options and the "Keywords weighted by…" caption.
- **Right column.** The score card (`padding:24px`, `grid auto / minmax(0,1fr)`,
  `gap:32px`): a `132px` conic-gradient donut
  `conic-gradient(#5b4ef0 0 72%, #eaeaef 72% 100%)` with a `106px` white inner
  circle holding `38px` mono `72` over an `11px` `ATS SCORE` label; then the
  headline, the sub-line, and the four dimension bars in
  `repeat(4,1fr)` with `5px` tracks. Then the `Fixes · 5 open` card — a header
  row and five `label` rows at
  `grid-template-columns: 18px 70px minmax(0,1fr) 44px`, each with a
  `accent-color:#5b4ef0` checkbox, a severity pill, issue text plus a `#6b6d78`
  fix clause, and a mono `#12876b` impact. Then two keyword cards side by side
  (`1fr 1fr`): found chips `#e7f6f1`/`#0e6e57`, missing chips
  `#fdeeea`/`#a8341a`, and the "Share of current postings…" caption.

Checkbox state is local and unpersisted; the fixes count in the header does not
decrement, because nothing is being tracked.

## Screen: Matches (spec 253–304)

Header: `h1` "214 matches", a `12.5px` `#6b6d78` subtitle, and the three filter
pills.

Body: **`grid-template-columns: repeat(3, minmax(0,1fr)); gap:16px`** — three
buckets side by side, not stacked. Each column has a heading row (an `8px` dot,
the label, a mono count) and a `gap:8px` card list.

| Bucket | Dot | Card | Rows show |
|---|---|---|---|
| Strong | `#5b4ef0` | white, `radius:16px`, ring `rgba(91,78,240,.16)` | title, company · location, `why` chip on `#f3f1ff`/`#3a2fa8`, mono salary, `+ Queue` and `Apply` |
| Good | `#a3a4af` | white, ring `rgba(21,23,28,.05)` | same, `why` chip on `#f4f4f6`/`#3d3f4a` |
| Low | `#d5d5db`, plus a `collapsed` label | `#fafafb`, ring `rgba(21,23,28,.04)` | title `14px` `#4b4d58`, sub `#8b8d99`, plain `why` — **no salary row, no buttons** |

`Queue all 18` (`#ecebff`/`#4a3ee0`) appears on Strong only. `Show N more`
(transparent, `#6b6d78`) expands a bucket client-side. Low is collapsed by
default and closes with its "Low-fit roles are excluded from auto-apply…" note.

**Every count is computed** from the cohort — `Show N more` and `Queue all 18`
carry real numbers, not the mock's literals.

`Apply` links to the real job page. `+ Queue` and `Queue all N` are inert and
use the established note pattern.

## Phone treatment

The design specifies phone frames for both screens; neither is a reflow.

**Resume (spec ~430–443):** single column. Donut `132px`/`106px` with the score
at `38px`. The four dimension bars become a `1fr 1fr` grid with `12px 18px` gaps.
The fixes list keeps its checkboxes at `16px`. `View 214 matches →` becomes a
full-width dark button, `padding:14px`, `min-height:46px`.

**Matches (spec ~444–462):** the three columns collapse into **three pill tabs** —
`Strong 18` / `Good 63` / `Low 133`, each `flex:1`, the active one dark
`#15171c` and the others white with a `rgba(21,23,28,.07)` ring — with one
bucket's rows below. Rows go to `radius:16px`, `padding:15px`, `gap:10px`; the
`why` chip keeps its violet treatment; the buttons grow to `padding:10px 13px`
(`+ Queue`) and `10px 15px` (`Apply`). Tab state is client-side.

## Entry points

| Control | Now | After |
|---|---|---|
| `1/3 free scans` pips | non-navigating `<span>` | `<Link>` to `/jobs/resume` |
| Hero `Upload resume` / `How scoring works` | inert, reveal a note | `<Link>` to `/jobs/resume` while `DEMO_FIT` is on; the note is kept for the switched-off case |
| Header nav | `Jobs · Remote Jobs · Categories · Salary Explorer · Discover ▾ · Services` | gains `Matches` |
| Footer | no resume link | gains `Resume scan`, as the design's footer shows |

**Both routes must be reachable on a phone.** `.nav-actions` — which holds the
pips — is hidden below 768px, and the hamburger panel renders only the `links`
array plus `AuthNav`. Adding the routes to the desktop nav alone would make them
silently unreachable on phones, the same regression class as the mobile-search
defect fixed in the previous plan. **`Resume scan` and `Matches` get explicit
entries in `components/SiteNavbar.jsx`'s mobile panel.**

## Shared shell

Both new sections use `max-width:1440px; margin:0 auto; padding:8px 24px 56px` —
identical to `.home-shell`. Reusing a class named for the home page on two other
routes is misleading: rename it to a neutral `.console-shell` (with its phone
override) and update the one existing usage in `app/page.jsx`.

## Unstated details, now fixed

- Initial rows per bucket, matching the mock: **4** Strong, **3** Good, **2** Low.
  `Show N more` carries the remainder of that bucket's real count.
- The phone tab set opens on **Strong**.
- Page titles: "Resume scan | LeadNear Jobs" and "Your matches | LeadNear Jobs",
  both `robots: "noindex"`, neither carrying a canonical.

## States and accessibility

- Matches gets an empty state when the cohort query returns nothing, and an
  error fallback mirroring `app/page.jsx`'s `.catch(() => …)`.
- One `<h1>` per screen.
- The donut is decorative (`aria-hidden`); the score is exposed as text.
- Filter pills are toggle buttons with `aria-pressed`, matching
  `components/Filters.jsx`'s `.filter-toggle`.
- Bucket tabs on phone use the tab/tabpanel roles with roving focus.
- Inert controls follow the established note pattern rather than `disabled`.

## Files

| File | Change |
|---|---|
| `app/resume/page.jsx` | create — route, metadata + noindex, renders the result |
| `app/matches/page.jsx` | create — route, metadata + noindex, cohort query, filters |
| `components/ResumeScan.jsx` | create — the whole ATS result view |
| `components/MatchBuckets.jsx` | create — client component: bucket columns, `Show N more`, phone tabs |
| `lib/demo-resume.js` | create — ATS fixtures behind `DEMO_FIT` |
| `lib/demo-fit.js` | modify — add `whyFor(tier)` |
| `lib/jobs.js` | modify — add `getMatchCohort({ limit })` |
| `components/SiteNavbar.jsx` | modify — `Matches` in desktop nav; `Resume scan` + `Matches` in the mobile panel |
| `components/AuthNav.jsx` | modify — pips become a `Link` |
| `components/HomeHeroCta.jsx` | modify — CTAs become links while `DEMO_FIT` is on, keeping the note for the switched-off case |
| `app/globals.css` | modify — both screens' CSS; `.home-shell` → `.console-shell` |
| `app/page.jsx` | modify — shell class rename |
| `scripts/test-demo-resume.mjs` | create — fixture shape, switch-off behaviour |
| `scripts/test-match-buckets.mjs` | create — bucketing and count derivation |
| `scripts/test-home-spec.mjs` | modify — assertions for the new CSS |

## Verification

1. `node scripts/test-demo-resume.mjs` — every fixture has the shape the view
   expects; `DEMO_FIT=false` empties them.
2. `node scripts/test-match-buckets.mjs` — a cohort of known slugs buckets into
   the expected tiers, counts sum to the cohort size, `Show N more` figures are
   derived rather than literal, and Low never receives action buttons.
3. The four existing suites still pass.
4. The live measurement probe, extended to both new routes, at 1440 / 900 / 390,
   compared against the values in this document.
5. Both routes reachable and usable at 390px, including from the hamburger panel.
6. A clean production build, plus one with `NEXT_PUBLIC_DEMO_FIT=false`
   confirming both screens degrade to the honest panel and no nav item points
   at them.

## Explicitly out of scope

- `C Upgrade`, `C Auto-apply`, `C Remote` — each needs its own plan.
- Real upload, parsing, scoring, matching, queueing, and any persistence.
- Making `+ Auto-apply queue` in the job preview live.
