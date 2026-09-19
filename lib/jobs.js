// lib/jobs.js — All DB queries for job board pages

import { createHash } from "node:crypto";
import { query, queryOne } from "./db";
import { unstable_cache } from "next/cache";
// Re-export pure formatters so server pages can import everything from one place
export { fmtSalary, fmtDate, initials, titleSlug } from "./format";

const PAGE_SIZE = 20;
const SQL_SLUG =
  "regexp_replace(regexp_replace(lower(COALESCE(??, '')), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')";

const TYPE_LABELS = {
  "full-time": "Full-Time",
  "part-time": "Part-Time",
  contract: "Contract",
  temporary: "Temporary",
  internship: "Internship",
  volunteer: "Volunteer",
  "per-diem": "Per Diem",
  other: "Other",
};

function typeCondition(slug) {
  switch (slug) {
    case "full-time":
      return "lower(COALESCE(employment_type, '')) IN ('full_time','fulltime','full-time','full time','full-time permanent','permanent full time','permanent full-time','regular full-time','full-time employee','f/t','ft','fte','employee','permanent') OR lower(COALESCE(employment_type, '')) LIKE '%full%time%'";
    case "part-time":
      return "lower(COALESCE(employment_type, '')) IN ('part_time','parttime','part-time','part time','p/t','pt') OR lower(COALESCE(employment_type, '')) LIKE '%part%time%'";
    case "contract":
      return "lower(COALESCE(employment_type, '')) LIKE '%contract%'";
    case "temporary":
      return "lower(COALESCE(employment_type, '')) LIKE '%temporary%' OR lower(COALESCE(employment_type, '')) LIKE '%seasonal%' OR lower(COALESCE(employment_type, '')) = 'temp'";
    case "internship":
      return "lower(COALESCE(employment_type, '')) LIKE '%intern%'";
    case "volunteer":
      return "lower(COALESCE(employment_type, '')) LIKE '%volunteer%'";
    case "per-diem":
      return "lower(COALESCE(employment_type, '')) IN ('per_diem','per-diem','per diem') OR lower(COALESCE(employment_type, '')) LIKE '%per diem%'";
    case "other":
      return "lower(COALESCE(employment_type, '')) = 'other'";
    default:
      return null;
  }
}

// Next.js rejects cache tags longer than 256 chars (e.g. a job's canonical_title
// or a malformed /location/[slug] request can blow past that). Truncate and
// suffix with a hash so distinct long values don't collide on the same prefix.
const MAX_TAG_LENGTH = 256;

function safeTag(tag) {
  if (tag.length <= MAX_TAG_LENGTH) return tag;
  const hash = createHash("sha1").update(tag).digest("hex").slice(0, 10);
  return `${tag.slice(0, MAX_TAG_LENGTH - hash.length - 1)}-${hash}`;
}

// Cache tag taxonomy. These are deliberately separate:
//
//   "jobs"            Caches whose contents come from the jobs table itself.
//   "jobs-aggregates" Caches backed by the rollup tables (title_stats,
//                     companies, location_stats, ...) that publish-jobs.mjs
//                     TRUNCATEs and rebuilds on every run.
//
// Every cache here used to carry "jobs", and the publisher revalidated that tag
// at the start of each run purely to pick up the rebuilt rollups. That flushed
// all ~900k job pages every four hours while re-rendering only the handful whose
// render_hash had changed, so the site sat cold between runs. Rollup-backed
// caches now carry "jobs-aggregates" instead, and the publisher revalidates only
// that -- job pages stay cached until their own "job:<slug>" tag says otherwise.
const AGGREGATE_TAG = "jobs-aggregates";

