CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_job_slug
  ON jobs(job_slug);
