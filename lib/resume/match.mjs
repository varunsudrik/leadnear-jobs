// lib/resume/match.mjs — resume-to-job ranking (design doc section 4).
//
// Same split as the rest of lib/resume/*: SQL/IO lives only in rankJobs()
// below. Everything else here is pure — plain data in, plain data out, no
// database — so it is entirely covered by scripts/test-resume-match.mjs.
//
// The jobs table is raw SQL, not Prisma (see scripts/migrate-resume-tables.mjs's
// own comment on this) — same as lib/jobs.js. This module doesn't import
// lib/jobs.js's query()/attachLocations() though: lib/jobs.js and lib/db.js
// use extensionless internal imports (`from "./db"`) and pull in
// "next/cache", both of which only resolve inside Next's bundler. Every
// other lib/resume/*.mjs module is plain-`node`-runnable (that's the whole
// point of the `node scripts/test-*.mjs` convention — see AGENTS.md/the
// design doc's testing section), so this one manages its own small pg pool
// via lib/pg-config.mjs instead, the same way the standalone scripts
// (scripts/migrate-resume-tables.mjs, scripts/publish-jobs.mjs) do.
import pg from "pg";
import { buildPgConfig } from "../pg-config.mjs";

const { Pool, types } = pg;
// Same two type parsers lib/db.js registers, so db_id (bigint) and the
// salary_* (numeric) columns come back as JS numbers here too, matching
// what lib/format.js's fmtSalary and JobCard already assume. Registration
// is global to the `pg` package (not per-Pool), so this is a harmless no-op
// on a process where lib/db.js already ran it (a normal Next.js request),
// and the piece that's actually needed on a process where it didn't
// (a plain `node scripts/*.mjs` run that imports only this module).
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

// Mirrors lib/jobs.js's own attachLocations, minimally: joins the ranked
// rows to job_locations by apply_url_md5 so JobCard's `job.locations` has
// something to render. Not imported from lib/jobs.js for the reason above.
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
// Tier is decided by *overlap ratio* — matched skills / total skills on the
// resume — not a raw match count, so "Strong" means the same thing for a
// 6-skill resume and a 40-skill one. These are starting points chosen to be
// reachable (see the report this shipped with for the real distribution
// they produce against a 40-skill resume on staging), not a measured
// optimum — the whole point of naming them here is that they are a one-line
// change once real usage shows they should move.
//
//   STRONG — this posting's description mentions at least a quarter of the
//            skills on the resume. Worth applying to without changes.
//   GOOD   — at least a tenth. A real but partial match; worth a look.
//   LOW    — everything else, including a resume with zero skill overlap
//            that only matched on a full-text ranking fluke.
export const STRONG_OVERLAP = 0.25;
export const GOOD_OVERLAP = 0.1;

// How many ranked rows to fetch and bucket per call. Not a page size for
// the UI (the UI paginates/trims what it renders) — a ceiling on how much
// work rankJobs does per request.
export const DEFAULT_LIMIT = 300;

const TEXT_SEARCH_CONFIG = "english";

// One skill's tsquery, built by Postgres's own plainto_tsquery — not
// hand-rolled tokenization — so multi-word skills ("API Design"), skills
// with punctuation ("CI/CD", "cPanel / WHM") and hyphen-compound skills
// ("Event-Driven Systems") get exactly the same lexeme expansion the
// indexed description_tsv column was built with (see
// scripts/add-resume-match-index.mjs), because both go through the same
// 'english' parser and dictionary. That shared pipeline is also what keeps
// short tokens safe: to_tsquery/to_tsvector match whole lexemes, never
// substrings, so a lexeme 'c' cannot match the lexeme 'categori' the way a
// naive `LIKE '%c%'` or a prefix (`:*`) query would — verified directly
// against this database for the exact cases the design doc calls out
// (skill "C" vs. "category", "R" vs. "Rust", "Go" vs. "Google": none
// collide) and covered by scripts/test-resume-match.mjs's fixtures.
const tsQueryExpr = (paramIndex) => `plainto_tsquery('${TEXT_SEARCH_CONFIG}', $${paramIndex})`;

// ─── Pure ──────────────────────────────────────────────────────────────────

// A skill list is free text (AI-extracted from a resume), not a guaranteed-
// clean array: trims whitespace, drops blanks, and dedupes case-insensitively
// so one repeated or empty entry can't inflate the overlap denominator or
// waste a query parameter.
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

