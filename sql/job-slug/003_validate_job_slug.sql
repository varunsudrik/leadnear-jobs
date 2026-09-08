SELECT COUNT(*) AS null_or_empty_job_slugs
FROM jobs
WHERE job_slug IS NULL OR job_slug = '';

SELECT job_slug, COUNT(*) AS duplicate_count
FROM jobs
GROUP BY job_slug
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, job_slug
LIMIT 50;

SELECT COUNT(*) AS suffix_violations
FROM jobs
WHERE job_slug IS NULL
   OR job_slug !~ ('-' || db_id::text || '$');

SELECT
  COUNT(*) AS total_jobs,
  COUNT(*) FILTER (WHERE job_slug LIKE 'job-%') AS fallback_slugs,
  MAX(length(job_slug)) AS max_slug_length,
  AVG(length(job_slug))::numeric(10,2) AS avg_slug_length
FROM jobs;

SELECT db_id, title, job_slug
FROM jobs
WHERE job_slug LIKE 'job-%'
   OR title IS NULL
   OR btrim(title) = ''
ORDER BY db_id
LIMIT 100;

SELECT db_id, title, job_slug
FROM jobs
ORDER BY random()
LIMIT 100;
