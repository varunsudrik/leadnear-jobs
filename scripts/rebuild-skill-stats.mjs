// Rebuilds skill_stats on staging from job_skills (or jobs.tags while
// job_skills holds nothing for live jobs), without the rest of
// publish-jobs.mjs's aggregate/revalidate/publish cycle. Run it after
// `npm run job-skills:extract`.
//
//   npm run job-skills:stats
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig } from "../lib/pg-config.mjs";
import { requireStagingDatabase } from "../lib/staging-guard.mjs";
import { rebuildSkillStats } from "../lib/skills/skill-stats.mjs";

loadEnvFile(".env.local");
requireStagingDatabase();

const pool = new pg.Pool(buildPgConfig({ max: 1 }));
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const { source, rows } = await rebuildSkillStats(client);
  await client.query("COMMIT");
  console.log(`skill_stats rebuilt from ${source}: ${rows} skills`);
  const { rows: top } = await client.query(
    `SELECT skill, job_count FROM skill_stats ORDER BY job_count DESC, skill LIMIT 15`
  );
  for (const r of top) console.log(`  ${String(r.job_count).padStart(6)}  ${r.skill}`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("rebuild failed, rolled back:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
