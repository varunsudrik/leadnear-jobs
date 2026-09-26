// lib/resume/match.mjs — resume-to-job ranking against extracted job skills
// (docs/superpowers/specs/2026-09-20-job-skill-extraction-design.md, §8).
//
// Same split as the rest of lib/resume/*: SQL/IO lives only in rankJobs() and
// attachLocations() below. Everything else is pure and covered by
// scripts/test-resume-match.mjs.
//
// This module manages its own small pg pool via lib/pg-config.mjs rather than
// importing lib/jobs.js / lib/db.js: those use extensionless imports and
// "next/cache", which only resolve inside Next's bundler, and every
// lib/resume/*.mjs module has to stay runnable under plain `node` for the
// `node scripts/test-*.mjs` convention.
import pg from "pg";
import { buildPgConfig } from "../pg-config.mjs";
import { canonicalizeSkills, getIndex } from "../skills/vocab.mjs";

const { Pool, types } = pg;
// Same two type parsers lib/db.js registers, so db_id (bigint) and the
// salary_* (numeric) columns come back as JS numbers, matching what
// lib/format.js and JobCard assume. Registration is global to `pg`, so this is
// a no-op in a Next.js request where lib/db.js already ran it.
types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);

const globalStore = globalThis;
function getPool() {
  if (!globalStore._resumeMatchPgPool) {
    const pool = new Pool(buildPgConfig());
    pool.on("error", (err) => {
      console.error("resume match pg pool idle client error", err);
    });
    globalStore._resumeMatchPgPool = pool;
  }
  return globalStore._resumeMatchPgPool;
}

async function query(sql, params = []) {
  const { rows } = await getPool().query(sql, params);
  return rows;
}

// Mirrors lib/jobs.js's attachLocations, minimally, so JobCard's
// `job.locations` has something to render.
async function attachLocations(jobs) {
  if (!jobs.length) return jobs;
  const md5s = jobs.map((j) => j.apply_url_md5).filter(Boolean);
  if (!md5s.length) return jobs;
  const locs = await query(
    `SELECT job_md5, location_slug FROM job_locations WHERE job_md5 = ANY($1) AND location_slug != ''`,
    [md5s]
  );
  const map = {};
  for (const l of locs) {
    if (!map[l.job_md5]) map[l.job_md5] = [];
    if (!map[l.job_md5].includes(l.location_slug)) map[l.job_md5].push(l.location_slug);
  }
  return jobs.map((j) => ({ ...j, locations: map[j.apply_url_md5] ?? [] }));
}

// ─── Tuning knobs ──────────────────────────────────────────────────────────
// Tier comes from *coverage*: the IDF-weighted share of the job's own listed
// skills that the resume has. The denominator is the job's requirements, not
// the resume's skills, so a posting is never marked down for skills it did not
// ask for.
//
//   STRONG — the resume covers at least 60% of what the job asks for (by
//            weight), and the job lists at least MIN_JOB_SKILLS skills.
//   GOOD   — at least 35%.
//   LOW    — everything else.
//
// Provisional: scripts/eval-job-skills.mjs --calibrate reports the measured
// distribution these must be checked against (spec §8).
export const STRONG_COVERAGE = 0.6;
export const GOOD_COVERAGE = 0.35;
// A job listing one or two skills reaches coverage 1.0 trivially, so it can be
// Good at most.
export const MIN_JOB_SKILLS = 3;
// How many of a job's unmatched skills the reason line names.
export const MISSING_SHOWN = 2;
// Ceiling on ranked rows fetched per request, before deduplication.
export const DEFAULT_LIMIT = 300;

// Ranks every live job sharing at least one skill with the resume.
//   idf(s)     = ln(1 + N / df(s)); N = site_metrics.total_jobs, df from
//                skill_stats (rebuilt from job_skills). Smoothed so a skill in
//                every job still weighs > 0.
//   coverage   = Σ idf(matched) / Σ idf(all of the job's skills)
//   match_rank = coverage × n/(n+2), n = the job's skill count — as if every
//                job listed two more skills the resume lacks, so evidence
//                counts: a 2-skill job at 100% scores 0.50, a 6-skill job at
//                80% 0.60, an 11-skill job at 86% 0.73. (n/(n+1) still let
//                2-skill jobs lead once real jobs averaged ~5 skills.)
const RANK_SQL = `
  WITH params AS (
    SELECT GREATEST(COALESCE((SELECT total_jobs FROM site_metrics WHERE id = 1), 0), 1)::float8 AS n
  ),
  candidates AS (
    SELECT DISTINCT job_md5 FROM job_skills WHERE skill = ANY($1::text[])
  ),
  weighted AS (
    SELECT js.job_md5, js.skill,
           ln(1 + p.n / GREATEST(COALESCE(ss.job_count, 1), 1)) AS idf,
           js.skill = ANY($1::text[]) AS hit
    FROM job_skills js
    JOIN candidates c ON c.job_md5 = js.job_md5
    CROSS JOIN params p
    LEFT JOIN skill_stats ss ON ss.skill = js.skill
  ),
  scored AS (
    SELECT job_md5,
           count(*)::int AS job_skill_count,
           sum(idf) FILTER (WHERE hit) / NULLIF(sum(idf), 0) AS coverage,
           COALESCE(array_agg(skill ORDER BY idf DESC, skill) FILTER (WHERE hit), '{}') AS matched,
           COALESCE(array_agg(skill ORDER BY idf DESC, skill) FILTER (WHERE NOT hit), '{}') AS missing
    FROM weighted
    GROUP BY job_md5
  )
  SELECT j.db_id, j.job_slug, j.apply_url_md5, j.title, j.canonical_title, j.company, j.company_slug,
         j.employment_type, j.remote, j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
         j.posted_at, j.apply_url, j.status,
         s.job_skill_count AS "jobSkillCount", s.coverage, s.matched, s.missing,
         s.coverage * s.job_skill_count / (s.job_skill_count + 2.0) AS match_rank
  FROM scored s
  JOIN jobs j ON j.apply_url_md5 = s.job_md5
  WHERE j.status = 'success'
  ORDER BY match_rank DESC, s.job_skill_count DESC, j.posted_at DESC NULLS LAST, j.db_id
  LIMIT $2
`;

