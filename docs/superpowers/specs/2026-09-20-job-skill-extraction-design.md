# Job-Side Skill Extraction — Design

**Date:** 2026-09-20
**Status:** awaiting review
**Replaces:** full-text description search in `lib/resume/match.mjs`; `jobs.tags` as the source of `skill_stats`

---

## 1. Problem

`/jobs/matches` ranks postings by full-text searching the resume's skills against
`jobs.description_tsv`. Two defects follow from that:

1. **Wrong denominator.** Overlap is measured against the *resume's* skill count
   (`bucketByOverlap(rows, skills.length)`), so a posting is penalised for not
   mentioning skills it never asked for. A job needing 6 skills the candidate has
   5 of ranks below a job that name-drops 8 unrelated technologies.
2. **Unweighted.** Matching "communication" counts exactly as much as matching
   "Kubernetes".

The structural cause is that **no job in the corpus has a usable skill list.**

### Measured state of `jobs.tags` (production, read-only, 2026-09-20)

Live jobs: **691,083**. Live jobs with any tag: **92,283 (13%)**.

`skill_stats` — built from `tags` by `scripts/publish-jobs.mjs:98` and serving the
site's skill autocomplete (`lib/jobs.js:675`) — holds **12,321 rows**, of which the
top 15 contain **zero skills**:

| "skill" | jobs |
|---|---|
| Full time | 71,244 |
| Part time | 12,156 |
| Hybrid | 3,558 |
| Bass Pro Outdoor World LLC | 2,454 |
| Onsite | 2,289 |
| A&F Stores, Inc. | 1,880 |

Tag coverage by source confirms the bulk of the corpus contributes nothing:
smartrecruiters 192,546 / 0%; greenhouse 116,318 / 0%; icims 113,261 / 0%;
ashby 40,729 / 0%; lever 29,027 / 0%; workday 85,129 / 100% but metadata-only.

### Why not per-job LLM extraction

~$130 one-time over 690k jobs plus ~$78–200/month ongoing, and non-deterministic:
the same posting can yield different skills on re-run, so ranking would drift
without any code change. Rejected on both counts.

### The opening

Measured over the 690,981 live postings that have a description:

| signal | jobs | share |
|---|---|---|
| JSON-LD `<h2>Qualifications</h2>` section | 234,930 | 34% |
| any requirements-style heading | 568,438 | **82%** |
| requirement phrasing in the body | 298,351 | 43% |

82% of postings already **label** their requirements. Extraction targeted at that
block is a different signal-to-noise problem from scanning 5,000 characters of
mixed marketing prose — which is why a vocabulary approach is viable here and was
not viable against whole descriptions.

---

## 2. Approach

Five stages. Exactly one uses an LLM, exactly once.

| stage | what | LLM | cost |
|---|---|---|---|
| 1 | Sample ~2,000 live jobs → canonical skill vocabulary + aliases | yes, once | ~$0.38 |
| 2 | Locate the requirements section in a description | no | $0 |
| 3 | Match vocabulary against that section | no | $0 |
| 4 | Persist to `job_skills`; rebuild `skill_stats` from it | no | $0 |
| 5 | Rank against `job_skills` with IDF weighting | no | $0 |

**Ongoing cost: $0.** Re-sampling the vocabulary to pick up new technologies costs
$0.38 and is a quarterly manual run, not a scheduled job.

### Which repo

**All of it in the jobs repo.** `scripts/publish-jobs.mjs` already owns every
table derived from `jobs` — `companies`, `title_stats`, `location_stats`,
`country_stats`, `skill_stats`. The scraper writes raw rows; this repo derives.
Job skills are derived data.

Two further reasons: a backfill over 690k existing postings is required wherever
incremental extraction lives, so the batch pass is the load-bearing component; and
the consumer (`lib/resume/match.mjs`) is here.

**The scraper repo gets one change, later and independently:** eight-plus scrapers
already parse JSON-LD and none of them read `ld_job.get("skills")`. That is free
publisher-declared signal, but it only improves *newly scraped* jobs, so it does
not block this work and is out of scope for this spec.

