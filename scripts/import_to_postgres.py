#!/usr/bin/env python3
"""
import_to_postgres.py — JSONL → PostgreSQL importer
====================================================

Dedup key  :  apply_url  (MD5 stored as apply_url_md5 UNIQUE in DB)
Strategy   :  INSERT … ON CONFLICT DO UPDATE
              ─ New apply_url          → INSERT  with incoming status
              ─ Existing + "deleted"  → UPDATE  status = 'deleted'
              ─ Existing + "success"  → no-op   (keep what DB already has)

No preloading of existing rows needed — works correctly on first run AND
incremental runs. Within-file duplicates caught by seen_in_file set.

Status field is optional in JSONL (defaults to "success").

Usage
─────
  pip install "psycopg[binary]" python-dotenv

  # First time / full refresh
  python3 scripts/import_to_postgres.py -i /path/to/jobs.jsonl --truncate

  # Incremental (safe to run daily — skips existing, marks deletions)
  python3 scripts/import_to_postgres.py -i /path/to/new_jobs.jsonl

  # Install or update schema without importing data
  python3 scripts/import_to_postgres.py --schema-only
"""

import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime

try:
    import psycopg
    from psycopg.rows import dict_row
    from psycopg.types.json import Jsonb
except ImportError:
    sys.exit('❌  pip install "psycopg[binary]"')

try:
    from dotenv import load_dotenv
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for p in (".env.local", ".env"):
        load_dotenv(os.path.join(project_root, p))
except ImportError:
    pass

# ─── Config ───────────────────────────────────────────────────────────────────

BATCH_SIZE = 500   # rows per executemany call

DB_CONFIG = dict(
    host     = os.environ.get("DB_HOST",  "127.0.0.1"),
    port     = int(os.environ.get("DB_PORT", 5432)),
    user     = os.environ.get("DB_USER",  "jobuser"),
    password = os.environ.get("DB_PASS",  "jobpass123"),
    dbname   = os.environ.get("DB_NAME",  "jobboard"),
    # A managed host (Aiven, RDS) refuses unencrypted connections, so the
    # connection has to be able to ask for TLS. Defaults to "prefer" so a local
    # PostgreSQL on 127.0.0.1 behaves exactly as it did before this existed.
    # Note libpq's "require" encrypts without verifying the certificate chain;
    # use "verify-full" together with DB_SSL_ROOT_CERT for a checked chain.
    sslmode  = os.environ.get("DB_SSLMODE", "prefer"),
)

# Only pass a root certificate when one is configured — libpq rejects an empty
# sslrootcert outright.
if os.environ.get("DB_SSL_ROOT_CERT"):
    DB_CONFIG["sslrootcert"] = os.environ["DB_SSL_ROOT_CERT"]

# ─── Normalisation ────────────────────────────────────────────────────────────