// ─── Pure ──────────────────────────────────────────────────────────────────

// Free text (AI-extracted skills), not a guaranteed-clean array: trims, drops
// blanks, dedupes case-insensitively keeping the first spelling.
export function sanitizeSkills(skills) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(skills) ? skills : []) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function tierFor(coverage, jobSkillCount) {
  if (coverage >= STRONG_COVERAGE && jobSkillCount >= MIN_JOB_SKILLS) return "strong";
  if (coverage >= GOOD_COVERAGE) return "good";
  return "low";
}

// Groups ranked rows into Strong/Good/Low, keeping the ranked order inside each.
export function bucketByCoverage(rows) {
  const buckets = { strong: [], good: [], low: [] };
  for (const row of Array.isArray(rows) ? rows : []) {
    const coverage = Number.isFinite(Number(row.coverage)) ? Number(row.coverage) : 0;
    const fit = tierFor(coverage, Number(row.jobSkillCount) || 0);
    buckets[fit].push({ ...row, coverage, fit });
  }
  return buckets;
}

const requirements = (n) => `${n} requirement${n === 1 ? "" : "s"}`;

// The one line a match card gets: a direct readout of the job's own listed
// skills — how many the resume covers and the highest-weighted ones it does
// not. Never a percentage and never prose.
export function matchReason(row) {
  const matched = Array.isArray(row?.matched) ? row.matched : [];
  const missing = Array.isArray(row?.missing) ? row.missing : [];
  const total = matched.length + missing.length;
  if (!total) return "No listed requirements to compare";
  if (!matched.length) return `Covers none of ${requirements(total)}`;
  if (!missing.length) return total === 1 ? "Covers its 1 listed requirement" : `Covers all ${requirements(total)}`;
  return `Covers ${matched.length} of ${requirements(total)} · missing ${missing.slice(0, MISSING_SHOWN).join(", ")}`;
}

// ─── Deduplication (spec §8.1) ─────────────────────────────────────────────
// The same role is often posted once per location (Dialpad ×5 across Denver,
// Austin, …): on staging, test@test.com's top 300 rows were 257 roles.

const titleKey = (title) =>
  String(title ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

// Company + normalised title, or null when either is missing — including a
// title in a non-Latin script, which normalises to nothing and must not merge
// every such title at one company into a single card.
export function postingKey(row) {
  const company = String(row?.company_slug ?? "").trim() || String(row?.company ?? "").trim().toLowerCase();
  const title = titleKey(row?.title);
  return company && title ? `${company}|${title}` : null;
}

// Keeps the first (highest-ranked) row of each group, appends the others'
// locations to it and counts the group in `postingCount`. Input rows are not
// mutated.
export function dedupePostings(rows) {
  const kept = [];
  const byKey = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = postingKey(row);
    const first = key === null ? undefined : byKey.get(key);
    if (first) {
      first.postingCount += 1;
      for (const location of row.locations ?? []) {
        if (!first.locations.includes(location)) first.locations.push(location);
      }
      continue;
    }
    const entry = { ...row, locations: [...(row.locations ?? [])], postingCount: 1 };
    kept.push(entry);
    if (key !== null) byKey.set(key, entry);
  }
  return kept;
}

// The card's reason line: the requirement readout, plus how many postings
// the card stands for when it merged several.
export function cardReason(row) {
  const reason = matchReason(row);
  return row?.postingCount > 1 ? `${reason} · ${row.postingCount} postings` : reason;
}

// ─── IO ────────────────────────────────────────────────────────────────────

// Returns `{ rows, skills, unknown, available }`: `skills` is the resume's
// skill list mapped onto the vocabulary (what the query ranked against);
// `unknown` is what the vocabulary does not know, which cannot match any job.
// `available` is false when job_skills does not exist on this database yet —
// a deploy that lands before `npm run job-skills:migrate` — so the page can
// say so instead of failing with a 500.
export async function rankJobs({ skills, limit = DEFAULT_LIMIT, index = getIndex() } = {}) {
  const { known, unknown } = canonicalizeSkills(sanitizeSkills(skills), index);
  if (!known.length) return { rows: [], skills: known, unknown, available: true };
  let rows;
  try {
    rows = await query(RANK_SQL, [known, limit]);
  } catch (error) {
    if (error?.code === "42P01") return { rows: [], skills: known, unknown, available: false }; // undefined_table
    throw error;
  }
  return { rows: await attachLocations(rows), skills: known, unknown, available: true };
}
