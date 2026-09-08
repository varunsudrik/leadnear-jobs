# LeadNear Jobs

A standalone job board — Next.js 15 (App Router) on PostgreSQL, served under
`/jobs`, with a single database as the source of truth.

It replaces a two-repo, two-database arrangement in which `jobs-portal` (the
board, PostgreSQL) ran behind `leadnear-main` (the surrounding site, MySQL) via
a rewrite. Everything needed to run the jobs product now lives here.

---

## Quick start

**Requires** Node 20+, Docker (for the schema installer), and a PostgreSQL
database you can write to.

```bash
npm install
cp .env.example .env.local     # then fill it in — see Configuration
npm run db:push                # 40 leadnear tables, via Prisma
npm run db:schema              # 11 job board tables, indexes, unaccent
npm run db:seed                # copy a sample of jobs from a source database
npm run db:schema              # rebuild aggregates against what you just seeded
npm run db:verify              # assert the result is coherent
npm run dev
```

Then open **http://localhost:4100/jobs**.

The bare origin (`http://localhost:4100/`) is *supposed* to 404 — the app is
mounted at `/jobs`, matching where it sits on the public site.

Order matters in the two schema steps: run Prisma **first**, so `db push` can
never touch the job board tables.

---

## Architecture

One PostgreSQL database, two families of tables in `public`, two access paths:

```
                    ┌───────────────────────────────┐
   raw SQL          │        PostgreSQL             │        Prisma
   lib/db.js  ─────▶│  jobs, job_locations,         │◀─────  lib/prisma.js
                    │  companies, site_metrics,     │
                    │  title_stats, skill_stats,    │
                    │  location_stats, …            │
                    │  blocked_ips          (11)    │
                    │                               │
                    │  "User", "Account", "Session",│
                    │  "Orders", "Purchased", …(40) │
                    └───────────────────────────────┘
```

- **Job board tables** — created by `scripts/import_to_postgres.py`, queried
  with hand-written SQL through `lib/db.js`. Fast paths and full-text search
  (`idx_jobs_search`, a GIN index over `to_tsvector`) matter more here than ORM
  ergonomics.
- **Application tables** — the 40-model schema carried over from the MySQL
  original, created by `prisma db push`, used by NextAuth.

Neither tool manages the other's tables.

**Aggregate tables are derived, not stored.** `companies`, `site_metrics`,
`title_stats` and the other five stats tables are rebuilt from `jobs`. That is
why seeding is always followed by `npm run db:schema` — otherwise the site
reports the source database's job count over your local subset.

### Layout

```
app/                  routes (App Router)
  page.jsx            marketing homepage
  browse/             search + listing
  [slug]/             job detail + JobPosting JSON-LD
  api/                homepage, live-count, autocomplete, auth, register,
                      contact, opt-out, revalidate, admin, backoffice
components/           shared UI; marketing/ holds the Tailwind-styled homepage
lib/                  jobs.js (queries), job-jsonld.js (structured data),
                      db.js + pg-config.mjs (pg), prisma.js, auth-options.js
prisma/schema.prisma  the 40 application models
scripts/              schema installer, seeder, publisher, verifier
sql/job-slug/         staged online migration for the job_slug column
```

---

## Configuration

Copy `.env.example` to `.env.local` and fill it in. `.env.local` is gitignored.

### Database

Two representations of the **same** database, because the toolchain is split —
`DATABASE_URL` for Next.js, the `.mjs` scripts and Prisma; the discrete `DB_*`
values for the Python importer, which uses psycopg. Keep them in sync.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:port/db?sslmode=require` |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASS` `DB_NAME` | Same target, for the importer |
| `DB_SSLMODE` | `require` for a managed host, `prefer` for local |
| `DB_POOL_MAX` | Default 5. Raise only if the server has connection headroom |
| `DB_SSL_CA` | Path to the provider's CA. Without it, TLS is used but the chain is not verified |

### Seeding

| Variable | Notes |
|---|---|
| `PROD_DATABASE_URL` | Source to copy jobs from. **Read only** — see AGENTS.md |
| `SEED_JOB_LIMIT` | Newest `status='success'` jobs to copy (default 5000) |