---

## 3. Data model

One new table. `skill_stats` already exists and is repointed.

```sql
CREATE TABLE IF NOT EXISTS job_skills (
  job_md5 VARCHAR(32)  NOT NULL,
  skill   VARCHAR(120) NOT NULL,
  source  VARCHAR(12)  NOT NULL,   -- 'jsonld' | 'section' | 'body'
  PRIMARY KEY (job_md5, skill)
);
CREATE INDEX IF NOT EXISTS idx_job_skills_skill ON job_skills (skill);
```

`job_md5` references `jobs.apply_url_md5`, matching how `job_locations.job_md5`
already joins (`publish-jobs.mjs:74`). No FK constraint, consistent with
`job_locations`.

`source` is the confidence tier — `jsonld` (publisher-declared) >
`section` (found under a requirements heading) > `body` (whole-description
fallback, the ~18% with no heading). No separate numeric confidence column:
nothing would consume it.

### `skill_stats` becomes the IDF source

`skill_stats(skill, job_count)` over live jobs **is** document frequency. Rebuilding
it from `job_skills` therefore serves both the public autocomplete and the ranking
weight, so no separate `job_skill_df` table is needed.

`publish-jobs.mjs:98` changes from:

```sql
INSERT INTO skill_stats (skill, job_count)
SELECT BTRIM(skill), COUNT(DISTINCT j.db_id)
FROM jobs j CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(j.tags,'[]'::jsonb)) AS tag(skill)
WHERE j.status='success' AND BTRIM(skill) != ''
GROUP BY BTRIM(skill)
```

to:

```sql
INSERT INTO skill_stats (skill, job_count)
SELECT js.skill, COUNT(*)
FROM job_skills js
JOIN jobs j ON j.apply_url_md5 = js.job_md5
WHERE j.status = 'success'
GROUP BY js.skill
```

`skill_stats` stays in the existing `TRUNCATE` list, so the rebuild is atomic
within the transaction that already exists.

**There are two rebuild paths, and both must change.** `rebuild_stats()` in
`scripts/import_to_postgres.py:833` runs the identical `tags` query, and
`npm run db:schema` invokes it — AGENTS.md names that as the standard way to
regenerate aggregates. Repointing `publish-jobs.mjs` alone would be undone by the
next `db:schema` run. Both get the same new query and the same empty-table guard
below.

#### Deploy hazard: the repoint must not run before the backfill

`publish-jobs.mjs` `TRUNCATE`s `skill_stats` before rebuilding it. If the
repointed query ships to production while production's `job_skills` is still
empty — which it will be, since this spec backfills staging only — the next
publish run **empties `skill_stats` and takes the site's skill autocomplete to
zero rows.** That is the same shape as the `db:push` hazard: correct code,
destructive ordering.

Guard in code, not in a runbook. The rebuild is skipped, leaving the existing
rows untouched, whenever `job_skills` is empty:

```sql
-- inside refreshAggregates(), before the TRUNCATE list is applied to skill_stats
SELECT EXISTS (SELECT 1 FROM job_skills LIMIT 1) AS ready
```

When `ready` is false the script logs that `skill_stats` was left as-is and
excludes it from the `TRUNCATE`. Production's autocomplete therefore keeps its
current (poor) rows until a production backfill is deliberately run, and can
never be silently emptied by a deploy.

### Database safety

All DDL and all writes target the **Aiven staging** database. Every script
re-checks the resolved host itself and aborts if it is not the staging host —
the guard pattern `scripts/migrate-resume-tables.mjs` already uses. **No
production DB change.** Production is read-only for measurement only.

The `publish-jobs.mjs` change is a *code* change that lands in this repo. When it
takes effect in production is a separate deploy-and-backfill decision that is
yours, not part of this work.

Volume: ~8 skills/job × 690k jobs ≈ **5.5M rows** at production scale. Staging
holds 5,000 jobs, so ~40k rows there.

---

## 4. Stage 1 — Vocabulary build (one-time, LLM)

`scripts/build-skill-vocab.mjs`, run manually, output committed to git.