TITLE_ALIASES = [
    (r"senior software engineer",              "Senior Software Engineer"),
    (r"staff software engineer",               "Staff Software Engineer"),
    (r"principal software engineer",           "Principal Software Engineer"),
    (r"lead software engineer",                "Lead Software Engineer"),
    (r"software engineer",                     "Software Engineer"),
    (r"software developer",                    "Software Engineer"),
    (r"swe\b",                                 "Software Engineer"),
    (r"senior backend engineer",               "Senior Backend Engineer"),
    (r"backend engineer|back.end engineer",    "Backend Engineer"),
    (r"senior frontend engineer",              "Senior Frontend Engineer"),
    (r"frontend engineer|front.end engineer",  "Frontend Engineer"),
    (r"full.?stack (engineer|developer)",      "Full-Stack Engineer"),
    (r"(ios|android|mobile) (engineer|developer)", "Mobile Engineer"),
    (r"senior data engineer",                  "Senior Data Engineer"),
    (r"lead data engineer",                    "Lead Data Engineer"),
    (r"data engineer",                         "Data Engineer"),
    (r"machine learning engineer|ml engineer", "Machine Learning Engineer"),
    (r"(generative ai|gen.?ai|ai) engineer",   "AI Engineer"),
    (r"senior (devops|sre|platform|infrastructure) engineer", "Senior DevOps / SRE Engineer"),
    (r"(devops|site reliability) engineer",    "DevOps / SRE Engineer"),
    (r"platform engineer",                     "Platform Engineer"),
    (r"infrastructure engineer",               "Infrastructure Engineer"),
    (r"cloud engineer",                        "Cloud Engineer"),
    (r"security engineer",                     "Security Engineer"),
    (r"(qa|quality assurance|test) engineer",  "QA Engineer"),
    (r"engineering manager",                   "Engineering Manager"),
    (r"vp.+engineering",                       "VP Engineering"),
    (r"forward.?deployed engineer",            "Forward Deployed Engineer"),
    (r"senior data scientist",                 "Senior Data Scientist"),
    (r"data scientist",                        "Data Scientist"),
    (r"data analyst",                          "Data Analyst"),
    (r"analytics engineer",                    "Analytics Engineer"),
    (r"business analyst",                      "Business Analyst"),
    (r"quantitative analyst|quant\b",          "Quantitative Analyst"),
    (r"senior product manager",                "Senior Product Manager"),
    (r"principal product manager",             "Principal Product Manager"),
    (r"group product manager",                 "Group Product Manager"),
    (r"product manager",                       "Product Manager"),
    (r"director.+product",                     "Director of Product"),
    (r"vp.+product",                           "VP Product"),
    (r"product owner",                         "Product Owner"),
    (r"product analyst",                       "Product Analyst"),
    (r"senior (ux|ui|product) designer",       "Senior UX Designer"),
    (r"(ux|ui|user experience) designer",      "UX Designer"),
    (r"product designer",                      "Product Designer"),
    (r"graphic designer",                      "Graphic Designer"),
    (r"senior account executive",              "Senior Account Executive"),
    (r"account executive",                     "Account Executive"),
    (r"sales development representative|sdr\b","Sales Development Representative"),
    (r"bdr\b|business development (rep|manager|executive)", "Business Development Representative"),
    (r"enterprise sales",                      "Enterprise Account Executive"),
    (r"sales manager",                         "Sales Manager"),
    (r"sales engineer",                        "Sales Engineer"),
    (r"solutions engineer",                    "Solutions Engineer"),
    (r"vp.+sales",                             "VP Sales"),
    (r"director.+sales",                       "Director of Sales"),
    (r"chief revenue",                         "Chief Revenue Officer"),
    (r"senior customer success",               "Senior Customer Success Manager"),
    (r"customer success manager|customer success", "Customer Success Manager"),
    (r"account manager",                       "Account Manager"),
    (r"relationship manager",                  "Relationship Manager"),
    (r"technical account manager",             "Technical Account Manager"),
    (r"growth (engineer|hacker|lead|manager)|growth\b", "Growth Manager"),
    (r"senior marketing manager",              "Senior Marketing Manager"),
    (r"marketing manager",                     "Marketing Manager"),
    (r"content (writer|strategist|marketer|manager)", "Content Marketer"),
    (r"demand generation",                     "Demand Generation Manager"),
    (r"performance marketing",                 "Performance Marketer"),
    (r"seo specialist",                        "SEO Specialist"),
    (r"social media",                          "Social Media Manager"),
    (r"product marketing",                     "Product Marketing Manager"),
    (r"vp.+marketing",                         "VP Marketing"),
    (r"revenue operations|revops",             "Revenue Operations Manager"),
    (r"operations manager",                    "Operations Manager"),
    (r"program manager",                       "Program Manager"),
    (r"project manager",                       "Project Manager"),
    (r"financial analyst",                     "Financial Analyst"),
    (r"finance manager",                       "Finance Manager"),
    (r"(senior )?recruiter",                   "Recruiter"),
    (r"talent acquisition",                    "Talent Acquisition Specialist"),
    (r"people (operations|ops|partner|manager)","People Operations Manager"),
    (r"hr (generalist|manager|business partner)","HR Manager"),
    (r"research scientist",                    "Research Scientist"),
    (r"research engineer",                     "Research Engineer"),
    (r"applied (scientist|researcher)",        "Applied Scientist"),
    (r"supply chain",                          "Supply Chain Manager"),
    (r"support engineer",                      "Support Engineer"),
    (r"customer support",                      "Customer Support Specialist"),
]
_COMPILED = [(re.compile(p, re.I), c) for p, c in TITLE_ALIASES]

CATEGORIES = {
    "software-engineering-jobs": {
        "Software Engineer","Senior Software Engineer","Staff Software Engineer",
        "Principal Software Engineer","Lead Software Engineer","Backend Engineer",
        "Senior Backend Engineer","Frontend Engineer","Senior Frontend Engineer",
        "Full-Stack Engineer","Mobile Engineer","Engineering Manager","VP Engineering",
        "QA Engineer","Security Engineer","Forward Deployed Engineer",
    },
    "devops-cloud-jobs": {
        "DevOps / SRE Engineer","Senior DevOps / SRE Engineer",
        "Platform Engineer","Infrastructure Engineer","Cloud Engineer",
    },
    "data-ai-jobs": {
        "Data Engineer","Senior Data Engineer","Lead Data Engineer",
        "Data Scientist","Senior Data Scientist","Data Analyst","Analytics Engineer",
        "Machine Learning Engineer","AI Engineer","Research Scientist",
        "Research Engineer","Applied Scientist","Quantitative Analyst",
    },
    "product-jobs": {
        "Product Manager","Senior Product Manager","Principal Product Manager",
        "Group Product Manager","Director of Product","VP Product",
        "Product Owner","Product Analyst",
    },
    "design-jobs": {
        "UX Designer","Senior UX Designer","Product Designer",
        "Graphic Designer","UX Researcher",
    },
    "sales-jobs": {
        "Account Executive","Senior Account Executive","Enterprise Account Executive",
        "Sales Development Representative","Business Development Representative",
        "Sales Manager","Sales Engineer","Solutions Engineer",
        "VP Sales","Director of Sales","Chief Revenue Officer",
    },
    "customer-success-jobs": {
        "Customer Success Manager","Senior Customer Success Manager",
        "Account Manager","Relationship Manager","Technical Account Manager",
    },
    "marketing-jobs": {
        "Growth Manager","Marketing Manager","Senior Marketing Manager",
        "Content Marketer","Demand Generation Manager","Performance Marketer",
        "SEO Specialist","Social Media Manager","Product Marketing Manager","VP Marketing",
    },
    "operations-jobs": {
        "Operations Manager","Revenue Operations Manager","Program Manager","Project Manager",
    },
    "people-hr-jobs": {
        "Recruiter","Talent Acquisition Specialist","People Operations Manager","HR Manager",
    },
}
_TITLE_TO_CATS: dict = defaultdict(list)
for _slug, _titles in CATEGORIES.items():
    for _t in _titles:
        _TITLE_TO_CATS[_t].append(_slug)

