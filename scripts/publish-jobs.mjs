import path from "node:path";
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig } from "../lib/pg-config.mjs";
import { rebuildSkillStats } from "../lib/skills/skill-stats.mjs";

const root = process.cwd();
loadEnvFile(path.join(root, ".env.local"));

const { Pool } = pg;
// Same connection resolution as the app (lib/db.js), including TLS for a
// managed host such as Aiven. Publishing is batched, so it keeps its own
// smaller ceiling rather than the app's.
const pool = new Pool(buildPgConfig({ max: 4 }));

// Publishing runs on the application host, so use the internal Next.js origin.
// PUBLIC_BASE_URL remains reserved for canonical URLs and sitemap generation.
const publishBaseUrl = (
  process.env.PUBLISH_INTERNAL_BASE_URL || "http://127.0.0.1:3000/jobs"
).replace(/\/$/, "");
const secret = process.env.REVALIDATE_SECRET || "";
const batchSize = Math.min(400, Number(process.env.PUBLISH_BATCH_SIZE || 400));
const maxJobs = Number(process.env.PUBLISH_MAX_JOBS || 10000);
const concurrency = Math.max(1, Number(process.env.PUBLISH_CONCURRENCY || 8));
const warmNewestLimit = Math.max(1, Number(process.env.WARM_NEWEST_LIMIT || 5000));
const warmFacetLimit = Math.max(0, Number(process.env.WARM_FACET_LIMIT || 100));
const mode = process.argv[2] || "publish";

// Must match AGGREGATE_TAG in lib/jobs.js. Only the caches backed by the rollup
// tables refreshAggregates() rebuilds carry this tag. Revalidating "jobs" here
// instead -- as this script used to -- flushes every job page on the site.
const AGGREGATE_TAG = "jobs-aggregates";

// Mirrors titleSlug() in lib/format.mjs, which is what /titles links with and
// what the /title/[slug] route expects.
function titleSlug(canonicalTitle = "") {
  return `${canonicalTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-jobs`;
}