export function tierFor(overlapRatio) {
  if (overlapRatio >= STRONG_OVERLAP) return "strong";
  if (overlapRatio >= GOOD_OVERLAP) return "good";
  return "low";
}

// Groups already-ranked rows into Strong/Good/Low. `skillCount` is the
// denominator for every row's overlap ratio, so callers must pass the same
// (sanitized) skill count the ranking query itself used — rankJobs()
// returns that alongside `rows` for exactly this reason.
export function bucketByOverlap(rows, skillCount) {
  const buckets = { strong: [], good: [], low: [] };
  for (const row of Array.isArray(rows) ? rows : []) {
    const matchCount = Array.isArray(row.matchedSkills) ? row.matchedSkills.length : 0;
    const overlapRatio = skillCount > 0 ? matchCount / skillCount : 0;
    const fit = tierFor(overlapRatio);
    buckets[fit].push({ ...row, matchCount, overlapRatio, fit });
  }
  return buckets;
}

// The one line a match card gets: how many of the resume's skills this
// posting mentions and, when the match is partial, the first (i.e. most
// prominent — resumes list stronger skills first) one it is missing. Never
// a percentage (a ratio dressed as a percentage reads as more precise than
// full-text search actually is) and never prose — every word here is a
// direct readout of `matchedSkills`.
export function matchReason(row, skills) {
  const matched = new Set(Array.isArray(row.matchedSkills) ? row.matchedSkills : []);
  const total = Array.isArray(skills) ? skills.length : 0;
  if (!total) return "No skills to match against";
  if (!matched.size) return "No overlap with your listed skills";
  if (matched.size >= total) return `Matches all ${total} of your skills`;
  const missing = skills.find((s) => !matched.has(s));
  return `Matches ${matched.size} of ${total} skills · missing ${missing}`;
}

// ─── IO ────────────────────────────────────────────────────────────────────

// Ranks live jobs against a resume's skill list using the partial GIN index
// on jobs.description_tsv (scripts/add-resume-match-index.mjs). Returns
// `{ rows, skills }` rather than just rows: `skills` is the sanitized list
// the query actually ran with, which is what bucketByOverlap's `skillCount`
// and matchReason's `skills` argument must both be given — passing the raw,
// unsanitized input to those would silently disagree with what was ranked.
//
// Query shape, and why: a single tsquery — every skill OR'd together via
// Postgres's own `||` tsquery operator — is what the description_tsv @@ ...
// predicate is tested against, so the planner can push it straight through
// the GIN index (see the design doc's own manual test, section on "what is
// usable"). Per-skill match detail (which of the user's skills a specific
// posting mentions) is computed separately, per row, but only over the rows
// the LIMIT already narrowed things down to — never over the full table.
export async function rankJobs({ skills, limit = DEFAULT_LIMIT } = {}) {
  const clean = sanitizeSkills(skills);
  if (!clean.length) return { rows: [], skills: clean };

  const combinedQuery = clean.map((_, i) => tsQueryExpr(i + 1)).join(" || ");
  const matchedSkillsExpr = `ARRAY_REMOVE(ARRAY[${clean
    .map((_, i) => `CASE WHEN description_tsv @@ ${tsQueryExpr(i + 1)} THEN $${i + 1}::text END`)
    .join(", ")}], NULL)`;
  const limitParam = clean.length + 1;

  const sql = `
    WITH ranked AS (
      SELECT db_id, job_slug, apply_url_md5, title, canonical_title, company, company_slug,
             employment_type, remote, salary_min, salary_max, salary_currency, salary_period,
             posted_at, apply_url, status, description_tsv,
             ts_rank(description_tsv, (${combinedQuery})) AS rank
      FROM jobs
      WHERE status = 'success' AND description_tsv @@ (${combinedQuery})
      ORDER BY rank DESC
      LIMIT $${limitParam}
    )
    SELECT db_id, job_slug, apply_url_md5, title, canonical_title, company, company_slug,
           employment_type, remote, salary_min, salary_max, salary_currency, salary_period,
           posted_at, apply_url, status, rank,
           ${matchedSkillsExpr} AS "matchedSkills"
    FROM ranked
    ORDER BY rank DESC
  `;
  const rows = await query(sql, [...clean, limit]);
  return { rows: await attachLocations(rows), skills: clean };
}