CITY_ALIASES = {
    "bengaluru":"bangalore","bombay":"mumbai","new delhi":"delhi","ncr":"delhi",
    "new york city":"new-york","new york":"new-york","nyc":"new-york",
    "san francisco":"san-francisco","sf":"san-francisco",
    "los angeles":"los-angeles","la":"los-angeles","san jose":"san-jose",
    "mountain view":"mountain-view","palo alto":"palo-alto","seattle":"seattle",
    "austin":"austin","chicago":"chicago","boston":"boston","denver":"denver",
    "miami":"miami","dallas":"dallas","atlanta":"atlanta","washington dc":"washington-dc",
    "london":"london","singapore":"singapore","sg - singapore":"singapore",
    "hong kong":"hong-kong","hk - hong kong sar":"hong-kong",
    "sydney":"sydney","melbourne":"melbourne","toronto":"toronto","vancouver":"vancouver",
    "berlin":"berlin","amsterdam":"amsterdam","paris":"paris","dublin":"dublin",
    "stockholm":"stockholm","zurich":"zurich","barcelona":"barcelona","madrid":"madrid",
    "remote":"remote","anywhere":"remote","worldwide":"remote","fully remote":"remote",
}

COUNTRY_ALIASES = sorted([
    ("united states","united-states","United States"),
    ("usa","united-states","United States"),
    ("new york","united-states","United States"),
    ("san francisco","united-states","United States"),
    ("los angeles","united-states","United States"),
    ("chicago","united-states","United States"),
    ("seattle","united-states","United States"),
    ("austin","united-states","United States"),
    ("boston","united-states","United States"),
    ("mountain view","united-states","United States"),
    ("palo alto","united-states","United States"),
    ("washington","united-states","United States"),
    ("india","india","India"),
    ("bengaluru","india","India"),("bangalore","india","India"),
    ("mumbai","india","India"),("delhi","india","India"),
    ("hyderabad","india","India"),("pune","india","India"),("chennai","india","India"),
    ("united kingdom","united-kingdom","United Kingdom"),
    ("london","united-kingdom","United Kingdom"),
    ("canada","canada","Canada"),("toronto","canada","Canada"),("vancouver","canada","Canada"),
    ("australia","australia","Australia"),("sydney","australia","Australia"),("melbourne","australia","Australia"),
    ("singapore","singapore","Singapore"),
    ("germany","germany","Germany"),("berlin","germany","Germany"),
    ("netherlands","netherlands","Netherlands"),("amsterdam","netherlands","Netherlands"),
    ("france","france","France"),("paris","france","France"),
    ("ireland","ireland","Ireland"),("dublin","ireland","Ireland"),
    ("hong kong","hong-kong","Hong Kong"),
    ("sweden","sweden","Sweden"),("stockholm","sweden","Sweden"),
    ("switzerland","switzerland","Switzerland"),("zurich","switzerland","Switzerland"),
    ("spain","spain","Spain"),("barcelona","spain","Spain"),("madrid","spain","Spain"),
    ("serbia","serbia","Serbia"),("brazil","brazil","Brazil"),("mexico","mexico","Mexico"),
    ("japan","japan","Japan"),("israel","israel","Israel"),
    ("new zealand","new-zealand","New Zealand"),("poland","poland","Poland"),
    ("portugal","portugal","Portugal"),
    ("united arab emirates","uae","UAE"),("uae","uae","UAE"),("dubai","uae","UAE"),
], key=lambda x: -len(x[0]))

_PERIOD_MULT = {"year":1,"annual":1,"yr":1,"month":12,"mo":12,"hour":2080,"hr":2080,"week":52,"wk":52}
_CCY_USD     = {"USD":1.0,"CAD":0.74,"AUD":0.65,"NZD":0.60,"GBP":1.27,"EUR":1.08,
                "SGD":0.74,"HKD":0.13,"INR":0.012,"JPY":0.0067,"CNY":0.14,
                "BRL":0.18,"MXN":0.059,"CHF":1.11,"SEK":0.096}


def normalize_title(raw):
    t = (raw or "").strip()
    for pat, canon in _COMPILED:
        if pat.search(t): return canon
    return t.title() or "Other"

def normalize_location(raw):
    low = re.sub(r",\s*[a-z ]+$", "", raw.strip().lower())
    low = re.sub(r"\s*-\s*[a-z ]+$", "", low).strip()
    if low in CITY_ALIASES: return CITY_ALIASES[low]
    for alias, slug in CITY_ALIASES.items():
        if alias in low: return slug
    return None

def normalize_country(raw):
    low = raw.strip().lower()
    for pattern, slug, label in COUNTRY_ALIASES:
        if pattern in low: return slug, label
    return None, None

def annual_usd(job):
    mn, mx = job.get("salary_min"), job.get("salary_max")
    try: mn = float(mn) if mn is not None else None
    except: mn = None
    try: mx = float(mx) if mx is not None else None
    except: mx = None
    if mn is None and mx is None: return None
    # Guard: if one value is None, use the other
    if mn is None: mn = mx
    if mx is None: mx = mn
    mid = (mn + mx) / 2
    if mid is None or mid <= 0: return None
    period = str(job.get("salary_period") or "year").lower().strip()
    ccy    = str(job.get("salary_currency") or "USD").upper().strip()
    mult   = _PERIOD_MULT.get(period, 1)
    rate   = _CCY_USD.get(ccy, 1.0)
    try:
        return mid * mult * rate
    except Exception:
        return None

def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii","ignore").decode()
    text = re.sub(r"[^\w\s-]","",text.lower())
    text = re.sub(r"[\s_]+","-",text)
    return re.sub(r"-+","-",text).strip("-")

