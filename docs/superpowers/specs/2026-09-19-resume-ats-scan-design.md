# Real ATS resume scan — design

Date: 2026-09-19
Status: approved for planning
Design reference: `docs/superpowers/specs/direction-c.html` (15 screens)
Supersedes the fixtures in `lib/demo-resume.js` and the hash bucketing in `lib/match-buckets.js`.

## 1. Goal

Replace the fabricated Resume scan and Matches screens with a working feature: a
user uploads a PDF resume, gets a real ATS score with real findings, and sees
real live jobs ranked against it.

Everything currently behind `NEXT_PUBLIC_DEMO_FIT` on these two screens becomes
real or is removed. No screen keeps invented numbers.

## 2. Decisions

Each was taken deliberately; the rationale matters more than the choice.

| # | Decision | Rationale |
|---|---|---|
| D1 | Scanning requires sign-in | Each scan costs real API money. Anonymous metering by IP is defeated by rotation and wrongly blocks shared office and mobile IPs. |
| D2 | Quota is 3 scans, counted in Postgres | Derived, not stored — see D8. |
| D3 | Store the result, the skill vector, and **the extracted text lines the parser view displays**. Not the original file. | See D11 — this is a knowing amendment to the original "no resume text" decision, forced by the design. The file itself is still never stored. |
| D4 | Job matching is deterministic — no inference is run *per job* (AI call 2 reads a fixed sample of descriptions once per scan and does not rank) | At 685,959 live jobs, per-job inference is not affordable at any model price. Deterministic ranking also costs nothing per page view and is testable without a network. |
| D5 | Target title is inferred, then changeable | The design draws no title picker. Re-targeting recomputes from stored data only, so it is free and must not consume quota. |
| D6 | Model is `deepseek/deepseek-v4-flash` behind a swappable constant | $0.36 per 1,000 scans versus $3.30 for `gpt-5-mini`, and it supports `temperature` (gpt-5-mini does not), which matters because the same resume must score the same twice. Quality at this price point is unproven — hence the eval harness in D7. |
| D7 | An eval harness ships with the feature | "Is the cheap model good enough" becomes a measurement rather than an assumption, and switching models becomes a one-line change. |
| D8 | Quota is `COUNT(*)` over scan rows, not a counter column | A counter is a second source of truth that drifts the first time a write half-fails. Derived means "2 of 3 used" and the scan history can never disagree. |
| D9 | Synchronous scan, async-ready structure | One blocking request with `maxDuration`. The scan function is written to be callable from a queue later without restructuring. |
| D10 | Comparison cohorts come from `canonical_title`, restricted to titles with >= 200 live jobs | Measured: 143 such titles exist in production. Below that the percentages are computed off too small a sample to act on. |
| D11 | **RESOLVED.** Persist only the extracted lines the parser view displays (~20-40), never the full text and never the file | `C Resume ATS` must render on a revisit, so some text has to be stored. Capping it at what the screen shows bounds the exposure and keeps the copy true without qualification: "we store the text we show you, never the file". |
| D12 | **RESOLVED.** Real fit on dynamic pages for users with a scan; no badge otherwise; **never on `/[slug]`** | Per-user fit must not be server-rendered into a shared cache — see section 13. `fitFor()` and the hash layer are deleted. |

## 3. Measured corpus facts

All figures from production (`jobboard`, read-only session) on 2026-09-19,
except where marked staging. These numbers are the basis for section 4; if they
move materially, revisit it.

### Scale
- 2,130,391 rows total; **685,959 live** (`status='success'`); 1,444,433 soft-deleted.
- Table is 12 GB: 1,881 MB heap, ~10 GB indexes and TOAST.
- Average description in the `Senior Software Engineer` cohort: 8,542 chars.
  (Staging sample overall: 5,064 chars.)

