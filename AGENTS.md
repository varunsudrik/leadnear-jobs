# Agent Guide — LeadNear Jobs

Read this before changing code, running scripts, or touching a database in this
repository. Most of what follows was learned by getting it wrong first; the
non-obvious items are marked **gotcha** and each one has cost a debugging cycle.

## What this project is

A standalone Next.js 15 (App Router) job board, mounted at `basePath: "/jobs"`,
backed by **one PostgreSQL database that is the single source of truth**. It was
assembled from two older projects:

| Source | What came from it |
|---|---|
| `jobs-portal` | The whole job board: routes, `lib/jobs.js`, `lib/job-jsonld.js`, importer, publisher |
| `leadnear-main` | The 40-model Prisma schema, marketing homepage, static pages, auth |

Neither of those repos is a dependency. This one runs alone.

---

## Databases — read this section before running anything

There are **two** connection strings in `.env.local` and they are not
interchangeable.

### `DATABASE_URL` — the target (Aiven). Safe to write.

Holds both table families in the `public` schema:

- **11 job board tables** (`jobs`, `job_locations`, `companies`, `site_metrics`,
  the 6 other stats tables, `blocked_ips`) — created by
  `scripts/import_to_postgres.py`, queried with raw SQL via `lib/db.js`.
- **40 leadnear tables** (`"User"`, `"Account"`, `"Session"`, …) — created by
  `prisma db push`, queried via Prisma.

They coexist; neither tool manages the other's tables.

**gotcha — table name casing.** The MySQL original ran with
`lower_case_table_names=1`, so it stored `user`, `linkedindata`. PostgreSQL
preserves the Prisma model names, so here they are `"User"`, `"LinkedinData"`.
Prisma handles this transparently; **hand-written SQL must double-quote them**.

**gotcha — connection ceiling.** The Aiven plan allows **20 connections total**
across the app, Prisma, every script and any open `psql`. `DB_POOL_MAX`
defaults to 5 for this reason. Do not raise it casually, and do not create a
`PrismaClient` or `Pool` outside the singletons in `lib/prisma.js` and
`lib/db.js` — a hot-reload leak exhausts the budget within a few edits.

### `PROD_DATABASE_URL` — live production. READ ONLY. Never write.

Used by exactly one file, `scripts/seed-from-prod.mjs`, to copy a sample of real
jobs. That script opens its source pool with
`options: "-c default_transaction_read_only=on"`, so the **server itself**
rejects writes on that connection. Keep it that way.

Rules:

- Never point the application, Prisma, or the importer at `PROD_DATABASE_URL`.
- Never add a write path against it, even a "harmless" one.
- The application reads only from `DATABASE_URL`. If you find yourself wanting
  production data at runtime, re-seed instead.

### Admin routes are deliberately gated

`middleware.js` puts HTTP Basic auth on `/admin`, `/backoffice`,
`/api/admin/*`, `/api/backoffice/*`. If `ADMIN_USER` or `ADMIN_PASSWORD` is
empty, **every one of those routes 401s** — that is a feature, not a
misconfiguration. Leave them blank unless you specifically need the backoffice.

---

## Gotchas that will cost you an hour each

### basePath `/jobs` is applied to navigation, never to `fetch`

`next.config.mjs` sets `basePath: "/jobs"`. Next prefixes `<Link href>`,
`router.push()`, and files served from `public/` — but **not** `fetch()` URLs
and **not** raw `<img src>`.

```js
<Link href="/remote" />                 // -> /jobs/remote            correct
<Link href="/jobs/remote" />            // -> /jobs/jobs/remote       WRONG
fetch("/jobs/api/live-count")           // correct — keep the prefix
fetch("/api/live-count")                // 404
<img src={`${process.env.NEXT_PUBLIC_BASE_PATH}/images/…`} />  // correct
```

`NEXT_PUBLIC_BASE_PATH` is exported from `next.config.mjs` so there is one
definition. When porting code from `leadnear-main`, strip `/jobs` from every
`Link`/`router` path and leave it on every `fetch`.

### NextAuth does not know about basePath — three separate places

1. **`NEXTAUTH_URL` must point at the API root**, not the site root:
   `http://localhost:4100/jobs/api/auth`. Set to `…/jobs`, providers advertise
   `callbackUrl: /jobs/callback/credentials` (missing `/api/auth`) and browser
   sign-in breaks while direct API calls still work — so it looks fine in tests.
2. **`pages` paths need the prefix.** `lib/auth-options.js` builds them from
   `BASE_PATH`; a bare `/signin` resolves against the origin and 404s.
3. **`SessionProvider` needs `basePath`** (`components/SessionProvider.jsx`), or
   every client session lookup hits `/api/auth/*` and the UI is permanently
   logged out.

### `pg` treats `sslmode=require` as `verify-full`

Since pg 8.16, `sslmode=require` in a connection string means full chain
verification, which fails against Aiven's own CA with *"self-signed certificate
in certificate chain"*. `lib/pg-config.mjs` strips the parameter from the URL
and passes an explicit `ssl` object instead. Build every pool through
`buildPgConfig()` rather than hand-rolling one.

Note libpq (the Python importer) uses the weaker, original meaning of
`require`, so `DB_SSLMODE=require` is correct there.