def generate_job_slug(title, db_id, max_length=150):
    db_id_text = "" if db_id is None else str(db_id).strip()
    if not re.fullmatch(r"\d+", db_id_text):
        raise ValueError("generate_job_slug requires a numeric db_id")

    suffix = f"-{db_id_text}"
    limit = max(len(suffix) + 3, int(max_length or 150))
    title_limit = limit - len(suffix)
    base = slugify(title)

    if not base:
        return f"job{suffix}"
    if len(base) > title_limit:
        base = base[:title_limit].rstrip("-")

    return f"{base or 'job'}{suffix}"

def md5(text: str) -> str:
    return hashlib.md5((text or "").encode()).hexdigest()

def render_hash(job_row: dict, loc_rows: list[dict]) -> str:
    payload = {
        key: job_row.get(key)
        for key in (
            "id", "apply_url", "title", "canonical_title", "company",
            "company_slug", "description", "employment_type", "department",
            "remote", "salary_min", "salary_max", "salary_currency",
            "salary_period", "salary_annual_usd", "posted_at", "source",
            "source_slug", "category_slugs", "tags", "status",
        )
    }
    payload["tags"] = getattr(payload["tags"], "obj", payload["tags"])
    payload["posted_at"] = (
        payload["posted_at"].isoformat() if payload["posted_at"] else None
    )
    payload["locations"] = sorted(
        (
            loc.get("location_raw") or "",
            loc.get("location_slug") or "",
            loc.get("country_slug") or "",
            loc.get("country_label") or "",
        )
        for loc in loc_rows
    )
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode()).hexdigest()

def parse_dt(raw):
    for fmt in ("%Y-%m-%dT%H:%M:%SZ","%Y-%m-%dT%H:%M:%S","%Y-%m-%d"):
        try: return datetime.strptime((raw or "")[:19].replace("Z",""), fmt.rstrip("Z"))
        except: pass
    return None

def to_f(v):
    if v is None: return None
    try: return float(v)
    except: return None


# ─── Schema ───────────────────────────────────────────────────────────────────

DDL = [
"""CREATE TABLE IF NOT EXISTS jobs (
  db_id             BIGSERIAL PRIMARY KEY,
  id                VARCHAR(255),
  apply_url         TEXT,
  apply_url_md5     VARCHAR(32) NOT NULL UNIQUE,
  job_slug          TEXT,
  title             VARCHAR(500),
  canonical_title   VARCHAR(300),
  company           VARCHAR(300),
  company_slug      VARCHAR(300),
  description       TEXT,
  employment_type   VARCHAR(100),
  department        VARCHAR(200),
  remote            SMALLINT DEFAULT 0,

  salary_min        NUMERIC(15,2),
  salary_max        NUMERIC(15,2),
  salary_currency   VARCHAR(10),
  salary_period     VARCHAR(20),
  salary_annual_usd NUMERIC(15,2),
  posted_at         TIMESTAMP,
  source            VARCHAR(100),
  source_slug       VARCHAR(200),
  category_slugs    VARCHAR(1000),
  tags              JSONB,
  status            VARCHAR(20) DEFAULT 'success'
                    CHECK (status IN ('success', 'deleted')),

  -- Structured address and posting validity, read by getJob() in lib/jobs.js
  -- and by lib/job-jsonld.js. Leaving these out of the DDL did not fail
  -- loudly: getJob() selects them, so the query errors, app/[slug]/page.jsx
  -- swallows it via .catch(() => null), and every job page 404s while the
  -- listings keep working.
  --
  -- This importer does not populate any of them; the pipeline that produces
  -- the JSONL does. They are declared here so a database built by this script
  -- matches production and the app can actually query it. Types match
  -- production exactly -- a narrower VARCHAR would truncate on write, and
  -- last_seen_at really is timestamptz while everything else is timestamp.
  street_address       VARCHAR(255),
  address_locality     VARCHAR(150),
  postal_code          VARCHAR(20),
  address_region       VARCHAR(100),
  address_country      VARCHAR(100),
  valid_through        TIMESTAMP,
  domain               TEXT,
  employment_type_norm VARCHAR(20),
  last_seen_at         TIMESTAMPTZ,

  render_hash       VARCHAR(64),
  published_render_hash VARCHAR(64),
  published_at      TIMESTAMP,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)""",

"""CREATE TABLE IF NOT EXISTS job_locations (
  id            BIGSERIAL PRIMARY KEY,
  job_md5       VARCHAR(32) NOT NULL,
  location_raw  VARCHAR(500),
  location_slug VARCHAR(200),
  country_slug  VARCHAR(100),
  country_label VARCHAR(100)
)""",

"""CREATE TABLE IF NOT EXISTS companies (
  slug       VARCHAR(300)  NOT NULL PRIMARY KEY,
  name       VARCHAR(300),
  job_count  INT           DEFAULT 0
)""",

"""CREATE TABLE IF NOT EXISTS location_stats (
  location_slug  VARCHAR(200)  NOT NULL PRIMARY KEY,
  job_count      INT           DEFAULT 0
)""",

"""CREATE TABLE IF NOT EXISTS site_metrics (
  id               SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_jobs       BIGINT DEFAULT 0,
  total_remote     BIGINT DEFAULT 0,
  total_100k_plus  BIGINT DEFAULT 0,
  total_companies  BIGINT DEFAULT 0,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)""",

"""CREATE TABLE IF NOT EXISTS title_stats (
  canonical_title VARCHAR(300) PRIMARY KEY,
  job_count       BIGINT DEFAULT 0
)""",

"""CREATE TABLE IF NOT EXISTS skill_stats (
  skill      VARCHAR(300) PRIMARY KEY,
  job_count  BIGINT DEFAULT 0
)""",

"""CREATE TABLE IF NOT EXISTS country_stats (
  country_slug  VARCHAR(100) PRIMARY KEY,
  country_label VARCHAR(100),
  job_count     BIGINT DEFAULT 0
)""",

"""CREATE TABLE IF NOT EXISTS remote_title_stats (
  canonical_title VARCHAR(300) PRIMARY KEY,
  job_count       BIGINT DEFAULT 0
)""",

"""CREATE TABLE IF NOT EXISTS salary_tier_stats (
  tier      VARCHAR(30) PRIMARY KEY,
  job_count BIGINT DEFAULT 0
)""",

"""ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_slug TEXT""",

"""CREATE EXTENSION IF NOT EXISTS unaccent""",

"""CREATE OR REPLACE FUNCTION public.job_slug_base(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(both '-' FROM regexp_replace(
    regexp_replace(lower(unaccent(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'),
    '-+', '-', 'g'
  ));
$$""",

"""CREATE OR REPLACE FUNCTION public.generate_job_slug(input_title text, input_db_id bigint, max_length integer DEFAULT 150)
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
$$""",

"""CREATE OR REPLACE FUNCTION public.set_jobs_job_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.job_slug IS NULL OR NEW.job_slug = '' THEN
    NEW.job_slug := public.generate_job_slug(NEW.title, NEW.db_id, 150);
  END IF;
  RETURN NEW;
END;
$$""",

"""DROP TRIGGER IF EXISTS trg_set_jobs_job_slug ON jobs""",

"""CREATE TRIGGER trg_set_jobs_job_slug
BEFORE INSERT OR UPDATE OF title, job_slug ON jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_jobs_job_slug()""",

"""CREATE TABLE IF NOT EXISTS blocked_ips (
  id            SERIAL PRIMARY KEY,
  ip_address    VARCHAR(45) NOT NULL,
  request_count INTEGER NOT NULL,
  user_agent    TEXT,
  sample_paths  TEXT[],
  blocked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unblocked_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  status        VARCHAR(20) NOT NULL DEFAULT 'blocked',
  blocked_by    VARCHAR(50) NOT NULL DEFAULT 'auto',
  unblocked_by  VARCHAR(50),
  notes         TEXT
)""",
]

