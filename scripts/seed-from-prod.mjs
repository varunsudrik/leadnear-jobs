#!/usr/bin/env node
// scripts/seed-from-prod.mjs — copy a slice of live job data into the target
// database, so this project has realistic content to serve.
//
//   npm run db:seed
//
// Source is PROD_DATABASE_URL and is treated as strictly READ ONLY: this script
// issues SELECT statements against it and nothing else. Every write goes to
// DATABASE_URL.
//
// Why a script rather than pg_dump/pg_restore: only a subset is wanted, and
// pg_dump cannot filter rows. Copying through node also keeps values in their
// native types end to end — `tags` is JSONB and `last_seen_at` is timestamptz
// while the other timestamps are plain timestamp, all of which survive as long
// as pg parses and re-binds them rather than round-tripping through strings.
//
// Only base tables are copied. The eight aggregate tables (companies,
// title_stats, site_metrics, …) are deliberately NOT copied: they describe
// production's ~690k live rows and would advertise that count over a 5k subset.
// Regenerate them afterwards with `npm run db:schema`, which calls the
// importer's rebuild_stats() against whatever rows are actually present.

import path from "node:path";
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig, describeTarget } from "../lib/pg-config.mjs";

loadEnvFile(path.join(process.cwd(), ".env.local"));

const JOB_LIMIT = Number(process.env.SEED_JOB_LIMIT || 5000);
const BATCH = Number(process.env.SEED_BATCH_SIZE || 200);

if (!process.env.PROD_DATABASE_URL) {
  console.error("PROD_DATABASE_URL is not set — nothing to seed from.");
  process.exit(1);
}

// The source pool is built from PROD_DATABASE_URL explicitly rather than
// through buildPgConfig(), which reads DATABASE_URL — mixing those up would
// point the reader at the target (or worse, the writer at production).
const sourceUrl = new URL(process.env.PROD_DATABASE_URL);
const source = new pg.Pool({
  connectionString: process.env.PROD_DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 20000,
  // Keep the session read-only at the server as well as by convention, so a
  // mistake in this file cannot write to production.
  options: "-c default_transaction_read_only=on",
});
const target = new pg.Pool(buildPgConfig({ max: 3 }));

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

// Copy every column the source table has, so the copy stays correct if the
// schema gains a column later. Data types come along because JSON columns need
// special handling on the way back in (see toBindValue).
async function columnsOf(pool, table) {
  const { rows } = await pool.query(
    `select column_name, data_type from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position`,
    [table]
  );
  return rows.map((r) => ({ name: r.column_name, dataType: r.data_type }));
}

// pg parses a jsonb column into a JS value on the way out. Handing that value
// straight back as a parameter breaks for arrays: node-pg formats a JS array as
// a PostgreSQL *array literal* ({a,b}), which jsonb rejects with "invalid input
// syntax for type json". Objects happen to survive, arrays and bare scalars do
// not — so serialise every json/jsonb value explicitly rather than relying on
// the driver guessing right.
function toBindValue(value, dataType) {
  if (value === null || value === undefined) return null;
  if (dataType === "json" || dataType === "jsonb") return JSON.stringify(value);
  return value;
}

