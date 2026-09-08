import { query } from "./db";

const BASE_URL = (
  process.env.PUBLIC_BASE_URL || "https://www.leadnear.com/jobs"
).replace(/\/$/, "");

export async function getSitemapUrlCounts() {
  const rows = await query(`
    WITH
    categories AS (
      SELECT 'category' AS kind, '/category/' || trim(category_slug) AS path,
             COUNT(*)::bigint AS record_count
      FROM jobs
      CROSS JOIN LATERAL regexp_split_to_table(COALESCE(category_slugs, ''), ',') AS category_slug
      WHERE status='success' AND trim(category_slug) != ''
      GROUP BY trim(category_slug)
    ),
    countries AS (
      SELECT 'country' AS kind, '/country/' || country_slug AS path,
             job_count::bigint AS record_count
      FROM country_stats WHERE job_count > 0
    ),
    locations AS (
      SELECT 'location' AS kind, '/location/' || location_slug AS path,
             job_count::bigint AS record_count
      FROM location_stats WHERE job_count > 0
    ),
    companies AS (
      SELECT 'company' AS kind, '/company/' || slug AS path,
             job_count::bigint AS record_count
      FROM companies WHERE job_count >= 10
    ),
    titles AS (
      SELECT 'title' AS kind,
             '/title/' || regexp_replace(
               regexp_replace(lower(COALESCE(canonical_title, '')), '[^a-z0-9]+', '-', 'g'),
               '(^-|-$)', '', 'g'
             ) || '-jobs' AS path,
             MAX(job_count)::bigint AS record_count
      FROM title_stats
      WHERE job_count >= 25
      GROUP BY regexp_replace(
        regexp_replace(lower(COALESCE(canonical_title, '')), '[^a-z0-9]+', '-', 'g'),
        '(^-|-$)', '', 'g'
      )
    ),
    salary AS (
      SELECT 'salary' AS kind, '/salary/' || tier AS path,
             job_count::bigint AS record_count
      FROM salary_tier_stats WHERE job_count > 0
    ),
    types AS (
      SELECT 'type' AS kind, '/type/full-time' AS path, COUNT(*)::bigint AS record_count
      FROM jobs WHERE status='success' AND (
        lower(COALESCE(employment_type, '')) IN (
          'full_time','fulltime','full-time','full time','full-time permanent',
          'permanent full time','permanent full-time','regular full-time',
          'full-time employee','f/t','ft','fte','employee','permanent'
        ) OR lower(COALESCE(employment_type, '')) LIKE '%full%time%'
      )
      UNION ALL
      SELECT 'type', '/type/part-time', COUNT(*)::bigint
      FROM jobs WHERE status='success' AND (
        lower(COALESCE(employment_type, '')) IN ('part_time','parttime','part-time','part time','p/t','pt')
        OR lower(COALESCE(employment_type, '')) LIKE '%part%time%'
      )
      UNION ALL
      SELECT 'type', '/type/contract', COUNT(*)::bigint
      FROM jobs WHERE status='success' AND lower(COALESCE(employment_type, '')) LIKE '%contract%'
      UNION ALL
      SELECT 'type', '/type/temporary', COUNT(*)::bigint
      FROM jobs WHERE status='success' AND (
        lower(COALESCE(employment_type, '')) LIKE '%temporary%'
        OR lower(COALESCE(employment_type, '')) LIKE '%seasonal%'
        OR lower(COALESCE(employment_type, '')) = 'temp'
      )
      UNION ALL
      SELECT 'type', '/type/internship', COUNT(*)::bigint
      FROM jobs WHERE status='success' AND lower(COALESCE(employment_type, '')) LIKE '%intern%'
      UNION ALL
      SELECT 'type', '/type/volunteer', COUNT(*)::bigint
      FROM jobs WHERE status='success' AND lower(COALESCE(employment_type, '')) LIKE '%volunteer%'
      UNION ALL
      SELECT 'type', '/type/per-diem', COUNT(*)::bigint
      FROM jobs WHERE status='success' AND (
        lower(COALESCE(employment_type, '')) IN ('per_diem','per-diem','per diem')
        OR lower(COALESCE(employment_type, '')) LIKE '%per diem%'
      )
      UNION ALL
      SELECT 'type', '/type/other', COUNT(*)::bigint
      FROM jobs WHERE status='success' AND lower(COALESCE(employment_type, '')) = 'other'
    ),
    remote AS (
      SELECT 'remote' AS kind, '/remote' AS path, COUNT(*)::bigint AS record_count
      FROM jobs WHERE status='success' AND remote=1
    ),
    home AS (
      SELECT 'home' AS kind, '' AS path, COUNT(*)::bigint AS record_count
      FROM jobs WHERE status='success'
    ),
    all_rows AS (
      SELECT * FROM home
      UNION ALL SELECT * FROM remote WHERE record_count > 0
      UNION ALL SELECT * FROM categories WHERE record_count > 0
      UNION ALL SELECT * FROM countries WHERE record_count > 0
      UNION ALL SELECT * FROM locations WHERE record_count > 0
      UNION ALL SELECT * FROM salary WHERE record_count > 0
      UNION ALL SELECT * FROM types WHERE record_count >= 25
      UNION ALL SELECT * FROM titles WHERE record_count > 0
      UNION ALL SELECT * FROM companies WHERE record_count > 0
    )
    SELECT DISTINCT ON (path) path, kind, record_count
    FROM all_rows
    ORDER BY path, kind
  `);

  return rows.map((row) => ({
    url: `${BASE_URL}${row.path}`,
    kind: row.kind,
    recordCount: Number(row.record_count),
  }));
}