### Prisma CLI ignores `.env.local`

It reads `.env` only. Rather than duplicating credentials, run it through the
wrapper: `npm run db:push`, `npm run db:studio`, or
`node scripts/prisma.mjs <cmd>`. A bare `npx prisma …` will fail with
"Environment variable not found: DATABASE_URL".

### Tailwind: preflight is off, base is required

`tailwind.config.js` sets `corePlugins.preflight: false` because the job board's
`app/globals.css` is hand-written CSS that Tailwind's reset would destroy.

**But `@tailwind base` must still be imported** (`app/tailwind.css`). Beyond the
reset, that layer emits the `--tw-*` custom-property defaults that gradients,
shadows, rings, transforms and filters are built on. Drop it and
`bg-gradient-to-r … bg-clip-text text-transparent` renders as **invisible
text** — the clip and transparent colour apply, the gradient never does.

Corollary: with preflight off, a bare `<button>` keeps the browser's default
border, grey background and system font. The navbar classes (`.nav-login`,
`.nav-primary`, `.mobile-auth-link`) were written for `<a>` and set only
padding/colour/type, so a `<button>` using them needs the chrome reset already
in `app/globals.css`.

### Do not run `npm run build` while `next dev` is running

Both write to `.next`. The build fails with a misleading
`Cannot find module './chunks/vendor-chunks/next.js'` or `Cannot find module
'./5611.js'`. Stop the dev server, `rm -rf .next`, then build.

### `node-pg` serialises JS arrays as PostgreSQL array literals

Reading a `jsonb` column gives a JS value; binding it straight back produces
`{a,b}` for an array, and the insert fails with *"invalid input syntax for type
json"*. `scripts/seed-from-prod.mjs` `JSON.stringify`s json/jsonb columns
explicitly, keyed off the **target** column type. Any new copy code must do the
same.

### The aggregate tables are derived — regenerate, never copy

`companies`, `site_metrics`, `title_stats`, `skill_stats`, `location_stats`,
`country_stats`, `remote_title_stats` and `salary_tier_stats` are rebuilt from
`jobs` by `rebuild_stats()` in `scripts/import_to_postgres.py`, which
`--schema-only` invokes. Copying them from production makes the UI advertise
~690k jobs over a 5k subset. After changing the contents of `jobs`, run
`npm run db:schema` (it is idempotent — all DDL is `CREATE TABLE IF NOT EXISTS`).

Do **not** use `npm run refresh:counts` for this: it only writes `site_metrics`,
requires `REVALIDATE_SECRET`, and calls back into a running app.

### The Python importer needs 3.10+, so it runs in Docker

`npm run db:schema` and `npm run db:import` wrap it in `python:3.12-slim`. This
sidesteps whatever Python is on the host. Docker must be running.

---

## Working rules

- Run `git status --short` before editing. Treat pre-existing modified or
  untracked files as user-owned; do not revert or clean them.
- Say what you are about to change before changing it.
- Verify against the running app, not by assumption. `curl` the route, check the
  computed style, query the database — screenshots of a scaled viewport hide
  detail.
- After schema or seed changes, run `npm run db:verify`. It asserts both table
  families are present and that `site_metrics.total_jobs` equals the live row
  count, which is the check that catches copied-instead-of-regenerated stats.
- Keep `.env.local` out of git (`.gitignore` covers `.env*`). Never paste
  credentials into source, comments, or commit messages.

## JSON-LD and SEO

Inherited verbatim from the original project's rules, and they still apply:

- Job metadata and `JobPosting` JSON-LD live in `app/[slug]/page.jsx`; data is
  loaded through `lib/jobs.js`; address helpers are in `lib/job-jsonld.js`.
- Emit only structured-data fields backed by real ATS or stored data. Never
  output empty strings, `null`, `"N/A"` or guessed address fields.
- Build `jobLocation.address` from whichever of `streetAddress`,
  `addressLocality`, `addressRegion`, `postalCode`, `addressCountry` actually
  have values. Include `postalCode` only when the source provides it; Google's
  warning about a missing one is acceptable for an aggregator.
- Never put `"Remote"` in `PostalAddress.addressLocality`. For remote roles use
  `jobLocationType: "TELECOMMUTE"`, adding `applicantLocationRequirements` only
  when a real country is known.

## Known gaps

Deliberately not built. Do not assume these exist:

- **No deployment path.** There is no Dockerfile; `cache-handler.mjs` was
  written for a read-only container that this repo cannot yet produce.
- **No ingestion pipeline.** Job data came from a one-time seed. The upstream
  process that produces the JSONL feed (and populates `street_address`,
  `postal_code`, `domain`, `last_seen_at`) is in neither source repo.
- **Auth is credentials-only.** No Google/LinkedIn OAuth, no password reset, no
  email verification, no referral-credit or admin-logging side effects.
- **Mail is optional.** `/api/contact` and `/api/opt-out` return a clear 503
  when SMTP is unconfigured rather than failing silently.
- **AdSense is inert** until `NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID` is set.
- Two indexes present in production (`idx_jobs_domain`,
  `idx_jobs_last_seen_at`) are created by the upstream pipeline, not by this
  repo's schema. Nothing in `lib/jobs.js` queries those columns.
