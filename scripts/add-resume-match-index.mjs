// Additive DDL for resume-to-job matching (see
// docs/superpowers/specs/2026-09-19-resume-ats-scan-design.md, section 6).
//
// Adds:
//   1. jobs.description_tsv — a STORED generated tsvector column over the
//      HTML-stripped description, so the (expensive, ~1.6ms/row) tsvector
//      computation happens once per write instead of once per request.
//   2. idx_jobs_description_tsv — a GIN index over that column, PARTIAL on
//      status='success' (68% of production rows are soft-deleted, so a
//      partial index is roughly a third the size there), built
//      CONCURRENTLY so it never takes a write lock on this live table.
//
// Same guard rails as scripts/migrate-resume-tables.mjs: refuses anything
// that isn't the Aiven staging host, and every statement is idempotent so
// re-running this is a no-op once applied.
//
// CREATE INDEX CONCURRENTLY cannot run inside a transaction block (Postgres
// rejects it with "cannot run inside a transaction block"), so nothing here
// is wrapped in BEGIN/COMMIT — each statement commits on its own, and a
// script failing partway through just leaves the next run to finish the job
// (checked with information_schema / pg_index first, never blindly reissued).
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig } from "../lib/pg-config.mjs";

loadEnvFile(".env.local");
let host;
try {
  host = new URL(process.env.DATABASE_URL).hostname;
} catch {
  console.error(`REFUSING: DATABASE_URL is not set or not a valid URL.`);
  process.exit(1);
}
if (!host.endsWith("aivencloud.com")) {
  console.error(`REFUSING: ${host} is not the Aiven staging host.`);
  process.exit(1);
}

const COLUMN = "description_tsv";
const INDEX = "idx_jobs_description_tsv";

// Must match, character for character, the expression lib/resume/match.mjs's
// queries rely on — the whole point of a generated column is that queries
// reference it by name instead of repeating this expression (and risking the
// planner-ignores-it mismatch the design doc calls out), but the definition
// still has to be right exactly once, here.
const TSVECTOR_EXPR = `to_tsvector('english', regexp_replace(description, '<[^>]*>', ' ', 'g'))`;

const pool = new pg.Pool(buildPgConfig());
const client = await pool.connect();

async function columnExists() {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='jobs' AND column_name=$1`,
    [COLUMN]
  );
  return rows.length > 0;
}

async function indexStatus() {
  const { rows } = await client.query(
    `SELECT indisvalid FROM pg_index pi JOIN pg_class c ON c.oid = pi.indexrelid WHERE c.relname = $1`,
    [INDEX]
  );
  if (!rows.length) return "absent";
  return rows[0].indisvalid ? "valid" : "invalid";
}

try {
  const before = await client.query(`SELECT count(*)::int AS n FROM jobs`);
  const beforeStatus = await client.query(
    `SELECT count(*) FILTER (WHERE status = 'success')::int AS live, count(*)::int AS total FROM jobs`
  );
  console.log(`jobs: ${before.rows[0].n} rows total (${beforeStatus.rows[0].live} status='success')`);

  if (await columnExists()) {
    console.log(`column "${COLUMN}": already present, skipping ALTER TABLE`);
  } else {
    console.log(`column "${COLUMN}": adding (generated, STORED)...`);
    await client.query(
      `ALTER TABLE jobs ADD COLUMN "${COLUMN}" tsvector GENERATED ALWAYS AS (${TSVECTOR_EXPR}) STORED`
    );
    console.log(`column "${COLUMN}": added`);
  }

  const status = await indexStatus();
  if (status === "invalid") {
    // A previous CONCURRENTLY build was interrupted. Postgres leaves the
    // index in place but marked invalid and unusable by the planner; it has
    // to be dropped (also CONCURRENTLY, so this stays lock-free) before a
    // clean rebuild.
    console.log(`index "${INDEX}": found INVALID (interrupted build), dropping before rebuild...`);
    await client.query(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX}"`);
  }
  if (status === "valid") {
    console.log(`index "${INDEX}": already present and valid, skipping CREATE INDEX`);
  } else {
    console.log(`index "${INDEX}": building CONCURRENTLY (partial, WHERE status='success')...`);
    const t0 = Date.now();
    await client.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${INDEX}" ON jobs USING gin ("${COLUMN}") WHERE status = 'success'`
    );
    console.log(`index "${INDEX}": built in ${Date.now() - t0}ms`);
  }

  const after = await client.query(`SELECT count(*)::int AS n FROM jobs`);
  const sizes = await client.query(
    `SELECT pg_size_pretty(pg_total_relation_size('jobs')) AS table_size,
            pg_size_pretty(pg_relation_size('"${INDEX}"')) AS index_size`
  );
  console.log(`jobs: ${after.rows[0].n} rows after (unchanged — this script adds no rows)`);
  console.log(`table size: ${sizes.rows[0].table_size}   index size: ${sizes.rows[0].index_size}`);
  console.log(`final index status: ${await indexStatus()}`);
} catch (error) {
  console.error("index migration failed:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