### What is unusable
- **`tags` is not skills.** 13.1% coverage on live jobs. Content is Workday
  metadata — top values are `Full time`, `Part time`, `Hybrid`, `On-Site`, and
  company names (`Bass Pro Outdoor World LLC`). Near-zero outside Workday,
  Jobicy, Himalayas and 4dayweek. The existing `skill_stats` table is therefore
  not a skills table despite its name, and must not be used as one.
- **`category_slugs` is clean but sparse.** A real 10-value taxonomy
  (`software-engineering-jobs`, `sales-jobs`, ...) present on only 14.3% of live
  jobs. Usable as a secondary signal, never as the primary one.

### What is usable
- **`canonical_title` has a usable head and an extreme tail.** 340,728 distinct
  values over live jobs, of which 283,959 are singletons — but 652 titles have
  >= 50 jobs, **143 have >= 200**, and 35 have >= 1,000. Largest cohorts:
  `Software Engineer` 8,038, `Project Manager` 7,906, `Account Executive` 6,859,
  `Senior Software Engineer` 3,633, `Product Manager` 3,589.
- **`description` is the strong signal.** Full-text ranking of a backend skill
  set inside the Senior Software Engineer cohort returned, in order:
  *Senior Software Engineer* (goguardian), *Senior Software Engineer,
  Intelligent Messaging* (attentive), *Senior Software Engineer, Backend*
  (pathai), *Cloud Gateway* (rivianvw.tech), *Platform* (loancrate).
- **Exact percentages are computable.** Of the 3,633-job cohort, 1,212 mention
  Kubernetes — 33.4%. No estimation, no dictionary.

### The performance constraint
Cost breakdown over the same 3,633-row cohort:

| step | time |
|---|---|
| count only | 313 ms |
| + detoast descriptions (31 MB) | 465 ms |
| + strip HTML | 913 ms |
| + `to_tsvector` | **5,955 ms** |

`to_tsvector` is 84% of the cost; detoasting is cheap. Computing it per request
is not viable at any cohort size. It must be precomputed — see section 6.

### Rejected on evidence
A curated skill dictionary over descriptions was tested and rejected. It works
for distinctive multi-char tokens but needs: HTML entity decoding (`C++` is
stored as `C&#43;&#43;`, `R&D` as `R&amp;D`, so `\yR\y` matches the wreckage of
`R&D` with 0% precision and `C\+\+` misses most real C++ mentions); context
rules for short tokens (`\yGo\y` matched the verb in 5 of 6 sampled cases);
boilerplate dedup (identical employer copy inflates counts); and thousands of
curated terms to cover a general job board (a 38-term dictionary reached only
23.7% of jobs). It is unnecessary because the resume supplies the query terms.

## 4. Architecture

The resume is one document, which an LLM reads well. The corpus is 685,959
documents, which SQL searches well. The split follows that line.

```
PDF ──> parse ──> [AI call 1] ──> skills, format faults, impact findings
                                        │
                                        v
                        cohort select (canonical_title, indexed)
                                        │
                                        v
                        text match within cohort (tsvector, indexed)
                                        │
                        ┌───────────────┴───────────────┐
                        v                               v
              [AI call 2] missing skills        exact SQL counts
              from top job descriptions         ("33.4% mention X")
```

### Modules

Scoring logic is pure and network-free wherever it produces a number the user
sees.

| module | responsibility | deps |
|---|---|---|
| `lib/resume/parse.mjs` | PDF buffer -> `{text, pages, lines, layout}` | `unpdf` |
| `lib/resume/format-checks.mjs` | layout -> Parse and Format subscores, format faults | **pure** |
| `lib/resume/extract.mjs` | AI call 1: resume -> skills, impact findings, prose | OpenRouter |
| `lib/resume/gaps.mjs` | AI call 2: top job descriptions -> skills the resume lacks | OpenRouter |
| `lib/resume/cohort.mjs` | title cohorts, text match, exact term counts | Postgres |
| `lib/resume/score.mjs` | combines all of the above -> the render shape | **pure** |
| `lib/resume/store.mjs` | persist scans and targets, derive quota | Prisma |
| `lib/resume/eval.mjs` | fixture resumes -> expected extractions, any model id | OpenRouter |