// Listing caches used to rely on that four-hourly flush as their only freshness
// mechanism, since revalidate:false never expires on its own. Without the flush
// they need a TTL, or newly imported jobs would never appear in a facet listing.
// 600s matches getStats() below and the revalidate on the /titles, /locations,
// and /companies pages.
//
// Deliberately NOT applied to getJobCached or the relatedBy* helpers: those are
// the only caches app/[slug]/page.jsx reads, that route is `revalidate = false`,
// and an unstable_cache TTL propagates to the route segment -- setting one would
// silently convert ~900k permanently-cached job pages into 10-minute ISR.
const LISTING_TTL_SECONDS = 600;

function cached(keyParts, tags, fn, revalidate = false) {
  return unstable_cache(fn, keyParts, { tags: tags.map(safeTag), revalidate })();
}

// ─── Attach locations array to each job ──────────────────────────────────────

async function attachLocations(jobs) {
  if (!jobs.length) return jobs;
  const md5s = jobs.map((j) => j.apply_url_md5).filter(Boolean);
  if (!md5s.length) return jobs;
  const ph = md5s.map(() => "?").join(",");
  const locs = await query(
    `SELECT job_md5, location_slug, country_slug FROM job_locations WHERE job_md5 IN (${ph}) AND location_slug != ''`,
    md5s
  );
  const map = {};
  for (const l of locs) {
    if (!map[l.job_md5]) map[l.job_md5] = [];
    if (l.location_slug && !map[l.job_md5].includes(l.location_slug)) {
      map[l.job_md5].push(l.location_slug);
    }
  }
  return jobs.map((j) => ({ ...j, locations: map[j.apply_url_md5] ?? [] }));
}

// ─── Search / filter ─────────────────────────────────────────────────────────
export async function searchJobs({ q, location, ats, remote, type, salary_min, category, days, page = 1, sort }) {
  const conds = ["j.status = 'success'"];
  const vals  = [];

  if (q?.trim().length >= 2) {
    conds.push(
      "to_tsvector('simple', COALESCE(j.title, '') || ' ' || COALESCE(j.company, '')) @@ to_tsquery('simple', ?)"
    );
    vals.push(
      q.trim()
        .split(/\s+/)
        .map((word) => word.replace(/[^\p{L}\p{N}]+/gu, ""))
        .filter(Boolean)
        .map((word) => `${word}:*`)
        .join(" & ")
    );
  }
  if (ats)          { conds.push("j.source = ?");                    vals.push(ats); }
  if (location?.trim()) {
    const locationSlug = location.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    conds.push(`EXISTS (
      SELECT 1 FROM job_locations search_location
      WHERE search_location.job_md5 = j.apply_url_md5
        AND (search_location.location_slug = ? OR search_location.country_slug = ?)
    )`);
    vals.push(locationSlug, locationSlug);
  }
  if (remote === "1") conds.push("j.remote = 1");
  if (type) {
    const normalizedType = type.toLowerCase().replace(/[_\s]+/g, "-");
    const condition = typeCondition(normalizedType);
    if (condition) conds.push(`(${condition})`);
  }
  if (salary_min) { conds.push("j.salary_annual_usd >= ?");        vals.push(Number(salary_min)); }
  if (category)   { conds.push("? = ANY(string_to_array(j.category_slugs, ','))"); vals.push(category); }
  if (days)       { conds.push("j.posted_at >= NOW() - (? * INTERVAL '1 day')"); vals.push(Number(days)); }

  const where  = conds.join(" AND ");
  const offset = (Number(page) - 1) * PAGE_SIZE;

  // "fit" (best-fit / resume match) has no backing subsystem yet — the UI
  // renders that option disabled, but fall back to the default order here
  // too rather than erroring on an unexpected value.
  const orderBy = sort === "salary"
    ? "j.salary_annual_usd DESC NULLS LAST, j.posted_at DESC"
    : "j.posted_at DESC";

  const [{ total }] = await query(`SELECT COUNT(*) as total FROM jobs j WHERE ${where}`, vals);
  const jobs = await query(
    `SELECT j.db_id, j.job_slug, j.apply_url_md5, j.title, j.canonical_title, j.company, j.company_slug,
            j.employment_type, j.remote, j.salary_min, j.salary_max, j.salary_currency,
            j.salary_period, j.posted_at, j.status, j.apply_url
     FROM jobs j WHERE ${where}
     ORDER BY ${orderBy}
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    vals
  );

  return { jobs: await attachLocations(jobs), total, page: Number(page), pageSize: PAGE_SIZE };
}

// ─── By title slug ────────────────────────────────────────────────────────────
async function getByTitleRaw(slug, page = 1) {
  const titleSlugSql = SQL_SLUG.replace("??", "canonical_title");
  const offset = (Number(page) - 1) * PAGE_SIZE;
  const titleRow = await queryOne(
    `SELECT canonical_title
     FROM title_stats
     WHERE ${titleSlugSql} || '-jobs' = ?
     ORDER BY job_count DESC
     LIMIT 1`,
    [slug]
  );
  const canon = titleRow?.canonical_title ??
    slug.replace(/-jobs$/, "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const [{ total }] = await query("SELECT COUNT(*) as total FROM jobs WHERE canonical_title = ? AND status='success'", [canon]);
  const jobs = await query(
    `SELECT db_id, job_slug, apply_url_md5, title, canonical_title, company, company_slug,
            employment_type, remote, salary_min, salary_max, salary_currency, salary_period,
            posted_at, apply_url, status
     FROM jobs WHERE canonical_title = ? AND status='success'
     ORDER BY posted_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    [canon]
  );
  return { jobs: await attachLocations(jobs), total, canon, page: Number(page), pageSize: PAGE_SIZE };
}

