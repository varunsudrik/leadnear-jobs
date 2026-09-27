// Removes jobs.description_tsv and idx_jobs_description_tsv from staging.
//
//   node scripts/drop-description-tsv.mjs
//
// They backed the first, full-text version of /jobs/matches (the deleted
// scripts/add-resume-match-index.mjs). Matching now reads job_skills, so
// nothing queries them, yet every write to jobs still computed the tsvector
// and maintained the GIN index. Both are derived from jobs.description, so
// nothing is lost. Idempotent; the index goes CONCURRENTLY so the table is
// never write-locked. Staging only.
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig } from "../lib/pg-config.mjs";
import { requireStagingDatabase } from "../lib/staging-guard.mjs";

loadEnvFile(".env.local");
requireStagingDatabase();

const pool = new pg.Pool(buildPgConfig({ max: 1 }));
const client = await pool.connect();
try {
  const present = async () =>
    (await client.query(
      `SELECT
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'description_tsv') AS col,
         to_regclass('public.idx_jobs_description_tsv') IS NOT NULL AS idx,
         pg_size_pretty(pg_total_relation_size('jobs')) AS size`
    )).rows[0];
  const before = await present();
  console.log(`before: column ${before.col ? "present" : "absent"}, index ${before.idx ? "present" : "absent"}, jobs ${before.size}`);
  // CONCURRENTLY cannot run inside a transaction block, so no BEGIN here.
  await client.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_jobs_description_tsv`);
  await client.query(`ALTER TABLE jobs DROP COLUMN IF EXISTS description_tsv`);
  const after = await present();
  console.log(`after:  column ${after.col ? "present" : "absent"}, index ${after.idx ? "present" : "absent"}, jobs ${after.size}`);
} catch (error) {
  console.error("drop failed:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