async function refreshAggregates(client) {
  await client.query("BEGIN");
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS skill_stats (
        skill VARCHAR(300) PRIMARY KEY,
        job_count BIGINT DEFAULT 0
      )
    `);
    // skill_stats is not truncated here: rebuildSkillStats() replaces it below,
    // choosing job_skills or jobs.tags as its source.
    await client.query(`
      TRUNCATE TABLE companies, location_stats, site_metrics, title_stats,
                     country_stats, remote_title_stats, salary_tier_stats
    `);
    await client.query(`
      INSERT INTO companies (slug, name, job_count)
      WITH variants AS (
        SELECT company_slug, company, COUNT(*) AS variant_count
        FROM jobs
        WHERE status='success' AND company_slug != ''
        GROUP BY company_slug, company
      )
      SELECT company_slug,
             (ARRAY_AGG(
               company
               ORDER BY (company = LOWER(company)), variant_count DESC, company
             ))[1],
             SUM(variant_count)
      FROM variants
      GROUP BY company_slug
    `);
    await client.query(`
      INSERT INTO location_stats (location_slug, job_count)
      SELECT jl.location_slug, COUNT(DISTINCT jl.job_md5)
      FROM job_locations jl
      JOIN jobs j ON j.apply_url_md5 = jl.job_md5
      WHERE j.status='success' AND jl.location_slug NOT IN ('', 'remote')
      GROUP BY jl.location_slug
    `);
    await client.query(`
      INSERT INTO site_metrics (
        id, total_jobs, total_remote, total_100k_plus, total_companies, updated_at
      )
      SELECT 1, COUNT(*), COUNT(*) FILTER (WHERE remote=1),
             COUNT(*) FILTER (WHERE salary_annual_usd >= 100000),
             COUNT(DISTINCT company_slug), NOW()
      FROM jobs WHERE status='success'
    `);
    await client.query(`
      INSERT INTO title_stats (canonical_title, job_count)
      SELECT canonical_title, COUNT(*)
      FROM jobs
      WHERE status='success' AND canonical_title NOT IN ('', 'Other')
      GROUP BY canonical_title
    `);
    const skillStats = await rebuildSkillStats(client);
    console.log(`skill_stats: ${skillStats.rows} skills, built from ${skillStats.source}`);
    await client.query(`
      INSERT INTO country_stats (country_slug, country_label, job_count)
      SELECT jl.country_slug, MAX(jl.country_label), COUNT(DISTINCT jl.job_md5)
      FROM job_locations jl
      JOIN jobs j ON j.apply_url_md5 = jl.job_md5
      WHERE j.status='success' AND jl.country_slug != ''
      GROUP BY jl.country_slug
    `);
    await client.query(`
      INSERT INTO remote_title_stats (canonical_title, job_count)
      SELECT canonical_title, COUNT(*)
      FROM jobs
      WHERE remote=1 AND status='success'
        AND canonical_title NOT IN ('', 'Other')
      GROUP BY canonical_title
    `);
    await client.query(`
      INSERT INTO salary_tier_stats (tier, job_count)
      VALUES
        ('100k-plus', (SELECT COUNT(*) FROM jobs WHERE status='success' AND salary_annual_usd >= 100000)),
        ('150k-plus', (SELECT COUNT(*) FROM jobs WHERE status='success' AND salary_annual_usd >= 150000)),
        ('200k-plus', (SELECT COUNT(*) FROM jobs WHERE status='success' AND salary_annual_usd >= 200000)),
        ('250k-plus', (SELECT COUNT(*) FROM jobs WHERE status='success' AND salary_annual_usd >= 250000))
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function revalidate(tags, paths) {
  const response = await fetch(`${publishBaseUrl}/api/revalidate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ tags, paths }),
  });
  if (!response.ok) {
    throw new Error(`Revalidation failed (${response.status}): ${await response.text()}`);
  }
}

async function preparePendingHashes(client) {
  const result = await client.query(`
    UPDATE jobs
    SET render_hash = encode(
      sha256(convert_to(
        concat_ws('|', apply_url_md5, title, company, description, status),
        'UTF8'
      )),
      'hex'
    )
    WHERE status='success' AND render_hash IS NULL
  `);
  if (result.rowCount > 0) {
    console.log(`Prepared ${result.rowCount} newly inserted job pages for publishing.`);
  }
}

// The facet pages read searchParams, so Next renders them per request rather
// than serving them from the route cache -- warming them populates the
// unstable_cache data entries behind them, which is what actually keeps the
// render off Postgres.
//
// The /title and /company listings resolve their slug through title_stats and
// companies, so they carry AGGREGATE_TAG and the revalidation above genuinely
// empties them; warming re-fills them before the next visitor arrives. The
// rest read only the jobs table and are on a 600s TTL, so warming them just
// keeps a fresh entry in place rather than letting it lapse to a cold visitor.
async function listingPaths(client) {
  const paths = [
    "/",
    "/remote",
    "/titles",
    "/locations",
    "/companies",
    "/salaries",
    "/categories",
  ];
  if (warmFacetLimit === 0) return paths;

  const [titles, companies, locations, countries, tiers] = await Promise.all([
    client.query(
      `SELECT canonical_title FROM title_stats
       ORDER BY job_count DESC, canonical_title LIMIT $1`,
      [warmFacetLimit]
    ),
    client.query(
      `SELECT slug FROM companies WHERE slug != ''
       ORDER BY job_count DESC, name LIMIT $1`,
      [warmFacetLimit]
    ),
    client.query(
      `SELECT location_slug FROM location_stats WHERE location_slug != ''
       ORDER BY job_count DESC, location_slug LIMIT $1`,
      [warmFacetLimit]
    ),
    client.query(
      `SELECT country_slug FROM country_stats WHERE country_slug != ''
       ORDER BY job_count DESC, country_slug LIMIT $1`,
      [warmFacetLimit]
    ),
    client.query("SELECT tier FROM salary_tier_stats"),
  ]);

  for (const row of titles.rows) paths.push(`/title/${titleSlug(row.canonical_title)}`);
  for (const row of companies.rows) paths.push(`/company/${row.slug}`);
  for (const row of locations.rows) paths.push(`/location/${row.location_slug}`);
  for (const row of countries.rows) paths.push(`/country/${row.country_slug}`);
  for (const row of tiers.rows) paths.push(`/salary/${row.tier}`);
  return paths;
}

async function warmListingPages(client) {
  const paths = await listingPaths(client);
  const failures = await runWorkers(
    paths.map((path) => ({ db_id: path, path })),
    async (item) => {
      const response = await fetch(`${publishBaseUrl}${item.path === "/" ? "" : item.path}`, {
        redirect: "follow",
        headers: { "user-agent": "LeadNear-Jobs-Nightly-Publisher/1.0" },
      });
      if (!response.ok) {
        throw new Error(`Warm failed for ${item.path}: HTTP ${response.status}`);
      }
    }
  );
  console.log(`Warmed ${paths.length - failures.length}/${paths.length} listing pages.`);
  if (failures.length) {
    console.error(JSON.stringify({ listingFailures: failures }, null, 2));
  }
}

async function requestJobPage(job) {
  const response = await fetch(`${publishBaseUrl}/${job.job_slug}`, {
    redirect: "follow",
    headers: { "user-agent": "LeadNear-Jobs-Nightly-Publisher/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Warm failed for job ${job.db_id}: HTTP ${response.status}`);
  }
  return response.headers.get("x-nextjs-cache") || "UNKNOWN";
}

async function publishJob(job) {
  await requestJobPage(job);
  await pool.query(
    `UPDATE jobs
     SET published_render_hash=$1, published_at=NOW()
     WHERE db_id=$2 AND render_hash=$1`,
    [job.render_hash, job.db_id]
  );
}