`score.mjs` takes every input as plain data and performs no IO, so the entire
scoring behaviour is table-testable.

### Why two AI calls, not one
Call 1 sees only the resume. Call 2 sees only job descriptions. Neither needs
the other's context, both are small, and call 2 can be skipped entirely if the
cohort is thin — degrading to a scan without gap analysis rather than failing.

## 5. Data model

Two new Prisma models in the shared schema.

```prisma
model ResumeScan {
  id        String   @id @default(cuid())
  userId    String
  filename  String
  pages     Int
  score     Int
  skills    String[]                      // the vector /matches ranks against
  result    Json                          // parts, issues, found, missing, prose
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  targets   ResumeScanTarget[]
  @@index([userId, createdAt])
}

model ResumeScanTarget {
  id             String     @id @default(cuid())
  scanId         String
  canonicalTitle String
  score          Int
  cohortSize     Int
  detail         Json                     // keyword shares for this cohort
  createdAt      DateTime   @default(now())
  scan           ResumeScan @relation(fields: [scanId], references: [id], onDelete: Cascade)
  @@unique([scanId, canonicalTitle])
  @@index([scanId, createdAt])
}
```

`ResumeScanTarget` is what makes the design's "Previous targets — Senior Backend
Engineer 72, Platform Engineer 68" real. Re-targeting already computes these
values; this records them instead of discarding them. The unique constraint
means re-selecting a previous title is a read, not a recompute.

Quota is `SELECT count(*) FROM "ResumeScan" WHERE "userId" = $1` (D8).

## 6. The index prerequisite — an ops gate

This is the only part that touches production infrastructure, and it gates
everything in section 4.

A precomputed `tsvector` over live job descriptions, with a GIN index.

Two requirements that are not optional:
- **Partial**: `WHERE status = 'success'`. 68% of the table is soft-deleted; a
  partial index is roughly a third the size.
- **`CREATE INDEX CONCURRENTLY`**: this is a live 12 GB table in a database
  shared with the main leads product. A plain `CREATE INDEX` locks writes.

Estimated cost: ~2–3 GB for the tsvector, ~1–2 GB for the index, and a long
initial build. The expression stored must match the query expression exactly or
the planner will ignore the index.

Population belongs in the existing import pipeline. Note that
`refreshAggregates()` in `scripts/publish-jobs.mjs:42` runs one transaction that
`TRUNCATE`s eight tables, taking `ACCESS EXCLUSIVE` locks for its duration — new
work must **not** be added to that transaction.

**This requires a go/no-go from the operator before the feature branch can
complete.** Plan the work so everything else is verifiable without it.

## 7. Model configuration

`lib/ai/openrouter.mjs` keeps its `ok:false` contract and its existing tests, and
gains `response_format`, `temperature`, `seed`, `reasoning_effort` and
`provider`.

| setting | value | why |
|---|---|---|
| model | `deepseek/deepseek-v4-flash` | $0.046/M in, $0.093/M out — ~$0.36 per 1,000 scans |
| `temperature` | `0` | the same resume must score the same twice |
| `seed` | fixed | reproducibility alongside temperature |
| `response_format` | `json_schema`, `strict: true` | the model supports `structured_outputs`; otherwise we are regexing JSON out of prose |
| `reasoning_effort` | pinned low | reasoning tokens bill at the completion rate; unpinned they multiply output cost |
| `provider` | `data_collection: "deny"` | the payload is CV text |

## 8. Error handling

**The rule is never half-score.** A partially-scored resume is worse than a
failed one because the user acts on it.

- AI failure, schema-invalid JSON, or parse failure: **no row written, no quota
  consumed**, and the user is told which it was.
- Quota is consumed only on a persisted success.
- `C Resume Errors` in the design carries the four states. The outage card's
  green "No scan used" tag is a literal promise the implementation must keep.