### Application

| Variable | Notes |
|---|---|
| `PUBLIC_BASE_URL` | Canonical URLs and sitemap, e.g. `http://localhost:4100/jobs` |
| `REVALIDATE_SECRET` | Guards `/api/revalidate` (`openssl rand -hex 32`) |
| `ADMIN_USER` `ADMIN_PASSWORD` | HTTP Basic for `/admin` + `/backoffice`. **Blank means those routes 401** |
| `NEXTAUTH_URL` | Must include the basePath **and** the API path: `http://localhost:4100/jobs/api/auth` |
| `NEXTAUTH_SECRET` | `openssl rand -hex 32` |

### Optional

| Variable | Effect when unset |
|---|---|
| `NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID` | AdSense renders nothing |
| `BREVO_SMTP_HOST` / `_USER` / `_PASS` | Contact and opt-out forms return 503 with a clear message |
| `NEXT_PUBLIC_AUTH_ORIGIN` | Unused; reserved for linking sign-in elsewhere |
| `NEXT_PUBLIC_BLOG_URL` | Footer falls back to `https://blog.leadnear.com` |
| `PUBLISH_*`, `WARM_NEWEST_LIMIT` | Publisher tuning; defaults apply |

---

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server on **:4100** |
| `npm run build` / `start` | Production build / serve |
| `npm run db:push` | Create the 40 application tables (Prisma) |
| `npm run db:schema` | Create job board tables + indexes, **and rebuild aggregates** |
| `npm run db:seed` | Copy jobs from `PROD_DATABASE_URL` (read-only at source) |
| `npm run db:verify` | Assert tables, row counts, derived stats, indexes, extensions |
| `npm run db:studio` | Prisma Studio |
| `npm run db:import -- -i /path/to/jobs.jsonl` | Import a JSONL feed |
| `npm run publish:jobs` | Publish pending job pages |
| `npm run refresh:counts` | Refresh `site_metrics` only (needs a running app) |
| `npm run job-slug:test` | Slug generation tests |

Prisma commands go through `scripts/prisma.mjs`, which loads `.env.local` —
the Prisma CLI reads only `.env`. A bare `npx prisma …` will not find
`DATABASE_URL`.

`db:schema` and `db:import` run the Python importer inside `python:3.12-slim`,
so Docker must be running and no local Python setup is needed.

---

## Authentication

Credentials only — email and password against the `User` table, bcrypt-verified
(cost 10), with JWT sessions (the Credentials provider cannot use database
sessions). Any valid, non-blocked user may sign in.

- `/jobs/signin`, `/jobs/register`, `/jobs/api/auth/*`, `/jobs/api/register`
- `authorize()` returns the same `null` for unknown email, wrong password and
  blocked account, so the form cannot be used to enumerate addresses.

Not implemented: OAuth providers, password reset, email verification.

Separately, `/admin` and `/backoffice` sit behind HTTP Basic auth in
`middleware.js` — unrelated to user sign-in.

---

## Verifying a change

```bash
npm run db:verify                                   # database is coherent
curl -s -o /dev/null -w '%{http_code}\n' \
  http://localhost:4100/jobs                        # 200
curl -s -o /dev/null -w '%{http_code}\n' \
  http://localhost:4100/jobs/backoffice             # 401 unless creds are set
npm run build                                       # stop `next dev` first
```

`db:verify` checks that `site_metrics.total_jobs` matches the live `jobs` count
— the assertion that catches aggregates copied from another database instead of
regenerated locally.

Stop the dev server before building. Both write to `.next`, and the collision
surfaces as a confusing `Cannot find module './chunks/…'`.

---

## Notes for contributors

`AGENTS.md` documents the non-obvious behaviour in detail — basePath rules,
NextAuth's three separate basePath requirements, the `pg` SSL change, the
Tailwind preflight/base interaction, and the database safety rules. Worth
reading before a first change.

Known gaps: no Dockerfile or deployment path yet; no ongoing ingestion pipeline
(data arrives via `db:seed` or a manual JSONL import).