INDEX_DDL = [
    "CREATE INDEX IF NOT EXISTS idx_jobs_canonical ON jobs (canonical_title)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_company_slug ON jobs (company_slug)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_job_slug ON jobs (job_slug)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_remote ON jobs (remote)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_salary ON jobs (salary_annual_usd)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_posted ON jobs (posted_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_emp_type ON jobs (employment_type)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_pending_publish ON jobs (published_at) WHERE published_render_hash IS DISTINCT FROM render_hash",
    """CREATE INDEX IF NOT EXISTS idx_jobs_search ON jobs USING GIN (
      to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(company, ''))
    )""",
    "CREATE INDEX IF NOT EXISTS idx_locations_job_md5 ON job_locations (job_md5)",
    "CREATE INDEX IF NOT EXISTS idx_locations_slug ON job_locations (location_slug)",
    "CREATE INDEX IF NOT EXISTS idx_locations_country ON job_locations (country_slug)",
    "CREATE INDEX IF NOT EXISTS idx_blocked_ips_status ON blocked_ips (status)",
    "CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON blocked_ips (ip_address)",
    "CREATE INDEX IF NOT EXISTS idx_blocked_ips_expires ON blocked_ips (expires_at) WHERE status = 'blocked'",
]

INDEX_NAMES = [
    "idx_jobs_canonical",
    "idx_jobs_company_slug",
    "idx_jobs_job_slug",
    "idx_jobs_remote",
    "idx_jobs_salary",
    "idx_jobs_posted",
    "idx_jobs_status",
    "idx_jobs_emp_type",
    "idx_jobs_pending_publish",
    "idx_jobs_search",
    "idx_locations_job_md5",
    "idx_locations_slug",
    "idx_locations_country",
    "idx_blocked_ips_status",
    "idx_blocked_ips_ip",
    "idx_blocked_ips_expires",
]

# ─── INSERT … ON CONFLICT UPDATE SQL ─────────────────────────────────────────
#
#  How PostgreSQL handles each case:
#  ┌─────────────────────────────────────┬────────────────────────────────────┐
#  │ Scenario                            │ Result                             │
#  ├─────────────────────────────────────┼────────────────────────────────────┤
#  │ apply_url_md5 NOT in DB             │ Full INSERT — new row created       │
#  │ apply_url_md5 IN DB, incoming=deleted│ UPDATE status='deleted' only       │
#  │ apply_url_md5 IN DB, incoming=success│ status unchanged (no downgrade)    │
#  └─────────────────────────────────────┴────────────────────────────────────┘
#
_JOB_COLS = [
    "id","apply_url","apply_url_md5","title","canonical_title","company","company_slug",
    "description","employment_type","department","remote","salary_min","salary_max","salary_currency",
    "salary_period","salary_annual_usd","posted_at","source","source_slug","category_slugs","tags","status",
    "render_hash",
]
_PLACEHOLDERS = ",".join(["%s"] * len(_JOB_COLS))
_UPSERT_SQL = (
    f"INSERT INTO jobs ({','.join(_JOB_COLS)}) VALUES ({_PLACEHOLDERS}) "
    f"ON CONFLICT (apply_url_md5) DO UPDATE SET "
    f"status = CASE WHEN EXCLUDED.status='deleted' THEN 'deleted' ELSE jobs.status END, "
    f"render_hash = CASE WHEN EXCLUDED.status='deleted' THEN EXCLUDED.render_hash ELSE jobs.render_hash END, "
    f"updated_at = CASE WHEN EXCLUDED.status='deleted' THEN NOW() ELSE jobs.updated_at END"
)

