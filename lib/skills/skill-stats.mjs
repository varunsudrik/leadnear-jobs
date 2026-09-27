// lib/skills/skill-stats.mjs — rebuilds skill_stats (spec §3, §12.7).
//
// skill_stats feeds the site's skill autocomplete (lib/jobs.js) and is the
// document frequency /jobs/matches weights by (lib/resume/match.mjs). It is
// built from job_skills once extraction has covered nearly every live job
// (MIN_SCAN_COVERAGE), and otherwise from jobs.tags exactly as before — so a
// deploy before the backfill cannot empty or freeze it, and a backfill that is
// still part-way through cannot publish counts from a fraction of jobs.
//
// Runs inside the caller's transaction and issues no BEGIN/COMMIT of its own.
// rebuild_skill_stats() in scripts/import_to_postgres.py is the same logic for
// `npm run db:schema`; keep the two in step.

// Share of live jobs that must have a job_skill_scans row (zero-skill jobs
// included) before job_skills is trusted as the source.
export const MIN_SCAN_COVERAGE = 0.95;

export const SKILL_STATS_FROM_JOB_SKILLS = `
  INSERT INTO skill_stats (skill, job_count)
  SELECT js.skill, COUNT(*)
  FROM job_skills js
  JOIN jobs j ON j.apply_url_md5 = js.job_md5
  WHERE j.status = 'success'
  GROUP BY js.skill
`;

// The query publish-jobs.mjs and import_to_postgres.py always used.
export const SKILL_STATS_FROM_TAGS = `
  INSERT INTO skill_stats (skill, job_count)
  SELECT BTRIM(skill), COUNT(DISTINCT j.db_id)
  FROM jobs j
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(j.tags, '[]'::jsonb)) AS tag(skill)
  WHERE j.status = 'success' AND BTRIM(skill) != ''
  GROUP BY BTRIM(skill)
`;

// Which source the rebuild will use. The existence check comes first because
// production has no job_skills table: querying it there would throw and roll
// back the whole aggregate rebuild, taking every other rollup with it.
export async function skillStatsSource(client) {
  const { rows: [tables] } = await client.query(
    `SELECT to_regclass('public.job_skills') IS NOT NULL
        AND to_regclass('public.job_skill_scans') IS NOT NULL AS present`
  );
  if (!tables.present) return "tags";
  const { rows: [data] } = await client.query(
    `SELECT EXISTS (
              SELECT 1 FROM job_skills js JOIN jobs j ON j.apply_url_md5 = js.job_md5
               WHERE j.status = 'success') AS has_skills,
            (SELECT count(*) FROM jobs WHERE status = 'success')::float8 AS live,
            (SELECT count(*) FROM job_skill_scans s JOIN jobs j ON j.apply_url_md5 = s.job_md5
              WHERE j.status = 'success')::float8 AS scanned`
  );
  const coverage = data.live > 0 ? data.scanned / data.live : 0;
  return data.has_skills && coverage >= MIN_SCAN_COVERAGE ? "job_skills" : "tags";
}

export async function rebuildSkillStats(client) {
  const source = await skillStatsSource(client);
  await client.query(`DELETE FROM skill_stats`);
  const { rowCount } = await client.query(
    source === "job_skills" ? SKILL_STATS_FROM_JOB_SKILLS : SKILL_STATS_FROM_TAGS
  );
  return { source, rows: rowCount };
}
