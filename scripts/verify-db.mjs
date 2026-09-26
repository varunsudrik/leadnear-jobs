#!/usr/bin/env node
// scripts/verify-db.mjs — assert the target database looks the way the app
// expects: both table families present, aggregates derived from the rows that
// are actually there, and the indexes/extensions the queries depend on.
//
//   npm run db:verify

import path from "node:path";
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig, describeTarget } from "../lib/pg-config.mjs";

loadEnvFile(path.join(process.cwd(), ".env.local"));

// Created by scripts/import_to_postgres.py.
const JOB_TABLES = [
  "jobs", "job_locations", "companies", "site_metrics", "title_stats",
  "skill_stats", "location_stats", "country_stats", "remote_title_stats",
  "salary_tier_stats", "blocked_ips",
];

// Created by scripts/add-job-skills-tables.mjs (npm run job-skills:migrate);
// /jobs/matches ranks against them.
const SKILL_TABLES = ["job_skills", "job_skill_scans"];

// Queries in lib/jobs.js depend on these specifically: idx_jobs_search backs
// the full-text path, unaccent backs slug generation.
const REQUIRED_INDEXES = ["idx_jobs_search", "idx_jobs_job_slug", "jobs_apply_url_md5_key"];

const pool = new pg.Pool(buildPgConfig({ max: 2 }));
let failures = 0;

function check(ok, label, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? `  — ${detail}` : ""}`);
}

try {
  console.log(`Verifying ${describeTarget()}\n`);

  const { rows: tables } = await pool.query(
    `select table_name from information_schema.tables where table_schema = 'public'`
  );
  const present = new Set(tables.map((r) => r.table_name));

  console.log("Tables");
  const missingJobTables = JOB_TABLES.filter((t) => !present.has(t));
  check(missingJobTables.length === 0, `${JOB_TABLES.length} job board tables`, missingJobTables.join(", "));

  const missingSkillTables = SKILL_TABLES.filter((t) => !present.has(t));
  check(missingSkillTables.length === 0, `${SKILL_TABLES.length} job skill tables`, missingSkillTables.length ? `missing ${missingSkillTables.join(", ")} — run npm run job-skills:migrate` : "");

  // Everything that is neither a job board nor a job skill table came from
  // `prisma db push`.
  const prismaTables = [...present].filter((t) => !JOB_TABLES.includes(t) && !SKILL_TABLES.includes(t));
  check(prismaTables.length >= 40, `${prismaTables.length} leadnear (Prisma) tables`, "expected >= 40");
  // Note the casing: the MySQL original ran with lower_case_table_names=1 and
  // so stored these as `user`, `linkedindata`, … PostgreSQL preserves the
  // model names Prisma quotes, giving "User", "LinkedinData", … Prisma is
  // consistent either way; hand-written SQL against this database must quote.
  check(present.has("User"), `Prisma table "User" exists (PascalCase, unlike MySQL's "user")`);
  console.log(`  total in public: ${present.size}\n`);

  console.log("Row counts");
  const counts = {};
  for (const t of ["jobs", "job_locations", "blocked_ips", "companies", "title_stats"]) {
    if (!present.has(t)) continue;
    const { rows } = await pool.query(`select count(*)::int as c from ${t}`);
    counts[t] = rows[0].c;
    console.log(`  ${t.padEnd(16)} ${rows[0].c}`);
  }
  check((counts.jobs ?? 0) > 0, "jobs has rows");
  check((counts.job_locations ?? 0) > 0, "job_locations has rows");

  console.log("\nAggregates derived from the rows actually present");
  const { rows: metrics } = await pool.query(
    `select total_jobs, total_remote, total_100k_plus, total_companies from site_metrics where id = 1`
  );
  if (!metrics.length) {
    check(false, "site_metrics row exists");
  } else {
    const m = metrics[0];
    const { rows: live } = await pool.query(`select count(*)::int as c from jobs where status = 'success'`);
    console.log(`  site_metrics.total_jobs = ${m.total_jobs}, live success rows = ${live[0].c}`);
    // The whole point of regenerating rather than copying stats: these must
    // agree, otherwise the UI advertises production's 690k against a subset.
    check(
      Number(m.total_jobs) === live[0].c,
      "site_metrics.total_jobs matches live row count",
      `${m.total_jobs} vs ${live[0].c}`
    );
    check(Number(m.total_companies) > 0, `total_companies = ${m.total_companies}`);
  }

  console.log("\nIndexes and extensions");
  const { rows: idx } = await pool.query(
    `select indexname from pg_indexes where schemaname = 'public' and tablename = 'jobs'`
  );
  const idxNames = new Set(idx.map((r) => r.indexname));
  for (const name of REQUIRED_INDEXES) check(idxNames.has(name), name);
  console.log(`  jobs indexes: ${idx.length}`);

  const { rows: ext } = await pool.query(`select extname from pg_extension`);
  check(ext.some((e) => e.extname === "unaccent"), "unaccent extension installed");

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
} catch (error) {
  console.error("\nVerification error:", error.message);
  failures += 1;
} finally {
  await pool.end();
}

process.exit(failures === 0 ? 0 : 1);
