-- Repeat this statement until it reports UPDATE 0.
-- Tune the LIMIT for the local machine. Start with 10000, then increase if it is comfortable.
WITH batch AS (
  SELECT db_id
  FROM jobs
  WHERE job_slug IS NULL OR job_slug = ''
  ORDER BY db_id
  LIMIT 10000
)
UPDATE jobs j
SET job_slug = public.generate_job_slug(j.title, j.db_id, 150)
FROM batch
WHERE j.db_id = batch.db_id;