**Sample:** ~2,000 live jobs with a description, stratified by `source`
proportionally to the measured mix (smartrecruiters 192,546 … remotive 18), so no
single ATS's phrasing dominates the vocabulary. Deterministic selection by
`ORDER BY md5(apply_url_md5)` so the sample is reproducible.

**Per job:** run stage 2 to get the requirements section, send only that section to
the model. Reuses `lib/ai/openrouter.mjs` and the model already chosen in
`lib/resume/model.mjs` (`google/gemini-2.5-flash-lite`, `seed: 1729`), with a strict
`json_schema` response format returning `{ skills: [{ name, canonical }] }`.

**Aggregate:** count each canonical form across the sample; keep those appearing in
**≥ 3 sampled jobs** (noise floor — a one-off misreading cannot enter the
vocabulary). Build the alias map from every surface form that mapped to a kept
canonical.

**Output:** `lib/skills/vocab.json` —

```json
{
  "version": 1,
  "builtAt": "2026-09-20",
  "sampleSize": 2000,
  "skills": [
    { "canonical": "Kubernetes", "aliases": ["Kubernetes", "K8s"], "sampleCount": 214 },
    { "canonical": "Go", "aliases": ["Go", "Golang"], "sampleCount": 96 }
  ]
}
```

Committed, diffable, reviewable. A vocabulary change is a visible code change.

---

## 5. Stage 2 — Requirements section (pure)

`lib/skills/sections.mjs`, exporting `requirementsSection(html)` →
`{ text, source }` where `source` ∈ `jsonld | section | body`.

Resolution order:

1. **`jsonld`** — the `<h2>Qualifications</h2>` block `icims_scraper.py:446` welds
   into the description. Text from that heading to the next heading of the same or
   higher level. 34% of postings.
2. **`section`** — any requirements-style heading: `<h1>`–`<h4>`, `<strong>`,
   `<b>`, or an all-caps standalone line, whose text matches
   `/qualifications|requirements|what you(?:'| a)?.{0,20}(bring|need|have)|skills|who you are|about you|experience required|minimum|preferred/i`.
   Multiple matching sections are concatenated. Brings the total to 82%.
3. **`body`** — the whole description, tag-stripped. The remaining ~18%, recorded
   as lower confidence rather than silently treated as equivalent.

Pure and HTML-only: no DB, no network, fully unit-testable against fixture strings.

---

## 6. Stage 3 — Extraction (pure)

`lib/skills/vocab.mjs` builds an alias index once per process;
`lib/skills/extract.mjs` exports `extractJobSkills(text, index)` → `string[]` of
canonical skills.

Matching rules, each one a test case:

- **Word-boundary only.** Alias regexes are escaped and anchored with `\b`-
  equivalent guards, so "Java" never matches inside "JavaScript".
- **Longest alias first, span consumed.** "React Native" matches before "React"
  and removes its span, so one mention does not yield two skills.
- **Short aliases are case-sensitive.** Aliases of length ≤ 2 ("C", "R", "Go")
  match only with exact case and only when delimited by non-word characters other
  than `+`, `#`, `.` — the same hazard `lib/resume/match.mjs:100` documents
  handling on the resume side.
- **Deduped**, canonical forms only.

---

## 7. Stage 4 — Batch extraction

`scripts/extract-job-skills.mjs`. Cursors over live jobs with a description in
batches of 500, runs stages 2–3, bulk-upserts into `job_skills`. Idempotent
(`ON CONFLICT DO UPDATE` on `source`), resumable, prints before/after row counts.
Staging-host guard as in §3.

Incremental runs process only jobs with no `job_skills` rows, so the same script
serves both the backfill and the ongoing pass.

---

## 8. Stage 5 — Matching rewrite

`lib/resume/match.mjs` joins `job_skills` instead of searching `description_tsv`.

**Score.** For job `J` with extracted skills `S_J` and resume skills `S_R`:

```
idf(s)   = ln( N / df(s) )          N = live job count, df from skill_stats
coverage = Σ idf(s) for s ∈ S_J ∩ S_R  /  Σ idf(s) for s ∈ S_J
```