async function insertBatch(table, columns, rows, conflictClause) {
  if (rows.length === 0) return 0;

  const colSql = columns.map((c) => quoteIdent(c.name)).join(", ");
  const values = [];
  const tuples = rows.map((row) => {
    const placeholders = columns.map((col) => {
      values.push(toBindValue(row[col.name], col.dataType));
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });

  const result = await target.query(
    `insert into ${quoteIdent(table)} (${colSql}) values ${tuples.join(", ")} ${conflictClause}`,
    values
  );
  return result.rowCount;
}

async function copyTable({ table, selectSql, params = [], conflictClause, label }) {
  const sourceColumns = await columnsOf(source, table);
  const targetColumns = new Map((await columnsOf(target, table)).map((c) => [c.name, c.dataType]));

  // A column present upstream but not here would abort the insert; skipping it
  // (loudly) is better than failing the whole seed. Bind using the *target*
  // type, since that is what the insert has to satisfy.
  const columns = sourceColumns
    .filter((c) => targetColumns.has(c.name))
    .map((c) => ({ name: c.name, dataType: targetColumns.get(c.name) }));
  const skipped = sourceColumns.filter((c) => !targetColumns.has(c.name)).map((c) => c.name);
  if (skipped.length) {
    console.log(`  note: ${table} — source columns not present in target, skipped: ${skipped.join(", ")}`);
  }

  const { rows } = await source.query(selectSql, params);
  console.log(`  ${label}: ${rows.length} rows read from production`);

  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    written += await insertBatch(table, columns, rows.slice(i, i + BATCH), conflictClause);
    process.stdout.write(`\r  ${label}: inserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
  return { read: rows.length, written };
}

try {
  console.log(`Source (read-only): ${sourceUrl.hostname}:${sourceUrl.port}${sourceUrl.pathname}`);
  console.log(`Target            : ${describeTarget()}`);
  console.log(`Copying the newest ${JOB_LIMIT} live jobs\n`);

  // 1. Jobs — newest live listings. NULLS LAST keeps undated rows from
  //    monopolising a DESC ordering.
  const jobs = await copyTable({
    table: "jobs",
    label: "jobs",
    selectSql: `select * from jobs
                 where status = 'success'
                 order by posted_at desc nulls last
                 limit $1`,
    params: [JOB_LIMIT],
    // Re-running the seed must not duplicate rows. db_id is a BIGSERIAL that
    // carries over from production, so the natural key is the unique md5.
    conflictClause: "on conflict (apply_url_md5) do nothing",
  });

  // 2. Locations for exactly those jobs. The link is by convention
  //    (job_locations.job_md5 = jobs.apply_url_md5); there is no declared FK.
  //
  // Unlike jobs, this table has no unique constraint to key ON CONFLICT
  // against, so a second run would silently double every row. Clearing first
  // is what makes the seed re-runnable. Safe because the table is populated
  // exclusively by this script — it holds no locally-authored data.
  const cleared = await target.query("delete from job_locations");
  if (cleared.rowCount) console.log(`  job_locations: cleared ${cleared.rowCount} existing rows first`);

  const locations = await copyTable({
    table: "job_locations",
    label: "job_locations",
    selectSql: `select l.* from job_locations l
                 where l.job_md5 in (
                   select apply_url_md5 from jobs
                    where status = 'success'
                    order by posted_at desc nulls last
                    limit $1
                 )`,
    params: [JOB_LIMIT],
    // job_locations has no unique constraint to key on, so a re-run would
    // duplicate. Cleared below instead.
    conflictClause: "",
  });

  // 3. Blocked IPs — small, and the backoffice reads it.
  const blocked = await copyTable({
    table: "blocked_ips",
    label: "blocked_ips",
    selectSql: "select * from blocked_ips",
    conflictClause: "on conflict do nothing",
  });

  // Keep the BIGSERIAL sequences ahead of the ids just copied, or the first
  // locally-created row collides on the primary key.
  for (const [table, column] of [["jobs", "db_id"], ["job_locations", "id"]]) {
    await target.query(
      `select setval(pg_get_serial_sequence($1, $2),
                     coalesce((select max(${quoteIdent(column)}) from ${quoteIdent(table)}), 1))`,
      [table, column]
    );
  }
  console.log("\n  sequences advanced past the copied ids");

  console.log("\nSummary");
  console.log(`  jobs           read ${jobs.read}  written ${jobs.written}`);
  console.log(`  job_locations  read ${locations.read}  written ${locations.written}`);
  console.log(`  blocked_ips    read ${blocked.read}  written ${blocked.written}`);
  console.log("\nNext: run `npm run db:schema` to rebuild the aggregate tables from these rows.");
} catch (error) {
  console.error("\nSeed failed:", error.message);
  process.exitCode = 1;
} finally {
  await source.end();
  await target.end();
}
