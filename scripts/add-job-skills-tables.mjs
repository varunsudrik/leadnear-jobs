// Additive DDL for job-side skill extraction (spec §3, §12.6).
//
//   npm run job-skills:migrate
//
// job_skills      — one row per (job, canonical skill), with the description
//                   tier it came from.
// job_skill_scans — one row per job scanned, with the vocabulary version, so
//                   jobs with zero skills are not re-read on every
//                   incremental run, a new vocabulary re-scans everything,
//                   and a changed description re-scans that job.
//
// Keyed by job_md5 = jobs.apply_url_md5, the same convention job_locations
// uses, with no declared foreign key (also like job_locations). Idempotent,
// one transaction, staging only.
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig } from "../lib/pg-config.mjs";
import { requireStagingDatabase } from "../lib/staging-guard.mjs";

loadEnvFile(".env.local");
requireStagingDatabase();

const TABLES = ["job_skills", "job_skill_scans"];
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS job_skills (
     job_md5 VARCHAR(32)  NOT NULL,
     skill   VARCHAR(120) NOT NULL,
     source  VARCHAR(12)  NOT NULL,
     PRIMARY KEY (job_md5, skill)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_job_skills_skill ON job_skills (skill)`,
  `CREATE TABLE IF NOT EXISTS job_skill_scans (
     job_md5       VARCHAR(32) PRIMARY KEY,
     vocab_version INTEGER     NOT NULL,
     source        VARCHAR(12) NOT NULL,
     skill_count   INTEGER     NOT NULL,
     scanned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // md5 of the description the scan read, so a job whose description changes
  // (a re-scrape rewrites its requirements) is scanned again. Added after the
  // table first shipped, hence ADD COLUMN IF NOT EXISTS.
  `ALTER TABLE job_skill_scans ADD COLUMN IF NOT EXISTS description_md5 VARCHAR(32)`,
];

const pool = new pg.Pool(buildPgConfig({ max: 1 }));
const client = await pool.connect();
try {
  const tableCount = async () =>
    (await client.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`)).rows[0].n;
  const before = await tableCount();
  await client.query("BEGIN");
  for (const sql of STATEMENTS) await client.query(sql);
  await client.query("COMMIT");
  const after = await tableCount();
  console.log(`tables before: ${before}  after: ${after}  (expected +2 on a fresh run, +0 when re-run)`);
  for (const table of TABLES) {
    const { rows } = await client.query(`SELECT to_regclass($1) AS t`, [`public.${table}`]);
    console.log(`  ${table}: ${rows[0].t ? "present" : "MISSING"}`);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("migration failed, rolled back:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