_LOC_COLS = ["job_md5","location_raw","location_slug","country_slug","country_label"]
_LOC_SQL   = f"INSERT INTO job_locations ({','.join(_LOC_COLS)}) VALUES ({','.join(['%s']*len(_LOC_COLS))})"


# ─── Row builders ─────────────────────────────────────────────────────────────

def build_job_row(job: dict, line_no: int):
    url      = (job.get("apply_url") or "").strip()
    url_md5  = md5(url) if url else md5(f"__noid__{line_no}")

    raw_title = (job.get("title") or "").strip()
    canon     = normalize_title(raw_title)
    company   = (job.get("company") or "").strip()
    usd       = annual_usd(job)
    cats      = ",".join(_TITLE_TO_CATS.get(canon, []))

    # Status — optional field, defaults to "success"
    status = (job.get("status") or "success").strip().lower()
    if status not in ("success","deleted"):
        status = "success"

    tags_raw  = job.get("tags")
    tags_json = Jsonb(tags_raw) if isinstance(tags_raw, (list, dict)) else None

    return url_md5, {
        "id":               (job.get("id") or "")[:254],
        "apply_url":        url[:65534],
        "apply_url_md5":    url_md5,
        "title":            raw_title[:499],
        "canonical_title":  canon[:299],
        "company":          company[:299],
        "company_slug":     slugify(company)[:299] if company else "",
        # description_html preferred; fall back to description
        "description":      (job.get("description_html") or job.get("description") or ""),
        "employment_type":  (job.get("employment_type") or "")[:99],
        "department":       (job.get("department") or "")[:199] or None,
        "remote":           0,           # updated below after location scan
        "salary_min":       to_f(job.get("salary_min")),
        "salary_max":       to_f(job.get("salary_max")),
        "salary_currency":  (job.get("salary_currency") or "")[:9],
        "salary_period":    (job.get("salary_period") or "")[:19],
        "salary_annual_usd": round(usd, 2) if usd is not None else None,
        "posted_at":        parse_dt(job.get("posted_at")),
        "source":           (job.get("source") or "")[:99],
        "source_slug":      (job.get("source_slug") or "")[:199] or None,
        "category_slugs":   cats[:999],
        "tags":             tags_json,
        "status":           status,
        "render_hash":      None,
    }, status


def build_loc_rows(job: dict, url_md5: str):
    loc_rows  = []
    is_remote = bool(job.get("remote"))

    for raw_loc in (job.get("locations") or []):
        if not isinstance(raw_loc, str):
            continue
        ls = normalize_location(raw_loc)
        if ls == "remote":
            is_remote = True
        cs, cl = normalize_country(raw_loc)
        loc_rows.append({
            "job_md5":       url_md5,
            "location_raw":  raw_loc[:499],
            "location_slug": ls or "",
            "country_slug":  cs or "",
            "country_label": cl or "",
        })

    if not loc_rows:
        loc_rows.append(dict(job_md5=url_md5, location_raw="",
                             location_slug="", country_slug="", country_label=""))
    return loc_rows, is_remote


# ─── Batch flush ──────────────────────────────────────────────────────────────

def flush_batch(conn, job_rows: list, loc_rows: list):
    """
    Flush one batch to PostgreSQL.
    apply_url_md5 UNIQUE constraint + ON CONFLICT handles dedup.
    """
    if not job_rows:
        return

    job_values = [tuple(r[c] for c in _JOB_COLS) for r in job_rows]

    # Upsert jobs
    _execmany(conn, _UPSERT_SQL, job_values)

    # Replace locations
    md5s = [r["apply_url_md5"] for r in job_rows]
    if md5s:
        in_ph = ",".join(["%s"] * len(md5s))
        _exec(conn, f"DELETE FROM job_locations WHERE job_md5 IN ({in_ph})", md5s)
        _execmany(conn, _LOC_SQL, [tuple(r[c] for c in _LOC_COLS) for r in loc_rows])

    conn.commit()


# ─── Stats rebuild ────────────────────────────────────────────────────────────

def _exec(conn, sql, args=None):
    """Execute a single statement with a dictionary-row cursor."""
    cur = conn.cursor(row_factory=dict_row)
    cur.execute(sql, args or ())
    return cur

def _execmany(conn, sql, rows):
    cur = conn.cursor()
    cur.executemany(sql, rows)
    cur.close()