The denominator is **the job's own requirements**, which is the defect in §1.1:
a job is now scored on how much of what it asked for the candidate has, and is
never penalised for skills it did not ask for. IDF weighting makes a Kubernetes
match outweigh a "communication" match, since `df` for the latter is large.

**Thin-job guard.** `MIN_JOB_SKILLS = 3`. A posting with one or two extracted
skills would reach coverage 1.0 trivially, so it cannot enter the Strong bucket.

**Thresholds.** Provisionally `STRONG_COVERAGE = 0.60`, `GOOD_COVERAGE = 0.35`.
These replace the current 0.25/0.10, which were calibrated against the wrong
denominator and do not carry over. Implementation **must** calibrate them against
the staging coverage distribution and record the measured percentiles; if the
distribution says otherwise, the constants change and the spec is amended.

**`matchReason` rewrite.** Today it reports the first *resume* skill a posting
lacks, which is noise — "missing Kubernetes" on a job that never wanted it. It
becomes a readout of the job's requirements:

> `Covers 5 of 7 requirements · missing Terraform, Kafka`

with missing skills ordered by IDF descending, so the named gaps are the ones that
actually cost the candidate the match. Still no percentage.

**Performance.** The current page takes ~8s. Ranking becomes an indexed join on
`idx_job_skills_skill` against a bounded skill list instead of a full-text scan,
which should remove the dominant cost. Measured before/after on staging; if it
does not land under 2s the task investigates rather than reporting success.

---

### 8.1 Deduplication (added 2026-09-26)

Measured on staging: test@test.com's top 300 ranked rows are 257 distinct roles. Every duplicate
group comes from a single source, and most have *different* descriptions — the same role posted
per location (Dialpad ×5 across Denver, Austin, …), not scraper double-counting.

- **Key:** `company_slug` (falling back to lower-cased `company`) + the title lower-cased with every
  run of non-alphanumerics collapsed to one space. A row with no company or an empty title key (a
  title in a non-Latin script) is never merged.
- **Merge:** the highest-ranked row represents the group; the others' locations are appended to its
  `locations` (order kept, no repeats) and `postingCount` records the group size.
- Applied after ranking, before tiering, on `/jobs/matches` only. The header count is distinct
  roles. The reason line gains `· N postings` when N > 1.

## 9. Files

**Create**

| path | responsibility |
|---|---|
| `lib/skills/sections.mjs` | pure — locate the requirements block |
| `lib/skills/vocab.mjs` | pure — load vocab, build alias index |
| `lib/skills/vocab.json` | the vocabulary (generated, committed) |
| `lib/skills/extract.mjs` | pure — match vocabulary against text |
| `scripts/build-skill-vocab.mjs` | stage 1, LLM, manual |
| `scripts/extract-job-skills.mjs` | stage 4 batch, staging-guarded |
| `scripts/add-job-skills-table.mjs` | additive DDL, staging-guarded |
| `scripts/test-skills-sections.mjs` | unit |
| `scripts/test-skills-vocab.mjs` | unit |
| `scripts/test-skills-extract.mjs` | unit |
| `scripts/fixtures/job-descriptions/*.html` | real postings, redacted |

**Modify**

| path | change |
|---|---|
| `lib/resume/match.mjs` | join `job_skills`, IDF coverage, new `matchReason` |
| `components/MatchesList.jsx` | render requirement-based reason lines |
| `scripts/publish-jobs.mjs:98` | rebuild `skill_stats` from `job_skills` |
| `scripts/import_to_postgres.py:833` | same repoint in `rebuild_stats()`, same guard |
| `scripts/verify-db.mjs:18` | add `job_skills` to the expected-tables list |
| `package.json` | register the three suites and two scripts |

---

## 10. Verification

- **Unit tests** per pure module, plain `node` + `node:assert/strict`, matching the
  existing convention. No Jest, no Vitest.
- **Fixtures are real postings**, pulled from production read-only and redacted —
  the resume work proved that synthetic fixtures passed while the real thing failed.
  At least one fixture per `source` tier (`jsonld`, `section`, `body`).