- An image-only PDF is **a finding, not an error**: if we cannot extract text,
  no ATS can either. It is reported as the most valuable thing we can tell that
  user, and it does not consume a scan.

## 9. Screens

From `direction-c.html`. Existing screens unchanged except `C Resume ATS`.

| screen | route/state |
|---|---|
| `C Resume Upload` | `/resume`, no scan yet |
| `C Resume Scanning` | during the blocking request |
| `C Resume ATS` | `/resume` with a completed scan |
| `C Resume Errors` | four failure states |
| `C Resume Signed Out` | `/resume` when logged out |
| `C Resume Retarget` | title changed, right column recomputing |
| `C Matches Empty` | `/matches`, no scan yet |
| `C Upgrade` | quota exhausted (already existed) |
| `C Mobile Resume` | phone upload and scanning |

Limits: PDF only, <= 2 MB, <= 10 pages. Both routes stay `robots: "noindex"` and
absent from `app/sitemap.js`.

### Deviations from the mock, with reasons

| mock says | we ship | why |
|---|---|---|
| "rendered resume page with flagged regions highlighted" | extracted-text view, problem lines highlighted | PDF-to-image rendering is not viable on serverless — and showing what a parser actually reads is the product promise |
| "We will email you if it takes longer than a minute" | removed; "usually takes 10 to 20 seconds" retained | a synchronous request cannot email on timeout (D9) |
| "Safe to close the app. We will notify you" (mobile) | removed | same, and stronger — it implies push |
| "Delete the file any time from your account" | "delete your scan" | we never store the file (D3); promising deletion of what we do not keep is the wrong kind of wrong |
| "Import from Files or Drive" | native file picker only | Drive integration is a separate feature |
| "Notify me when it is back" | removed | needs a notification store |
| "How to shrink a PDF" / "Why this matters" | removed | link to help pages that do not exist |
| "score it against every live Senior Backend Engineer posting" (scanning) | title dropped from the copy | the title is inferred *from* the resume, so it is unknown while scanning |
| "Senior Backend Engineer · 214 postings" | real cohorts from `canonical_title` >= 200 live jobs | the specific title does not exist in the corpus; `Senior Software Engineer` (3,633) does |
| "rank all 128,431 live roles" | "ranked against N live <title> postings", N real | ranking a backend resume against Technical Writer is noise; the mock's own Low bucket demonstrates it |

`Upload revised` keeps the confirm modal the updated design added — it costs one
of three scans, and users will not expect that.

## 10. Testing

Extends the existing plain-`node` convention (`node scripts/test-*.mjs` with
`node:assert/strict`, registered in `package.json`). No new test runner.

| suite | covers |
|---|---|
| `resume-parse` | fixture PDFs: normal, image-only, oversized, DOCX rejection |
| `format-checks` | pure, table-driven: each format fault and its subscore |
| `resume-score` | pure, table-driven: assembly of parts, issues, percentages |
| `resume-cohort` | cohort selection and exact-count SQL (needs a database; skips cleanly without) |
| `resume-store` | quota derivation, target upsert, no-write-on-failure |
| `openrouter` | existing three-legged `ok:false` contract, extended for new params |
| `resume-eval` | fixture resumes against any model id — the D7 harness |

Route contract tests stub `fetch`, as `scripts/test-openrouter.mjs` already does.

Two testing rules carried from the previous effort:
- Assertions must fail when the thing under test is reverted. Vacuous needles
  (a selector that also matches an unrelated rule) are defects.
- A module's test must be able to pass that module in isolation — watch ESM
  cache-busting when a module imports a second one whose state matters.

## 11. Out of scope

Pro tier and payments (`C Upgrade` stays presentational), auto-apply, cover
letters, the Queue button, alerts, Drive import, notification signup, help
content pages, and DOCX support.

## 12. Open risks