// ─── By category slug ─────────────────────────────────────────────────────────
async function getCategoryTotalRaw(slug) {
  const row = await queryOne(
    "SELECT COUNT(*) as total FROM jobs WHERE ? = ANY(string_to_array(category_slugs, ',')) AND status='success'",
    [slug]
  );
  return Number(row?.total || 0);
}

async function getByCategoryRaw(slug, page = 1) {
  const offset = (Number(page) - 1) * PAGE_SIZE;
  const total = await getCategoryTotal(slug);
  const jobs = await query(
    `SELECT db_id, job_slug, apply_url_md5, title, canonical_title, company, company_slug,
            employment_type, remote, salary_min, salary_max, salary_currency, salary_period,
            posted_at, apply_url, status
     FROM jobs WHERE ? = ANY(string_to_array(category_slugs, ',')) AND status='success'
     ORDER BY posted_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    [slug]
  );
  return { jobs: await attachLocations(jobs), total, slug, page: Number(page), pageSize: PAGE_SIZE };
}

// ─── By country slug ──────────────────────────────────────────────────────────
async function getByCountryRaw(slug, page = 1) {
  const offset = (Number(page) - 1) * PAGE_SIZE;
  const [{ total }] = await query(
    `SELECT COUNT(DISTINCT j.db_id) as total
     FROM jobs j JOIN job_locations jl ON j.apply_url_md5 = jl.job_md5
     WHERE jl.country_slug = ? AND j.status='success'`, [slug]
  );
  const jobs = await query(
    `SELECT DISTINCT j.db_id, j.job_slug, j.apply_url_md5, j.title, j.canonical_title, j.company, j.company_slug,
            j.employment_type, j.remote, j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
            j.posted_at, j.apply_url, j.status
     FROM jobs j JOIN job_locations jl ON j.apply_url_md5 = jl.job_md5
     WHERE jl.country_slug = ? AND j.status='success'
     ORDER BY j.posted_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    [slug]
  );
  const label = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return { jobs: await attachLocations(jobs), total, slug, label, page: Number(page), pageSize: PAGE_SIZE };
}