- **Held-out precision check.** 200 live jobs deliberately excluded from the
  vocabulary sample; extracted skills hand-checked. Precision and recall reported
  as numbers, not adjectives. This is the acceptance gate for stage 3.
- **End-to-end**, staging: the real redacted resume through `/jobs/matches`,
  before/after ranking and page latency both recorded.
- **`skill_stats` sanity**: after the repoint, the top 15 rows must contain no
  employment types and no company names — the exact failure in §1.

## 11. Out of scope

- Any production database write.
- The scraper-side `ld_job.get("skills")` change (separate, additive, later).
- Seniority, years-of-experience, location or salary matching.
- Re-scoring the resume side — `lib/resume/extract.mjs` is unchanged.

## 12. Plan-time decisions (2026-09-26)

Each was forced by staging data while the plan was validated; the spec text above is otherwise
unchanged.

1. **Sections are found on normalised text lines, not HTML tags.** Greenhouse stores HTML
   entity-escaped (`&lt;h2&gt;`), lever stores plain text with `•` bullets. `<h1>`–`<h6>` and ALL-CAPS
   lines are *hard* headings (they set the state); whole-line bold, colon-ended and keyword lines are
   *soft* (they turn requirements on, or off only for a clearly different section). Measured 76.3% of
   9,863 staging descriptions targeted; §1's 82% was a looser production regex. The `jsonld` block is
   mostly smartrecruiters, not icims.
2. **A requirements section with no vocabulary skills falls back to the whole description**, tier
   `body` (e.g. oraclecloud postings whose "Qualifications" lists only degrees).
3. **The vocabulary is `lib/skills/vocab-data.mjs`, an ES module, not `vocab.json`:** a JSON import
   resolves differently under plain `node` and Next's bundler — the same reason `match.mjs` keeps its
   own pool.
4. **Aliases are the surface forms postings actually use** (a model-reported name is kept only if it
   occurs literally in the text it read), matched by class: aliases with a digit or `+#./`, or 8+
   characters, case-insensitive; other 3–7 letter aliases exact-case (so `SAFe` never matches "safe");
   1–2 character aliases only when they are the skill's own name (Go, R, C, C#) and not a US,
   Canadian or Indian state or time-zone code (the v1 vocabulary mapped `CA`, `CO`, `MI` and `1+` to
   skills, which every "Denver, CO" and "1+ years" would have matched). Excluded aliases still map a
   resume's discrete skill list. Ordering uses code units, so the generated file is identical on
   every machine.
5. **The sample is drawn from staging** (`DATABASE_URL`, itself a production sample), keeping
   `seed-from-prod.mjs` the only production reader, as AGENTS.md requires.
6. **A second table, `job_skill_scans(job_md5, vocab_version, source, skill_count, scanned_at)`,** so a
   job with zero skills is not re-read on every incremental run, and bumping the vocabulary version
   re-scans everything.
7. **`skill_stats` falls back to the original `jobs.tags` query** when `job_skills` is missing or holds
   nothing for live jobs — never emptied, never left stale. The table-existence check runs first
   because production has no `job_skills` table: an unguarded query would throw and roll back every
   publish.
8. **IDF is smoothed, `ln(1 + N/df)`,** so a skill present in every job still weighs more than zero;
   `N` is `site_metrics.total_jobs` rather than a per-request `count(*)`.
9. **Ordering is `match_rank = coverage × n/(n+2)`,** n = the job's skill count — as if every job
   listed two more skills the resume lacks — while tiers still use raw coverage plus the thin-job
   guard. The prototype's n/(n+1) was tuned on a 55-skill vocabulary; with vocabulary v2 jobs average
   ~5 skills and 2-skill jobs at 100% still took the top slots.
10. **Scraper gaps found, out of scope here:** 272 of 275 breezy descriptions on staging are page-template
    placeholders (`%BUTTON_APPLY_TO_POSITION%`); lever stores only the intro paragraphs and drops the
    `lists` field where requirements live (381 of 385 lever fallbacks never mention requirements).
    Both need scraper fixes; extraction yields nothing for them.

