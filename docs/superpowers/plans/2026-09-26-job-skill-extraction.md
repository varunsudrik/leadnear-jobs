# Job-Side Skill Extraction — Implementation Plan (short form)

**Spec:** `docs/superpowers/specs/2026-09-20-job-skill-extraction-design.md` (§12 records the
decisions below). **Branch:** `feat/resume-matching`. Short form by request: tasks, files, order and
acceptance checks. The code itself was prototyped and validated against the 9,863 live staging jobs
before this plan was written, so each task moves tested code into the repo rather than designing it.

## Global constraints

- Writes go to the Aiven staging database only; every writing script calls `requireStagingDatabase()`.
  Production is never read by new code (`scripts/seed-from-prod.mjs` stays the only reader).
- Never run `npm run db:push`, or `npm run db:seed` without `--country` (it clears `job_locations`).
- Tests are plain `node scripts/test-*.mjs` with `node:assert/strict`, registered in `package.json`.
  Scripts that need a database are `*:check`, not `*:test`.
- No new dependencies. One commit per task; `npm run lint` and every suite green before each commit.

## Measured during planning (staging, 2026-09-26)

| what | result |
|---|---|
| descriptions given a targeted requirements section | 7,530 / 9,863 = **76.3%** |
| extraction speed | 0.07 ms/job (690k jobs ≈ 1 min CPU) |
| ranking query (TEMP tables, 10k jobs) | 17 ms server execution |
| dedupe on test@test.com's top 300 | 300 → 257 distinct roles |

## Tasks

| # | deliverable | files | acceptance |
|---|---|---|---|
| 1 | Requirements-section finder | `lib/skills/sections.mjs`; `scripts/test-skills-sections.mjs`; 7 real fixtures + export script | `skills-sections:test` green: 7 fixtures pinned (smartrecruiters ×2, greenhouse escaped, lever plain text, workday split bullets, breezy placeholder, oraclecloud inline heading) |
| 2 | Vocabulary index + extractor | `lib/skills/{vocab,extract}.mjs`, `vocab-data.mjs` (empty v0); `scripts/test-skills-extract.mjs` | `skills-extract:test` green: short-token rules (Go/R/C), boundaries, longest match, casing, zero-skill fallback |
| 3 | Vocabulary build (one LLM pass, ~$0.20–0.40) | `lib/skills/vocab-build.mjs`; `scripts/build-skill-vocab.mjs`; `scripts/test-skills-vocab-build.mjs`; `.gitignore` | test green; `npm run skills:vocab` writes `vocab-data.mjs` v1 + `scripts/fixtures/skill-vocab-sample.json`; failures ≤ 5% |
| 4 | Tables + batch extraction | `lib/staging-guard.mjs`; `scripts/add-job-skills-tables.mjs`; `scripts/extract-job-skills.mjs`; `scripts/verify-db.mjs` | migrate idempotent (2nd run +0); every live job gets a `job_skill_scans` row; re-run with no changes processes 0 jobs |
| 5 | `skill_stats` from `job_skills`, both rebuild paths | `lib/skills/skill-stats.mjs`; `scripts/publish-jobs.mjs`; `scripts/import_to_postgres.py`; `scripts/rebuild-skill-stats.mjs`; `scripts/check-skill-stats.mjs` | `skill-stats:check` green (populated → job_skills; empty → tags; table missing → tags, no error); `db:schema` logs `from job_skills`; top 15 has no employment types or company names |
| 6 | Matching rewrite | `lib/resume/match.mjs`; `scripts/test-resume-match.mjs`; `app/matches/page.jsx`; `components/MatchesList.jsx` | `match:test` green; reason lines read "Covers N of M requirements · missing X, Y" |
| 7 | Dedupe postings | `lib/resume/match.mjs`; `scripts/test-resume-match.mjs`; `components/MatchesList.jsx` | tests pin merge key, location union, Hindi-title non-merge; no duplicate (company, title) cards |
| 8 | Evaluation + end to end | `scripts/eval-job-skills.mjs`; `scripts/smoke-matches.mjs`; spec §10 results | precision ≥ 0.80 vs per-job LLM on 200 held-out jobs (numbers recorded); thresholds checked; page 200 in < 2 s on second load |

Order is strict: 3 needs 1–2; 4 needs 3's vocabulary; 5's check needs 4's data; 6 needs 4–5; 8 needs all.