// ─── By location slug (city) ──────────────────────────────────────────────────
async function getByLocationRaw(slug, page = 1) {
  const offset = (Number(page) - 1) * PAGE_SIZE;
  const [{ total }] = await query(
    `SELECT COUNT(DISTINCT j.db_id) as total
     FROM jobs j JOIN job_locations jl ON j.apply_url_md5 = jl.job_md5
     WHERE jl.location_slug = ? AND j.status='success'`, [slug]
  );
  const jobs = await query(
    `SELECT DISTINCT j.db_id, j.job_slug, j.apply_url_md5, j.title, j.canonical_title, j.company, j.company_slug,
            j.employment_type, j.remote, j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
            j.posted_at, j.apply_url, j.status
     FROM jobs j JOIN job_locations jl ON j.apply_url_md5 = jl.job_md5
     WHERE jl.location_slug = ? AND j.status='success'
     ORDER BY j.posted_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    [slug]
  );
  const label = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return { jobs: await attachLocations(jobs), total, slug, label, page: Number(page), pageSize: PAGE_SIZE };
}

// ─── By salary tier ───────────────────────────────────────────────────────────
const SALARY_TIERS = { "100k-plus": 100000, "150k-plus": 150000, "200k-plus": 200000, "250k-plus": 250000 };
async function getBySalaryRaw(tier, page = 1) {
  const min    = SALARY_TIERS[tier] ?? 100000;
  const offset = (Number(page) - 1) * PAGE_SIZE;
  const [{ total }] = await query(
    "SELECT COUNT(*) as total FROM jobs WHERE salary_annual_usd >= ? AND status='success'", [min]
  );
  const jobs = await query(
    `SELECT db_id, job_slug, apply_url_md5, title, canonical_title, company, company_slug,
            employment_type, remote, salary_min, salary_max, salary_currency, salary_period,
            posted_at, apply_url, status, salary_annual_usd
     FROM jobs WHERE salary_annual_usd >= ? AND status='success'
     ORDER BY salary_annual_usd DESC, posted_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    [min]
  );
  return { jobs: await attachLocations(jobs), total, tier, min, page: Number(page), pageSize: PAGE_SIZE };
}