def rebuild_stats(conn):
    print("  🔄  Rebuilding aggregate stats …")
    _exec(conn, """
        TRUNCATE TABLE companies, location_stats, site_metrics, title_stats,
                       country_stats, remote_title_stats, salary_tier_stats,
                       skill_stats
    """)
    _exec(conn, """
        INSERT INTO companies (slug, name, job_count)
        WITH variants AS (
          SELECT company_slug, company, COUNT(*) AS variant_count
          FROM jobs
          WHERE status = 'success' AND company_slug != ''
          GROUP BY company_slug, company
        )
        SELECT company_slug,
               (ARRAY_AGG(
                 company
                 ORDER BY (company = LOWER(company)), variant_count DESC, company
               ))[1] AS name,
               SUM(variant_count) AS job_count
        FROM variants
        GROUP BY company_slug
        ORDER  BY job_count DESC
    """)
    _exec(conn, "TRUNCATE TABLE location_stats")
    _exec(conn, """
        INSERT INTO location_stats (location_slug, job_count)
        SELECT   jl.location_slug, COUNT(DISTINCT jl.job_md5) AS job_count
        FROM     job_locations jl
        JOIN     jobs j ON j.apply_url_md5 = jl.job_md5
        WHERE    j.status = 'success'
          AND    jl.location_slug != ''
          AND    jl.location_slug != 'remote'
        GROUP BY jl.location_slug
        ORDER BY job_count DESC
    """)
    _exec(conn, """
        INSERT INTO site_metrics (
          id, total_jobs, total_remote, total_100k_plus, total_companies, updated_at
        )
        SELECT 1,
               COUNT(*),
               COUNT(*) FILTER (WHERE remote = 1),
               COUNT(*) FILTER (WHERE salary_annual_usd >= 100000),
               COUNT(DISTINCT company_slug),
               NOW()
        FROM jobs
        WHERE status = 'success'
    """)
    _exec(conn, """
        INSERT INTO title_stats (canonical_title, job_count)
        SELECT canonical_title, COUNT(*)
        FROM jobs
        WHERE status='success' AND canonical_title != '' AND canonical_title != 'Other'
        GROUP BY canonical_title
    """)
    _exec(conn, """
        INSERT INTO skill_stats (skill, job_count)
        SELECT BTRIM(tag.skill), COUNT(DISTINCT j.db_id)
        FROM jobs j
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(j.tags, '[]'::jsonb)) AS tag(skill)
        WHERE j.status='success' AND BTRIM(tag.skill) != ''
        GROUP BY BTRIM(tag.skill)
    """)
    _exec(conn, """
        INSERT INTO country_stats (country_slug, country_label, job_count)
        SELECT jl.country_slug, MAX(jl.country_label), COUNT(DISTINCT jl.job_md5)
        FROM job_locations jl
        JOIN jobs j ON j.apply_url_md5 = jl.job_md5
        WHERE j.status='success' AND jl.country_slug != ''
        GROUP BY jl.country_slug
    """)
    _exec(conn, """
        INSERT INTO remote_title_stats (canonical_title, job_count)
        SELECT canonical_title, COUNT(*)
        FROM jobs
        WHERE remote=1 AND status='success'
          AND canonical_title != '' AND canonical_title != 'Other'
        GROUP BY canonical_title
    """)
    _exec(conn, """
        INSERT INTO salary_tier_stats (tier, job_count)
        VALUES
          ('100k-plus', (SELECT COUNT(*) FROM jobs WHERE status='success' AND salary_annual_usd >= 100000)),
          ('150k-plus', (SELECT COUNT(*) FROM jobs WHERE status='success' AND salary_annual_usd >= 150000)),
          ('200k-plus', (SELECT COUNT(*) FROM jobs WHERE status='success' AND salary_annual_usd >= 200000)),
          ('250k-plus', (SELECT COUNT(*) FROM jobs WHERE status='success' AND salary_annual_usd >= 250000))
    """)
    conn.commit()
    print("  ✅  Stats rebuilt")

def ensure_upstream_schema(conn):
    """Add columns owned by the upstream JSONL pipeline to older databases.

    CREATE TABLE IF NOT EXISTS does nothing to a table that already exists, so
    a database created before these columns were introduced never gains them.
    For the five address/validity columns that is not a subtle problem: getJob()
    in lib/jobs.js selects them, the query raises, app/[slug]/page.jsx turns
    that into notFound(), and every job page 404s while the listings keep
    working -- which is exactly how this was found.

    This importer populates none of them. They are declared and backfilled as
    NULL purely so a database it builds matches production.
    """
    for ddl in (
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS street_address VARCHAR(255)",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS address_locality VARCHAR(150)",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS address_region VARCHAR(100)",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS address_country VARCHAR(100)",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS valid_through TIMESTAMP",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS domain TEXT",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS employment_type_norm VARCHAR(20)",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ",
    ):
        _exec(conn, ddl)
    conn.commit()

def ensure_publication_schema(conn):
    cur = _exec(conn, """
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'jobs' AND column_name = 'render_hash'
        ) AS existed
    """)
    existed = cur.fetchone()["existed"]
    for ddl in (
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS render_hash VARCHAR(64)",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS published_render_hash VARCHAR(64)",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS published_at TIMESTAMP",
    ):
        _exec(conn, ddl)
    if not existed:
        _exec(conn, """
            UPDATE jobs
            SET render_hash = encode(
                  sha256(convert_to(
                    concat_ws('|', apply_url_md5, title, company, description, status),
                    'UTF8'
                  )),
                  'hex'
                ),
                published_render_hash = encode(
                  sha256(convert_to(
                    concat_ws('|', apply_url_md5, title, company, description, status),
                    'UTF8'
                  )),
                  'hex'
                ),
                published_at = NOW()
        """)
    conn.commit()

def ensure_indexes(conn):
    print("  🔎  Ensuring PostgreSQL indexes …")
    for ddl in INDEX_DDL:
        _exec(conn, ddl)
    conn.commit()
    _exec(conn, "ANALYZE")
    conn.commit()
    print("  ✅  Indexes ready")


# ─── Main ─────────────────────────────────────────────────────────────────────

