// Integration check for lib/skills/skill-stats.mjs on the staging database.
// Everything runs in one transaction that is rolled back at the end, so the
// real skill_stats and job_skills are never changed.
//
//   npm run skill-stats:check     (after npm run job-skills:extract)
import assert from "node:assert/strict";
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig } from "../lib/pg-config.mjs";
import { requireStagingDatabase } from "../lib/staging-guard.mjs";
import { rebuildSkillStats } from "../lib/skills/skill-stats.mjs";

loadEnvFile(".env.local");
requireStagingDatabase();

// Employment types and company names: what the tags-derived table's top rows
// actually were in production (spec §1). None may lead a job_skills build.
const NOT_A_SKILL = [
  /^(full[ -]?time|part[ -]?time|hybrid( work)?|on-?site|remote|contract|temporary|internship|not applicable|yes|no)$/i,
  /\b(llc|inc\.?|ltd|corp|gmbh)\b/i,
];

const pool = new pg.Pool(buildPgConfig({ max: 1 }));
const client = await pool.connect();
const one = async (sql) => (await client.query(sql)).rows[0].n;
const statsRows = () => one(`SELECT count(*)::int AS n FROM skill_stats`);
const liveJobSkills = () =>
  one(`SELECT count(DISTINCT js.skill)::int AS n FROM job_skills js
        JOIN jobs j ON j.apply_url_md5 = js.job_md5 WHERE j.status = 'success'`);
const liveTags = () =>
  one(`SELECT count(DISTINCT BTRIM(skill))::int AS n FROM jobs j
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(j.tags, '[]'::jsonb)) AS tag(skill)
        WHERE j.status = 'success' AND BTRIM(skill) != ''`);

try {
  await client.query("BEGIN");

  // 1. job_skills populated: built from it, one row per distinct live skill,
  //    and the top of the list is skills.
  const populated = await rebuildSkillStats(client);
  assert.equal(populated.source, "job_skills", "job_skills holds nothing for live jobs — run npm run job-skills:extract first");
  assert.equal(await statsRows(), await liveJobSkills());
  const { rows: top } = await client.query(`SELECT skill FROM skill_stats ORDER BY job_count DESC, skill LIMIT 15`);
  for (const { skill } of top) {
    for (const pattern of NOT_A_SKILL) assert.doesNotMatch(skill, pattern, `"${skill}" leads skill_stats but is not a skill`);
  }
  console.log(`  ok  built from job_skills (${populated.rows} skills); top 15: ${top.map((r) => r.skill).join(", ")}`);

  // 2. job_skills empty: falls back to jobs.tags rather than emptying the table.
  await client.query("SAVEPOINT emptied");
  await client.query(`DELETE FROM job_skills`);
  const emptied = await rebuildSkillStats(client);
  assert.equal(emptied.source, "tags");
  assert.equal(await statsRows(), await liveTags());
  await client.query("ROLLBACK TO SAVEPOINT emptied");
  console.log(`  ok  empty job_skills falls back to jobs.tags (${emptied.rows} rows)`);

  // 3. job_skills missing entirely — production today — falls back without
  //    throwing, which would otherwise roll back every other aggregate.
  await client.query("SAVEPOINT missing");
  await client.query(`ALTER TABLE job_skills RENAME TO job_skills_hidden_by_check`);
  const missing = await rebuildSkillStats(client);
  assert.equal(missing.source, "tags");
  await client.query("ROLLBACK TO SAVEPOINT missing");
  console.log("  ok  missing job_skills table falls back to jobs.tags without error");

  // 4. A backfill part-way through (about half the live jobs scanned) must not
  //    publish counts from that fraction: it stays on jobs.tags.
  await client.query("SAVEPOINT partial");
  await client.query(`DELETE FROM job_skill_scans WHERE job_md5 < '8'`);
  const partial = await rebuildSkillStats(client);
  assert.equal(partial.source, "tags");
  await client.query("ROLLBACK TO SAVEPOINT partial");
  console.log("  ok  a part-finished backfill stays on jobs.tags");
} finally {
  await client.query("ROLLBACK").catch(() => {});
  client.release();
  await pool.end();
}
console.log("skill-stats check ok");
