import { query, queryOne } from "@/lib/db";

const BASE_URL = (
  process.env.PUBLIC_BASE_URL || "https://www.leadnear.com/jobs"
).replace(/\/$/, "");

const TITLE_MIN_JOBS = 25;
const COMPANY_MIN_JOBS = 10;
const DEPARTMENT_MIN_JOBS = 25;

const SQL_SLUG =
  "regexp_replace(regexp_replace(lower(COALESCE(??, '')), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')";

const EMPLOYMENT_TYPES = [
  {
    slug: "full-time",
    condition:
      "lower(COALESCE(employment_type, '')) IN ('full_time','fulltime','full-time','full time','full-time permanent','permanent full time','permanent full-time','regular full-time','full-time employee','f/t','ft','fte','employee','permanent') OR lower(COALESCE(employment_type, '')) LIKE '%full%time%'",
  },
  {
    slug: "part-time",
    condition:
      "lower(COALESCE(employment_type, '')) IN ('part_time','parttime','part-time','part time','p/t','pt') OR lower(COALESCE(employment_type, '')) LIKE '%part%time%'",
  },
  {
    slug: "contract",
    condition: "lower(COALESCE(employment_type, '')) LIKE '%contract%'",
  },
  {
    slug: "temporary",
    condition:
      "lower(COALESCE(employment_type, '')) LIKE '%temporary%' OR lower(COALESCE(employment_type, '')) LIKE '%seasonal%' OR lower(COALESCE(employment_type, '')) = 'temp'",
  },
  {
    slug: "internship",
    condition: "lower(COALESCE(employment_type, '')) LIKE '%intern%'",
  },
  {
    slug: "volunteer",
    condition: "lower(COALESCE(employment_type, '')) LIKE '%volunteer%'",
  },
  {
    slug: "per-diem",
    condition:
      "lower(COALESCE(employment_type, '')) IN ('per_diem','per-diem','per diem') OR lower(COALESCE(employment_type, '')) LIKE '%per diem%'",
  },
  {
    slug: "other",
    condition: "lower(COALESCE(employment_type, '')) = 'other'",
  },
];

function entry(path, lastModified, changeFrequency = "daily", priority = 0.7) {
  return {
    url: `${BASE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  };
}

function databaseUnavailableEntries() {
  return [
    { url: BASE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE_URL}/titles`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/companies`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/locations`, changeFrequency: "daily", priority: 0.7 },
  ];
}

// Next sets this during `next build` (next/dist/build/index.js). It is absent
// when the built server handles a request, which is how this module tells a
// database-less build apart from a database failure in production.
const PRODUCTION_BUILD_PHASE = "phase-production-build";

function isProductionBuild() {
  return process.env.NEXT_PHASE === PRODUCTION_BUILD_PHASE;
}

export const revalidate = 3600;

export default async function sitemap() {
  const titleSlugSql = SQL_SLUG.replace("??", "canonical_title");

  let queryResults;
  try {
    queryResults = await Promise.all([
    queryOne("SELECT COALESCE(MAX(updated_at), NOW()) AS last_modified FROM jobs"),
    query(
      `SELECT trim(category_slug) AS slug, COUNT(*) AS job_count
       FROM jobs
       CROSS JOIN LATERAL regexp_split_to_table(COALESCE(category_slugs, ''), ',') AS category_slug
       WHERE status = 'success' AND trim(category_slug) != ''
       GROUP BY trim(category_slug)
       HAVING COUNT(*) > 0
       ORDER BY job_count DESC, slug`
    ),
    query(
      `SELECT country_slug AS slug, job_count
       FROM country_stats
       WHERE job_count > 0
       ORDER BY job_count DESC, country_slug`
    ),
    query(
      `SELECT location_slug AS slug, job_count
       FROM location_stats
       WHERE job_count > 0
       ORDER BY job_count DESC, location_slug`
    ),
    query(
      `SELECT slug, job_count
       FROM companies
       WHERE job_count >= ?
       ORDER BY job_count DESC, slug`,
      [COMPANY_MIN_JOBS]
    ),
    query(
      `SELECT ${titleSlugSql} || '-jobs' AS slug, MAX(job_count) AS job_count
       FROM title_stats
       WHERE job_count >= ?
       GROUP BY ${titleSlugSql}
       ORDER BY job_count DESC, slug`,
      [TITLE_MIN_JOBS]
    ),
    query(
      `SELECT tier AS slug, job_count
       FROM salary_tier_stats
       WHERE job_count > 0
       ORDER BY job_count DESC, tier`
    ),
    queryOne("SELECT COUNT(*) AS job_count FROM jobs WHERE status='success' AND remote=1"),
    ...EMPLOYMENT_TYPES.map((type) =>
      queryOne(
        `SELECT ? AS slug, COUNT(*) AS job_count
         FROM jobs
         WHERE status='success' AND (${type.condition})`,
        [type.slug]
      )
    ),
    ]);
  } catch (error) {
    // A database-less `next build` must still emit a sitemap, so the minimal
    // placeholder is correct there and only there.
    if (isProductionBuild()) {
      console.warn("Building the minimal sitemap because PostgreSQL is unavailable.");
      return databaseUnavailableEntries();
    }

    // At runtime, returning the placeholder would publish a 4-URL sitemap for
    // a site with roughly 894,000 indexable pages and tell search engines the
    // rest no longer exists. Rethrow instead. Two runtime cases, both verified:
    //
    //   - Time-based expiry (the normal case): the stale entry is retained and
    //     keeps being served, so crawlers continue to see the last good sitemap.
    //   - Explicit revalidatePath: that purges the entry, so there is nothing
    //     to fall back on and this route returns HTTP 500 until the database
    //     recovers. A 500 makes crawlers retry and keep the sitemap they
    //     already have, which is still far safer than a 200 announcing that
    //     the site shrank to four pages.
    console.error(
      "Sitemap generation failed; refusing to publish a truncated sitemap.",
      error
    );
    throw error;
  }

  const [
    freshness,
    categories,
    countries,
    locations,
    companies,
    titles,
    salaryTiers,
    remote,
    ...typeCounts
  ] = queryResults;

  const lastModified = freshness?.last_modified || new Date();
  const entries = [
    entry("", lastModified, "hourly", 1),
    entry("/titles", lastModified, "daily", 0.7),
    entry("/companies", lastModified, "daily", 0.7),
    entry("/locations", lastModified, "daily", 0.7),
    ...(remote?.job_count > 0 ? [entry("/remote", lastModified, "hourly", 0.9)] : []),
    ...categories.map(({ slug }) => entry(`/category/${slug}`, lastModified, "daily", 0.9)),
    ...countries.map(({ slug }) => entry(`/country/${slug}`, lastModified, "daily", 0.85)),
    ...locations.map(({ slug }) => entry(`/location/${slug}`, lastModified, "daily", 0.85)),
    ...salaryTiers.map(({ slug }) => entry(`/salary/${slug}`, lastModified, "daily", 0.8)),
    ...typeCounts
      .filter((type) => Number(type?.job_count || 0) >= DEPARTMENT_MIN_JOBS)
      .map(({ slug }) => entry(`/type/${slug}`, lastModified, "daily", 0.75)),
    ...titles.map(({ slug }) => entry(`/title/${slug}`, lastModified, "daily", 0.65)),
    ...companies.map(({ slug }) => entry(`/company/${slug}`, lastModified, "daily", 0.6)),
  ];

  return [...new Map(entries.map((item) => [item.url, item])).values()];
}