| risk | handling |
|---|---|
| The index build is large and touches shared production infrastructure | Explicit ops go/no-go (section 6). Everything else must be verifiable without it. |
| `deepseek-v4-flash` quality is unproven for this task | The eval harness (D7) makes it measurable and the model swappable in one line. |
| Inferred title may land outside the >= 200 cohort set | Fall back to the nearest qualifying cohort or to category, and show the thin-cohort warning the design already draws. |
| `canonical_title` excludes `'Other'` in `title_stats` (`publish-jobs.mjs:91`) | Explicit fallback path; never a blank screen. |
| Filename contains the user's real name | Stored (the UI displays it) but user-deletable, and covered by the same delete action as the scan. |
| 1.44M soft-deleted rows inflate every full-table operation | All new queries filter `status='success'`; the new index is partial. |


## 13. Resolved decisions (D11, D12)

Both surfaced by the spec self-review and ruled on 2026-09-19.

### D11 — parser view text: store only what is displayed

`C Resume ATS` shows the extracted text with problem lines highlighted, and the
screen must survive a revisit — so text must be persisted, contradicting D3 as
originally taken. **Ruling: store only the lines the view renders** (contact
block, section headings, flagged bullets — roughly 20-40 lines), in the scan's
`result` JSON.

Rejected: storing the full extracted text (puts complete CVs in a database
shared with the leads product, for a benefit — paging the whole document — the
screen does not offer); storing nothing (breaks the screen as designed).

Consequence for copy: the upload screen's "Good to know" block and the account
delete action both say **"we store the text we show you, never the file"**. The
design's "Delete the file any time from your account" was already being reworded
to "delete your scan" (section 9); that wording remains correct.

### D12 — site-wide fit: real where possible, absent where not

`NEXT_PUBLIC_DEMO_FIT` reaches beyond these two screens, driving the fit badge on
every job card, the preview banner, the fit sort, the header pips and the hero
copy variant.

**Ruling: populate `job.fit` with real scores for signed-in users who have a
scan; render no badge for everyone else; delete `fitFor()` and the hash layer.**

`components/JobCard.jsx` already accepts `job.fit` and falls back to `fitFor()`
only because no scorer existed — its own comment says so. The work is to
populate the field and remove the fallback.

**Where fit may appear, decided by rendering mode:**

| page | mode | fit badge |
|---|---|---|
| `/` | `force-dynamic` | yes — server-injected |
| `/search` | `force-dynamic` | yes — server-injected |
| `/matches` | `force-dynamic` | yes — it is the point of the screen |
| `/[slug]` | **`revalidate = false`** | **no — never** |

`/[slug]` is excluded on correctness, not performance. It is a permanently
cached public page across 685,959 jobs; server-rendering a per-user judgement
into it would place one user's profile-derived fit in a shared cache and serve
it to every subsequent visitor. Client-side decoration after hydration was
considered and deferred — it is a separate mechanism, and the detail page is not
where this feature earns its value.

Consequences to carry into the plan:
- `lib/demo-fit.js` is deleted. `FIT_LABEL` and the tier vocabulary move to the
  real scoring module; `fitFor()`, `bannerFor()`, `DEMO_SCANS_USED` and
  `DEMO_QUOTA` go away.
- `lib/demo-resume.js` is deleted once `/resume` renders real scans.
- `components/DemoDisclosure.jsx` is removed from both screens — nothing on
  them is demo content any more — and the component deleted if unused.
- `components/DemoOffPanel.jsx`'s role changes: the honest-degradation case is
  no longer "the demo switch is off" but "you have not scanned yet", which is
  what `C Matches Empty` and `C Resume Upload` already draw. Reuse those.
- `components/Filters.jsx` fit sort is enabled only when the viewer has a scan.
- `components/AuthNav.jsx` pips read the real derived quota (D8).
- `NEXT_PUBLIC_DEMO_FIT` is retired entirely.

Fallback if populating `job.fit` on `/` and `/search` proves more invasive than
expected: strip the fit layer outright (the option B considered above) rather
than keep hash-derived badges. Fabricated fit must not survive this work.