// ─── By company slug ──────────────────────────────────────────────────────────
async function getByCompanyRaw(slug, page = 1) {
  const offset  = (Number(page) - 1) * PAGE_SIZE;
  const company = await queryOne("SELECT slug, name, job_count FROM companies WHERE slug = ?", [slug]);
  const [{ total }] = await query("SELECT COUNT(*) as total FROM jobs WHERE company_slug = ? AND status='success'", [slug]);
  const jobs = await query(
    `SELECT db_id, job_slug, apply_url_md5, title, canonical_title, company, company_slug,
            employment_type, remote, salary_min, salary_max, salary_currency, salary_period,
            posted_at, apply_url, status
     FROM jobs WHERE company_slug = ? AND status='success'
     ORDER BY posted_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    [slug]
  );
  return { company: company ?? { slug, name: slug, job_count: total }, jobs: await attachLocations(jobs), total, page: Number(page), pageSize: PAGE_SIZE };
}

// ─── By employment type ──────────────────────────────────────────────────────
async function getByTypeRaw(slug, page = 1) {
  const condition = typeCondition(slug);
  if (!condition) return { jobs: [], total: 0, slug, label: slug, page: Number(page), pageSize: PAGE_SIZE };
  const offset = (Number(page) - 1) * PAGE_SIZE;
  const [{ total }] = await query(
    `SELECT COUNT(*) as total FROM jobs WHERE status='success' AND (${condition})`
  );
  const jobs = await query(
    `SELECT db_id, job_slug, apply_url_md5, title, canonical_title, company, company_slug,
            employment_type, remote, salary_min, salary_max, salary_currency, salary_period,
            posted_at, apply_url, status
     FROM jobs WHERE status='success' AND (${condition})
     ORDER BY posted_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`
  );
  return {
    jobs: await attachLocations(jobs),
    total,
    slug,
    label: TYPE_LABELS[slug] || slug,
    page: Number(page),
    pageSize: PAGE_SIZE,
  };
}

// ─── Single job detail ────────────────────────────────────────────────────────
export async function getJob(slug) {
  const job = await queryOne(
    `SELECT
        j.db_id, j.job_slug, j.id, j.apply_url, j.apply_url_md5,
        j.title, j.canonical_title, j.company, j.company_slug,
        j.description, j.employment_type, j.department,
        j.remote, j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
        j.salary_annual_usd, j.posted_at, j.source, j.source_slug,
        j.street_address, j.postal_code, j.address_region, j.address_country,
        j.valid_through,
        j.category_slugs, j.tags, j.status, j.created_at, j.updated_at,
        string_agg(DISTINCT jl.location_raw, '|||' ORDER BY jl.location_raw) as loc_raw,
        string_agg(DISTINCT jl.location_slug, ',' ORDER BY jl.location_slug) as loc_slugs,
        string_agg(DISTINCT jl.country_slug, ',' ORDER BY jl.country_slug) as country_slugs,
        string_agg(DISTINCT jl.country_label, ',' ORDER BY jl.country_label) as country_labels
     FROM jobs j
     LEFT JOIN job_locations jl ON j.apply_url_md5 = jl.job_md5
     WHERE j.job_slug = ?
     GROUP BY j.db_id`,
    [slug]
  );
  if (!job) return null;

  // Parse locations
  job.locations = (job.loc_raw || "")
    .split("|||")
    .map((l) => l.trim())
    .filter((l) => l && l !== "null");

  // Parse tags JSON
  if (job.tags && typeof job.tags === "string") {
    try { job.tags = JSON.parse(job.tags); } catch { job.tags = []; }
  }
  if (!Array.isArray(job.tags)) job.tags = [];

  return job;
}

export function getJobCached(slug) {
  return cached(
    ["job-by-slug", String(slug)],
    ["jobs", `job:${slug}`],
    () => getJob(slug)
  );
}

const RELATED_POOL_SIZE = 40;

async function getRelatedByTitleRaw(canonicalTitle) {
  const jobs = await query(
    `SELECT db_id, job_slug, apply_url_md5, title, canonical_title, company, company_slug,
            employment_type, remote, salary_min, salary_max, salary_currency,
            salary_period, posted_at, apply_url, status
     FROM jobs
     WHERE status='success' AND canonical_title = ?
     ORDER BY posted_at DESC NULLS LAST, db_id DESC
     LIMIT ${RELATED_POOL_SIZE}`,
    [canonicalTitle]
  );
  return attachLocations(jobs);
}

async function getRelatedByCompanyRaw(companySlug) {
  const jobs = await query(
    `SELECT db_id, job_slug, apply_url_md5, title, canonical_title, company, company_slug,
            employment_type, remote, salary_min, salary_max, salary_currency,
            salary_period, posted_at, apply_url, status
     FROM jobs
     WHERE status='success' AND company_slug = ?
     ORDER BY posted_at DESC NULLS LAST, db_id DESC
     LIMIT ${RELATED_POOL_SIZE}`,
    [companySlug]
  );
  return attachLocations(jobs);
}

function relatedByTitle(canonicalTitle) {
  return cached(
    ["related-jobs-title", canonicalTitle],
    ["jobs", `related-title:${canonicalTitle}`],
    () => getRelatedByTitleRaw(canonicalTitle)
  );
}

function relatedByCompany(companySlug) {
  return cached(
    ["related-jobs-company", companySlug],
    ["jobs", `related-company:${companySlug}`],
    () => getRelatedByCompanyRaw(companySlug)
  );
}

function normalizedEmploymentType(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function getRelatedJobs(job, limit = 6) {
  const canonicalTitle = job.canonical_title?.trim();
  const useTitle = canonicalTitle && canonicalTitle.toLowerCase() !== "other";
  const titleCandidates = useTitle ? await relatedByTitle(canonicalTitle) : [];

  const candidates = titleCandidates.map((candidate) => ({
    ...candidate,
    relatedSourceScore: 100,
  }));

  if (candidates.filter((candidate) => candidate.db_id !== job.db_id).length < limit * 2 && job.company_slug) {
    const companyCandidates = await relatedByCompany(job.company_slug);
    candidates.push(...companyCandidates.map((candidate) => ({
      ...candidate,
      relatedSourceScore: 30,
    })));
  }

  const currentEmploymentType = normalizedEmploymentType(job.employment_type);
  const unique = new Map();
  for (const candidate of candidates) {
    if (candidate.db_id === job.db_id || unique.has(candidate.db_id)) continue;
    const employmentMatches = currentEmploymentType
      && normalizedEmploymentType(candidate.employment_type) === currentEmploymentType;
    const score = candidate.relatedSourceScore
      + (Number(candidate.remote) === Number(job.remote) ? 12 : 0)
      + (employmentMatches ? 8 : 0)
      + (candidate.company_slug === job.company_slug ? 2 : 0);
    unique.set(candidate.db_id, { ...candidate, relatedScore: score });
  }

  const ranked = [...unique.values()].sort((a, b) =>
    b.relatedScore - a.relatedScore
      || new Date(b.posted_at || 0).getTime() - new Date(a.posted_at || 0).getTime()
      || b.db_id - a.db_id
  );

  const selected = [];
  const deferred = [];
  const companyCounts = new Map();
  for (const candidate of ranked) {
    const companyKey = candidate.company_slug || candidate.company || String(candidate.db_id);
    const companyCount = companyCounts.get(companyKey) || 0;
    if (companyCount >= 2) {
      deferred.push(candidate);
      continue;
    }
    selected.push(candidate);
    companyCounts.set(companyKey, companyCount + 1);
    if (selected.length === limit) break;
  }

  if (selected.length < limit) {
    for (const candidate of deferred) {
      selected.push(candidate);
      if (selected.length === limit) break;
    }
  }

  return selected.slice(0, limit);
}


// ─── Homepage stats ───────────────────────────────────────────────────────────
async function getStatsRaw() {
  const totals = await queryOne(`
    SELECT total_jobs, total_remote, total_100k_plus, total_companies
    FROM site_metrics WHERE id = 1
  `);

  const topCompanies = await query(
    "SELECT slug, name, job_count FROM companies ORDER BY job_count DESC LIMIT 24"
  );
  const topLocations = await query(
    "SELECT location_slug, job_count FROM location_stats ORDER BY job_count DESC LIMIT 20"
  );
  const topTitles = await query(
    `SELECT canonical_title, job_count
     FROM title_stats ORDER BY job_count DESC LIMIT 30`
  );
  const countryCounts = await query(`
    SELECT country_slug, country_label, job_count
    FROM country_stats ORDER BY job_count DESC LIMIT 20
  `);
  const remoteRoles = await query(
    `SELECT canonical_title, job_count
     FROM remote_title_stats ORDER BY job_count DESC LIMIT 10`
  );

  return { totals: totals ?? {}, topCompanies, topLocations, topTitles, countryCounts, remoteRoles };
}

export async function getHomepageData() {
  const [stats, latest] = await Promise.all([
    getStats(),
    searchJobs({ page: 1 }),
  ]);
  const t = stats?.totals || {};
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      totalJobs: Number(t.total_jobs || 0),
      remoteJobs: Number(t.total_remote || 0),
      highSalaryJobs: Number(t.total_100k_plus || 0),
      companiesHiring: Number(t.total_companies || 0),
    },
    latestJobs: latest.jobs,
    remoteRoles: stats?.remoteRoles || [],
    salaryTiers: [
      { tier: "100k-plus", label: "$100K+" },
      { tier: "150k-plus", label: "$150K+" },
      { tier: "200k-plus", label: "$200K+" },
    ],
    topCompanies: stats?.topCompanies || [],
    topLocations: stats?.topLocations || [],
    countries: stats?.countryCounts || [],
    topTitles: stats?.topTitles || [],
  };
}

async function getPopularTitlesRaw(limit = 100) {
  return query(
    `SELECT canonical_title, job_count
     FROM title_stats
     WHERE COALESCE(canonical_title, '') != ''
     ORDER BY job_count DESC, canonical_title
     LIMIT ?`,
    [Number(limit) || 100]
  );
}

export function getStats() {
  return unstable_cache(getStatsRaw, ["site-stats"], {
    tags: ["site-metrics"],
    revalidate: 600,
  })();
}

export function getPopularTitles(limit = 100) {
  return cached(
    ["popular-titles", String(limit)],
    [AGGREGATE_TAG, "popular-titles"],
    () => getPopularTitlesRaw(limit),
    LISTING_TTL_SECONDS
  );
}

async function getPopularTitlesMinJobsRaw(minJobs = 100) {
  return query(
    `SELECT canonical_title, job_count
     FROM title_stats
     WHERE COALESCE(canonical_title, '') != '' AND job_count >= ?
     ORDER BY job_count DESC, canonical_title`,
    [Number(minJobs) || 100]
  );
}

export function getPopularTitlesMinJobs(minJobs = 100) {
  return cached(
    ["popular-titles-min", String(minJobs)],
    [AGGREGATE_TAG, "popular-titles"],
    () => getPopularTitlesMinJobsRaw(minJobs),
    LISTING_TTL_SECONDS
  );
}

async function getPopularCompaniesMinJobsRaw(minJobs = 100) {
  return query(
    `SELECT slug, name, job_count
     FROM companies
     WHERE COALESCE(slug, '') != '' AND job_count >= ?
     ORDER BY job_count DESC, name`,
    [Number(minJobs) || 100]
  );
}

export function getPopularCompaniesMinJobs(minJobs = 100) {
  return cached(
    ["popular-companies-min", String(minJobs)],
    [AGGREGATE_TAG, "popular-companies"],
    () => getPopularCompaniesMinJobsRaw(minJobs),
    LISTING_TTL_SECONDS
  );
}

async function getPopularLocationsMinJobsRaw(minJobs = 100) {
  return query(
    `SELECT location_slug, job_count
     FROM location_stats
     WHERE COALESCE(location_slug, '') != '' AND job_count >= ?
     ORDER BY job_count DESC, location_slug`,
    [Number(minJobs) || 100]
  );
}

export function getPopularLocationsMinJobs(minJobs = 100) {
  return cached(
    ["popular-locations-min", String(minJobs)],
    [AGGREGATE_TAG, "popular-locations"],
    () => getPopularLocationsMinJobsRaw(minJobs),
    LISTING_TTL_SECONDS
  );
}


async function getAtsSourcesRaw() {
  return query(`
    SELECT source, COUNT(*) AS job_count
    FROM jobs
    WHERE status='success' AND NULLIF(BTRIM(source), '') IS NOT NULL
    GROUP BY source
    ORDER BY job_count DESC, source
  `);
}

export function getAtsSources() {
  return cached(["ats-sources"], ["jobs"], getAtsSourcesRaw, LISTING_TTL_SECONDS);
}

// ─── Search autocomplete ────────────────────────────────────────────────────
// Suggestions come from the publisher's compact rollups, keeping keystroke
// requests cheap even though the jobs table contains more than a million rows.
export async function getAutocompleteSuggestions(input, kind = "query") {
  const term = String(input || "").trim().replace(/[%_\\]/g, "");
  if (term.length < 2) return [];

  const pattern = `${term}%`;
  const includeLocation = kind === "location";
  const results = includeLocation
    ? await Promise.allSettled([
        query(
          `SELECT initcap(replace(location_slug, '-', ' ')) AS value, job_count, 'location' AS type
           FROM location_stats
           WHERE location_slug LIKE lower(?) || '%'
           ORDER BY job_count DESC, location_slug LIMIT 8`,
          [term]
        ),
        query(
          `SELECT country_label AS value, job_count, 'location' AS type
           FROM country_stats
           WHERE country_label ILIKE ?
           ORDER BY job_count DESC, country_label LIMIT 8`,
          [pattern]
        ),
      ])
    : await Promise.allSettled([
        query(
          `SELECT canonical_title AS value, job_count, 'title' AS type
           FROM title_stats
           WHERE canonical_title ILIKE ?
           ORDER BY job_count DESC, canonical_title LIMIT 8`,
          [pattern]
        ),
        query(
          `SELECT skill AS value, job_count, 'skill' AS type
           FROM skill_stats
           WHERE skill ILIKE ?
           ORDER BY job_count DESC, skill LIMIT 8`,
          [pattern]
        ),
        query(
          `SELECT name AS value, job_count, 'company' AS type
           FROM companies
           WHERE name ILIKE ?
           ORDER BY job_count DESC, name LIMIT 8`,
          [pattern]
        ),
      ]);
  const rows = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);

  if (includeLocation && "remote".startsWith(term.toLowerCase())) {
    rows.push({ value: "Remote", job_count: Number.MAX_SAFE_INTEGER, type: "remote" });
  }

  const seen = new Set();
  return rows
    .sort((a, b) => Number(b.job_count || 0) - Number(a.job_count || 0) || String(a.value).localeCompare(String(b.value)))
    .filter((row) => {
      const key = `${row.type}:${String(row.value).toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return Boolean(row.value);
    })
    .slice(0, 8)
    .map(({ value, type }) => ({ value, type }));
}

