# Local Job Slug Migration Rehearsal

Run these only against a local restored copy first. Local Homebrew PostgreSQL is
preferred over Docker on macOS for this rehearsal because restore, batch update,
and index creation usually perform better without Docker filesystem overhead.

1. Restore a production dump into a local PostgreSQL database, for example on
   `127.0.0.1:5434` with database `jobs_slug_rehearsal`.
2. Run `001_add_job_slug.sql`.
3. Backfill either by running `002_backfill_job_slug.sql` repeatedly until it
   updates `0` rows, or run:

   ```bash
   npm run job-slug:backfill
   ```

4. Run `003_validate_job_slug.sql` and confirm there are no null, empty, duplicate,
   or suffix-violating slugs.
5. Run `004_create_unique_index.sql`.
6. Run the application locally and test `/jobs/{job_slug}` routes.
7. Run `005_make_job_slug_not_null.sql` after app verification.

For timing, record the elapsed time and updated row count for each backfill batch.
Project total backfill time from rows per second after the first few batches.

Useful local commands:

```bash
createdb -h 127.0.0.1 -p 5434 jobs_slug_rehearsal
pg_restore -h 127.0.0.1 -p 5434 -d jobs_slug_rehearsal --clean --if-exists --no-owner backups/jobboard-production.dump
psql -h 127.0.0.1 -p 5434 -d jobs_slug_rehearsal -f sql/job-slug/001_add_job_slug.sql
npm run job-slug:backfill
psql -h 127.0.0.1 -p 5434 -d jobs_slug_rehearsal -f sql/job-slug/003_validate_job_slug.sql
psql -h 127.0.0.1 -p 5434 -d jobs_slug_rehearsal -f sql/job-slug/004_create_unique_index.sql
```
