ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS job_slug text;

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.job_slug_base(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(both '-' FROM regexp_replace(
    regexp_replace(lower(unaccent(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'),
    '-+', '-', 'g'
  ));
$$;

CREATE OR REPLACE FUNCTION public.generate_job_slug(input_title text, input_db_id bigint, max_length integer DEFAULT 150)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  suffix text;
  base text;
  safe_max integer;
  base_max integer;
BEGIN
  IF input_db_id IS NULL THEN
    RAISE EXCEPTION 'generate_job_slug requires input_db_id';
  END IF;

  suffix := '-' || input_db_id::text;
  safe_max := greatest(coalesce(max_length, 150), length(suffix) + 3);
  base_max := safe_max - length(suffix);
  base := public.job_slug_base(input_title);

  IF base = '' THEN
    RETURN 'job' || suffix;
  END IF;

  IF length(base) > base_max THEN
    base := trim(trailing '-' FROM left(base, base_max));
  END IF;

  IF base = '' THEN
    base := 'job';
  END IF;

  RETURN base || suffix;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_jobs_job_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.job_slug IS NULL OR NEW.job_slug = '' THEN
    NEW.job_slug := public.generate_job_slug(NEW.title, NEW.db_id, 150);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_jobs_job_slug ON jobs;

CREATE TRIGGER trg_set_jobs_job_slug
BEFORE INSERT OR UPDATE OF title, job_slug ON jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_jobs_job_slug();