export function getByTitle(slug, page = 1) {
  return cached(
    ["title-list", slug, String(page)],
    // Also AGGREGATE_TAG: getByTitleRaw resolves the slug through title_stats,
    // which refreshAggregates() rebuilds.
    [AGGREGATE_TAG, "jobs", `title:${slug}`],
    () => getByTitleRaw(slug, page),
    LISTING_TTL_SECONDS
  );
}

export function getByCategory(slug, page = 1) {
  return cached(
    ["category-list", slug, String(page)],
    ["jobs", `category:${slug}`],
    () => getByCategoryRaw(slug, page),
    LISTING_TTL_SECONDS
  );
}

export function getCategoryTotal(slug) {
  return cached(
    ["category-total", slug],
    ["jobs", `category:${slug}`],
    () => getCategoryTotalRaw(slug),
    LISTING_TTL_SECONDS
  );
}

export function getByCountry(slug, page = 1) {
  return cached(
    ["country-list", slug, String(page)],
    ["jobs", `country:${slug}`],
    () => getByCountryRaw(slug, page),
    LISTING_TTL_SECONDS
  );
}

export function getByLocation(slug, page = 1) {
  return cached(
    ["location-list", slug, String(page)],
    ["jobs", `location:${slug}`],
    () => getByLocationRaw(slug, page),
    LISTING_TTL_SECONDS
  );
}

export function getBySalary(tier, page = 1) {
  return cached(
    ["salary-list", tier, String(page)],
    ["jobs", `salary:${tier}`],
    () => getBySalaryRaw(tier, page),
    LISTING_TTL_SECONDS
  );
}

export function getByCompany(slug, page = 1) {
  return cached(
    ["company-list", slug, String(page)],
    // Also AGGREGATE_TAG: getByCompanyRaw resolves the slug through companies,
    // which refreshAggregates() rebuilds.
    [AGGREGATE_TAG, "jobs", `company:${slug}`],
    () => getByCompanyRaw(slug, page),
    LISTING_TTL_SECONDS
  );
}

export function getByType(slug, page = 1) {
  return cached(
    ["type-list", slug, String(page)],
    ["jobs", `type:${slug}`],
    () => getByTypeRaw(slug, page),
    LISTING_TTL_SECONDS
  );
}