def run(input_path: str, truncate: bool, schema_only: bool = False):
    print(f"\n🔌 Connecting → {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']} …")
    conn = psycopg.connect(**DB_CONFIG)
    print("  ✅  Connected")

    # Ensure tables exist
    for ddl in DDL:
        _exec(conn, ddl)
    conn.commit()
    ensure_upstream_schema(conn)
    ensure_publication_schema(conn)
    print("  ✅  Schema ready")

    if schema_only:
        rebuild_stats(conn)
        ensure_indexes(conn)
        conn.close()
        print(f"\n✨ Schema and aggregates ready in '{DB_CONFIG.get('dbname')}'.\n")
        return

    if truncate:
        for index_name in INDEX_NAMES:
            _exec(conn, f"DROP INDEX IF EXISTS {index_name}")
        _exec(conn, """
            TRUNCATE TABLE job_locations, companies, location_stats, site_metrics,
                           title_stats, country_stats, remote_title_stats,
                           salary_tier_stats, skill_stats, jobs RESTART IDENTITY
        """)
        conn.commit()
        print("  🗑️   Tables truncated")

    # ── Stream JSONL ──────────────────────────────────────────────────────────
    # No preloading of existing rows needed.
    # seen_in_file   → catches within-file duplicates (same apply_url twice in JSONL)
    # ON CONFLICT → PostgreSQL catches cross-run duplicates via apply_url_md5 UNIQUE
    # ─────────────────────────────────────────────────────────────────────────

    # Determine fail.jsonl path next to input file
    fail_path = os.path.join(os.path.dirname(os.path.abspath(input_path)), "fail.jsonl")
    n_fail = 0

    print(f"\n📂 Streaming: {input_path}")
    seen_in_file: set = set()   # md5s seen in THIS file so far
    job_batch:    list = []
    loc_batch:    list = []
    n_total = n_err = 0

    with open(input_path, encoding="utf-8") as fh, \
         open(fail_path, "w", encoding="utf-8") as fail_fh:

        for line_no, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue

            try:
                job = json.loads(line)
            except json.JSONDecodeError:
                n_err += 1
                continue

            # ── Check description quality ──────────────────────────────────
            raw_desc = job.get("description_html") or job.get("description") or ""
            # Strip HTML tags to count actual words
            plain = re.sub(r"<[^>]+>", " ", raw_desc)
            plain = re.sub(r"&\w+;|&#\d+;", " ", plain)  # strip html entities
            word_count = len(plain.split())

            if word_count < 100:
                # Write original JSONL line as-is
                fail_fh.write(line + "\n")
                n_fail += 1
                # Still import it — but mark the low word count in description
                # We don't skip it from DB so the job is still searchable

            url     = (job.get("apply_url") or "").strip()
            url_md5 = md5(url) if url else md5(f"__noid__{line_no}")

            # ── Within-file dedup (same apply_url appearing twice in the JSONL)
            if url_md5 in seen_in_file:
                continue
            seen_in_file.add(url_md5)

            # Build normalised row
            url_md5, job_row, status = build_job_row(job, line_no)
            loc_rows, is_remote      = build_loc_rows(job, url_md5)
            job_row["remote"]        = 1 if is_remote else 0
            job_row["render_hash"]   = render_hash(job_row, loc_rows)

            job_batch.append(job_row)
            loc_batch.extend(loc_rows)
            n_total += 1

            # Flush every BATCH_SIZE records
            if len(job_batch) >= BATCH_SIZE:
                flush_batch(conn, job_batch, loc_batch)
                print(f"  ↑  {n_total:,} processed …", end="\r")
                job_batch.clear()
                loc_batch.clear()

    # Final partial batch
    if job_batch:
        flush_batch(conn, job_batch, loc_batch)

    print(f"\n  ✅  {n_total:,} records processed  ({n_err} parse errors)")
    print("  ℹ️   PostgreSQL ON CONFLICT handled all apply_url dedup automatically.")
    print(f"  📋  {n_fail:,} records written to {fail_path}  (missing/short description)")

    rebuild_stats(conn)
    if truncate:
        _exec(conn, """
            UPDATE jobs
            SET published_render_hash = render_hash,
                published_at = NOW()
        """)
        conn.commit()
        print("  ✅  Full-import jobs marked for on-demand generation")
    ensure_indexes(conn)
    conn.close()
    print(f"\n✨ Done!  Database '{DB_CONFIG.get('dbname')}' is ready.\n")



# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="JSONL → PostgreSQL importer (dedup by apply_url)")
    ap.add_argument("-i","--input",    default="jobs.jsonl",  help="Input JSONL file")
    ap.add_argument("--truncate",      action="store_true",   help="Truncate all tables first")
    ap.add_argument("--schema-only",   action="store_true",   help="Install schema/aggregates without importing JSONL")
    ap.add_argument("--host",   default=None, help="Override DB_HOST")
    ap.add_argument("--port",   type=int, default=None, help="Override DB_PORT")
    ap.add_argument("--user",   default=None, help="Override DB_USER")
    ap.add_argument("--password",default=None,help="Override DB_PASS")
    ap.add_argument("--db",     default=None, dest="database", help="Override DB_NAME")
    args = ap.parse_args()

    if args.host:     DB_CONFIG["host"]     = args.host
    if args.port:     DB_CONFIG["port"]     = args.port
    if args.user:     DB_CONFIG["user"]     = args.user
    if args.password: DB_CONFIG["password"] = args.password
    if args.database: DB_CONFIG["dbname"] = args.database

    run(args.input, args.truncate, args.schema_only)