async function runWorkers(items, worker, { progress = false } = {}) {
  let cursor = 0;
  let completed = 0;
  const failures = [];
  async function run() {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        await worker(item);
      } catch (error) {
        failures.push({ id: item.db_id, error: error.message });
      } finally {
        completed += 1;
        if (progress && (completed % 100 === 0 || completed === items.length)) {
          console.log(`Warmed ${completed}/${items.length} pages...`);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return failures;
}

async function withAdvisoryLock(lockName, callback) {
  const lockClient = await pool.connect();
  try {
    const lock = await lockClient.query(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [lockName]
    );
    if (!lock.rows[0].acquired) {
      console.log(`Another ${lockName} run is active; exiting.`);
      return;
    }
    return await callback(lockClient);
  } finally {
    await lockClient.query(
      "SELECT pg_advisory_unlock(hashtext($1))",
      [lockName]
    ).catch(() => {});
    lockClient.release();
  }
}

async function publishPendingJobs() {
  if (!secret) throw new Error("REVALIDATE_SECRET is required");

  await withAdvisoryLock("leadnear-jobs-nightly-publisher", async (lockClient) => {
    await preparePendingHashes(lockClient);
    await refreshAggregates(lockClient);
    const pending = await lockClient.query(
      `SELECT db_id, job_slug, render_hash
       FROM jobs
       WHERE render_hash IS NOT NULL
         AND published_render_hash IS DISTINCT FROM render_hash
       ORDER BY updated_at, db_id
       LIMIT $1`,
      [maxJobs]
    );

    // Only the rollup-backed caches, never "jobs" -- see AGGREGATE_TAG above.
    await revalidate([AGGREGATE_TAG, "site-metrics"], ["/"]);
    await warmListingPages(lockClient);
    if (!pending.rows.length) {
      console.log("Aggregates refreshed; no job pages need publishing.");
      return;
    }

    const failures = [];
    for (let start = 0; start < pending.rows.length; start += batchSize) {
      const batch = pending.rows.slice(start, start + batchSize);
      await revalidate(
        batch.map((job) => `job:${job.job_slug || job.db_id}`),
        batch.map((job) => `/${job.job_slug}`)
      );
      failures.push(...await runWorkers(batch, publishJob));
    }
    console.log(`Published ${pending.rows.length - failures.length}/${pending.rows.length} job pages.`);
    if (failures.length) {
      console.error(JSON.stringify({ failures }, null, 2));
      process.exitCode = 1;
    }
  });
}

async function refreshHomepageCounts() {
  if (!secret) throw new Error("REVALIDATE_SECRET is required");

  await withAdvisoryLock("leadnear-jobs-nightly-publisher", async (lockClient) => {
    const result = await lockClient.query(`
      INSERT INTO site_metrics (
        id, total_jobs, total_remote, total_100k_plus, total_companies, updated_at
      )
      SELECT 1, COUNT(*), COUNT(*) FILTER (WHERE remote=1),
             COUNT(*) FILTER (WHERE salary_annual_usd >= 100000),
             COUNT(DISTINCT company_slug), NOW()
      FROM jobs
      WHERE status='success'
      ON CONFLICT (id) DO UPDATE SET
        total_jobs = EXCLUDED.total_jobs,
        total_remote = EXCLUDED.total_remote,
        total_100k_plus = EXCLUDED.total_100k_plus,
        total_companies = EXCLUDED.total_companies,
        updated_at = EXCLUDED.updated_at
      RETURNING total_jobs, total_remote, total_100k_plus, total_companies, updated_at
    `);

    await revalidate(["site-metrics"], ["/"]);
    console.log(`COUNTS_REFRESHED ${JSON.stringify(result.rows[0])}`);
  });
}

async function warmNewestJobs() {
  await withAdvisoryLock("leadnear-jobs-newest-page-warmer", async (lockClient) => {
    const newest = await lockClient.query(
      `SELECT db_id, job_slug
       FROM jobs
       WHERE status = 'success'
       ORDER BY posted_at DESC NULLS LAST, created_at DESC, db_id DESC
       LIMIT $1`,
      [warmNewestLimit]
    );

    if (!newest.rows.length) {
      console.log("No active jobs were found to warm.");
      return;
    }

    console.log(
      `Warming the newest ${newest.rows.length} job pages with concurrency ${concurrency}.`
    );
    const cacheCounts = {};
    const failures = await runWorkers(
      newest.rows,
      async (job) => {
        const cacheStatus = await requestJobPage(job);
        cacheCounts[cacheStatus] = (cacheCounts[cacheStatus] || 0) + 1;
      },
      { progress: true }
    );

    console.log(
      `Warmed ${newest.rows.length - failures.length}/${newest.rows.length} newest job pages.`
    );
    console.log(`Cache responses: ${JSON.stringify(cacheCounts)}`);
    if (failures.length) {
      console.error(JSON.stringify({ failures }, null, 2));
      process.exitCode = 1;
    }
  });
}

async function main() {
  try {
    if (mode === "warm-newest") {
      await warmNewestJobs();
    } else if (mode === "refresh-counts") {
      await refreshHomepageCounts();
    } else if (mode === "publish") {
      await publishPendingJobs();
    } else {
      throw new Error(`Unknown mode: ${mode}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
