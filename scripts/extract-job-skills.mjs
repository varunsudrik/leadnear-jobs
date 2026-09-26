// Batch skill extraction into job_skills (spec §7).
//
//   npm run job-skills:extract            live jobs not yet scanned with this vocabulary version
//   npm run job-skills:extract -- --all   every live job
//
// Deterministic and free: the vocabulary (lib/skills/vocab-data.mjs) matched
// against each job's requirements section. Each batch replaces that batch's
// job_skills rows and records a job_skill_scans row per job — including jobs
// with no skills, so an incremental run does not keep re-reading them — in
// one transaction. Resumable: an interrupted run continues where it stopped.
// Staging only.
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig } from "../lib/pg-config.mjs";
import { requireStagingDatabase } from "../lib/staging-guard.mjs";
import { toSkillRows } from "../lib/skills/extract.mjs";
import { getIndex, vocabVersion } from "../lib/skills/vocab.mjs";

loadEnvFile(".env.local");
requireStagingDatabase();

const BATCH = 500;
const all = process.argv.includes("--all");
const index = getIndex();
const version = vocabVersion();
if (!index.canonicalByAlias.size) {
  console.error("The vocabulary is empty — run `npm run skills:vocab` first.");
  process.exit(1);
}

const pool = new pg.Pool(buildPgConfig({ max: 1 }));
const client = await pool.connect();
try {
  const counts = async () =>
    (await client.query(
      `SELECT (SELECT count(*) FROM job_skills)::int AS skills, (SELECT count(*) FROM job_skill_scans)::int AS scans`
    )).rows[0];
  const before = await counts();
  console.log(`vocabulary v${version}: ${index.canonicalByAlias.size} aliases; ${all ? "every live job" : "unscanned live jobs only"}`);
  console.log(`before: job_skills ${before.skills} rows, job_skill_scans ${before.scans} rows`);

  const started = Date.now();
  let after = "";
  let processed = 0;
  for (;;) {
    const { rows: jobs } = await client.query(
      `SELECT j.apply_url_md5, j.description FROM jobs j
        WHERE j.status = 'success' AND j.apply_url_md5 > $1
          AND ($2::boolean OR NOT EXISTS (
            SELECT 1 FROM job_skill_scans s
             WHERE s.job_md5 = j.apply_url_md5 AND s.vocab_version = $3))
        ORDER BY j.apply_url_md5
        LIMIT $4`,
      [after, all, version, BATCH]
    );
    if (!jobs.length) break;
    const { skillRows, scanRows } = toSkillRows(jobs, index);
    await client.query("BEGIN");
    try {
      await client.query(`DELETE FROM job_skills WHERE job_md5 = ANY($1)`, [scanRows.jobMd5]);
      await client.query(
        `INSERT INTO job_skills (job_md5, skill, source)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[])`,
        [skillRows.jobMd5, skillRows.skill, skillRows.source]
      );
      await client.query(
        `INSERT INTO job_skill_scans (job_md5, vocab_version, source, skill_count)
         SELECT m, $2, s, c FROM unnest($1::text[], $3::text[], $4::int[]) AS t(m, s, c)
         ON CONFLICT (job_md5) DO UPDATE
           SET vocab_version = EXCLUDED.vocab_version, source = EXCLUDED.source,
               skill_count = EXCLUDED.skill_count, scanned_at = NOW()`,
        [scanRows.jobMd5, version, scanRows.source, scanRows.skillCount]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
    processed += jobs.length;
    after = jobs[jobs.length - 1].apply_url_md5;
    process.stdout.write(`\r  ${processed} jobs processed`);
  }
  if (processed) process.stdout.write("\n");

  const done = await counts();
  console.log(`after: job_skills ${done.skills} rows, job_skill_scans ${done.scans} rows — ${processed} jobs in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const { rows: bySource } = await client.query(
    `SELECT s.source, count(*)::int AS jobs,
            count(*) FILTER (WHERE s.skill_count > 0)::int AS with_skills,
            round(avg(s.skill_count), 1)::float AS avg_skills
       FROM job_skill_scans s JOIN jobs j ON j.apply_url_md5 = s.job_md5
      WHERE j.status = 'success'
      GROUP BY s.source ORDER BY jobs DESC`
  );
  console.log("\nlive jobs by description tier:");
  for (const r of bySource) {
    console.log(`  ${r.source.padEnd(8)} ${String(r.jobs).padStart(6)} jobs, ${String(r.with_skills).padStart(6)} with ≥1 skill, avg ${r.avg_skills}`);
  }
  const { rows: top } = await client.query(
    `SELECT skill, count(*)::int AS jobs FROM job_skills GROUP BY skill ORDER BY jobs DESC, skill LIMIT 20`
  );
  console.log(`\ntop skills: ${top.map((r) => `${r.skill} (${r.jobs})`).join(", ")}`);
} catch (error) {
  console.error("\nextraction failed:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
