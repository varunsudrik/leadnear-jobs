# Real ATS Resume Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fabricated resume scan with a working one — upload a PDF, get a real ATS score from real findings — and delete every fabricated value from the site.

**Architecture:** A PDF is parsed in-process, deterministic checks produce the Parse and Format subscores, and one `deepseek-v4-flash` call extracts skills, impact findings and prose. A pure module assembles the render shape from those three inputs, so every number the user sees comes from network-free, table-testable code. Results persist in the shared Postgres via Prisma; the quota is derived by counting scan rows rather than stored.

**Tech Stack:** Next.js 15 App Router (`basePath: "/jobs"`), React 19, Prisma 5 (shared schema), `unpdf` 1.8.1 (MIT, zero deps), OpenRouter, plain-`node` tests with `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-09-19-resume-ats-scan-design.md`

**Scope note:** This is plan 1 of 2. It delivers the scan and removes all fabricated content. Corpus comparison — the "% of postings mention X" figures, real `/matches` ranking, and real fit badges — is plan 2, because it depends on a production index build needing an operator go/no-go (spec section 6). Splitting means this plan is never blocked by that gate. Between the two plans there are **no fit badges anywhere**, which is correct: spec D12 requires that fabricated fit not survive this work.

## Global Constraints

- Model is `deepseek/deepseek-v4-flash`, declared once as a constant. `temperature: 0`, fixed `seed`, `response_format` json_schema `strict: true`, `reasoning_effort` pinned low, `provider.data_collection: "deny"` (spec D6, section 7).
- **Never half-score.** Any parse, AI or schema failure writes no row and consumes no quota. A partially-scored resume is worse than a failed one (spec section 8).
- Quota is `COUNT(*)` over `ResumeScan` rows for the user. No counter column (spec D8).
- Store the result, the skill vector, and **only the extracted lines the parser view displays** (~20-40). Never the full text. Never the file (spec D11).
- Uploads: PDF only, max 2 MB, max 10 pages.
- `/resume` and `/matches` stay `robots: "noindex"` and absent from `app/sitemap.js`.
- Tests are plain `node scripts/test-*.mjs` using `node:assert/strict`, registered in `package.json` as `<name>:test`. No Jest, no Vitest, no jsdom.
- **Every schema change goes to the Aiven staging database. Production is never modified.** `DATABASE_URL` in `.env.local` points at `pg-3fe711d-redgear204-9f81.i.aivencloud.com:22842/defaultdb` (staging). The production string lives in `PROD_DATABASE_URL` (a raw IP) and is read only by `scripts/seed-from-prod.mjs`. **Do not run `db:seed` / `scripts/seed-from-prod.mjs`, do not pass `PROD_DATABASE_URL` to anything, and do not run any DDL against that host.**
- **Never run `npm run db:push` (or any `prisma db push`) against this database — on staging or anywhere else.** The job-board tables (`jobs`, `job_locations`, `companies`, `title_stats`, `skill_stats`, `site_metrics`, `location_stats`, `country_stats`, `remote_title_stats`, `salary_tier_stats`, `blocked_ips`) are created by `scripts/import_to_postgres.py` in raw SQL and are declared nowhere in `prisma/schema.prisma`, so Prisma treats them as foreign and proposes dropping all eleven — 5,000 jobs and 10,641 locations among them. Verified against staging: a real attempt listed exactly those drops before refusing without `--accept-data-loss`. This hazard predates this feature. Schema changes are applied with explicit additive SQL (Task 6, Step 3); `npx prisma generate` is safe because it reads the schema file only.
- The database permits **20 connections total** (`lib/prisma.js`). Do not create new clients or pools.
- Prisma owns the leadnear tables; job-board tables are raw SQL via `lib/db.js`. Do not mix.
- Copy rule: the product says **"we store the text we show you, never the file"**. Never "we never store your resume".
- Every assertion must fail when the code under test is reverted. A needle that also matches unrelated code is a defect, not a test.

---

## File Structure

**Created**
- `lib/resume/model.mjs` — model id and request parameters, one place.
- `lib/resume/parse.mjs` — PDF buffer to text, pages, lines. The only module that knows about PDFs.
- `lib/resume/format-checks.mjs` — lines to Parse/Format subscores and faults. Pure.
- `lib/resume/extract.mjs` — the single AI call. The only module that knows the prompt.
- `lib/resume/score.mjs` — assembles the render shape from the three inputs above. Pure.
- `lib/resume/store.mjs` — Prisma reads/writes and quota derivation. The only module that knows Prisma.
- `app/api/resume/scan/route.js` — multipart upload, auth, quota, orchestration.
- `app/api/resume/quota/route.js` — quota for the client-side `AuthNav`.
- `components/ResumeUpload.jsx`, `ResumeScanning.jsx`, `ResumeError.jsx`, `ResumeSignedOut.jsx`, `ParsedTextView.jsx`
- `scripts/test-resume-parse.mjs`, `test-format-checks.mjs`, `test-resume-extract.mjs`, `test-resume-score.mjs`, `test-resume-store.mjs`, `test-resume-eval.mjs`
- `scripts/fixtures/` — sample PDFs

**Modified**
- `lib/ai/openrouter.mjs` — new request parameters, same `ok:false` contract
- `prisma/schema.prisma` — `ResumeScan`, `ResumeScanTarget`
- `app/resume/page.jsx`, `app/matches/page.jsx`
- `components/ResumeScan.jsx`, `JobCard.jsx`, `JobPreview.jsx`, `Filters.jsx`, `AuthNav.jsx`
- `app/globals.css`, `package.json`

**Deleted**
- `lib/demo-fit.js`, `lib/demo-resume.js`, `lib/match-buckets.js`
- `components/DemoDisclosure.jsx`, `components/DemoOffPanel.jsx`
- `scripts/test-demo-fit.mjs`, `scripts/test-demo-resume.mjs`, `scripts/test-match-buckets.mjs`

---

## Task 1: OpenRouter client parameters

**Files:**
- Modify: `lib/ai/openrouter.mjs`
- Create: `lib/resume/model.mjs`
- Test: `scripts/test-openrouter.mjs` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces: `chat({system, user, model, maxTokens, signal, schema, temperature, seed, reasoningEffort})` returning `{ok:true, text}` or `{ok:false, reason:"unconfigured"|"http"|"network", detail?}`. Also `MODEL`, `SEED`, `REASONING_EFFORT` from `lib/resume/model.mjs`.

- [ ] **Step 1: Write the failing test** — append to `scripts/test-openrouter.mjs`:

```js
// A schema request must send strict json_schema, temperature 0, a seed, low
// reasoning effort and provider privacy. Every one is a Global Constraint.
process.env.OPENROUTER_API_KEY = "test-key";
let sent = null;
globalThis.fetch = async (_url, init) => {
  sent = JSON.parse(init.body);
  return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) };
};
const m4 = await import(`../lib/ai/openrouter.mjs?v=${Date.now()}d`);
await m4.chat({
  system: "s", user: "u",
  schema: { name: "probe", schema: { type: "object", properties: {}, additionalProperties: false } },
});
assert.equal(sent.response_format.type, "json_schema");
assert.equal(sent.response_format.json_schema.strict, true);
assert.equal(sent.response_format.json_schema.name, "probe");
assert.equal(sent.temperature, 0);
assert.equal(typeof sent.seed, "number");
assert.equal(sent.reasoning.effort, "low");
assert.equal(sent.provider.data_collection, "deny");

// Without a schema there must be no response_format key at all: an empty
// object is sent as {} and rejected by the API.
sent = null;
const m5 = await import(`../lib/ai/openrouter.mjs?v=${Date.now()}e`);
await m5.chat({ system: "s", user: "u" });
assert.equal("response_format" in sent, false);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run ai:test`
Expected: FAIL — `sent.response_format` is undefined.

- [ ] **Step 3: Create `lib/resume/model.mjs`**

```js
// One place for the model choice and its request parameters, so switching
// models is a one-line change (spec D6/D7) and every caller stays consistent.
//
// deepseek-v4-flash: $0.046/M in, $0.093/M out, about $0.36 per 1,000 scans,
// roughly 9x cheaper than gpt-5-mini. Unlike gpt-5-mini it accepts
// `temperature`, which is what makes rescanning the same resume reproducible.
export const MODEL = process.env.RESUME_MODEL || "deepseek/deepseek-v4-flash";

// Scores must be reproducible: same resume in, same number out. temperature 0
// plus a fixed seed is the entire mechanism; there is no other determinism.
export const SEED = 1729;

// Reasoning tokens bill at the completion rate. Left unpinned they multiply
// output cost several-fold for a task that is mostly extraction.
export const REASONING_EFFORT = "low";
```

- [ ] **Step 4: Extend `chat()` in `lib/ai/openrouter.mjs`**

Keep every existing guard: `chat()`, `chat(null)` and the unconfigured path must still return `{ok:false, reason:"unconfigured"}` without throwing.

```js
import { MODEL, SEED, REASONING_EFFORT } from "../resume/model.mjs";

export async function chat(args) {
  const {
    system, user, model = MODEL, maxTokens = 1024, signal,
    schema = null, temperature = 0, seed = SEED,
    reasoningEffort = REASONING_EFFORT,
  } = args ?? {};
  if (!isAiConfigured()) return { ok: false, reason: "unconfigured" };

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

  const body = {
    model, messages, max_tokens: maxTokens,
    temperature, seed,
    reasoning: { effort: reasoningEffort },
    // The payload is CV text. Deny provider-side collection explicitly
    // rather than relying on a default we do not control.
    provider: { data_collection: "deny" },
  };
  // Only attach when asked: an empty response_format is rejected outright.
  if (schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: schema.name, strict: true, schema: schema.schema },
    };
  }

  // ... existing fetch / response.ok / try-catch unchanged, sending `body`
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run ai:test`
Expected: PASS, including all pre-existing cases.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/openrouter.mjs lib/resume/model.mjs scripts/test-openrouter.mjs
git commit -m "feat(ai): structured output, determinism and provider privacy"
```

---

## Task 2: PDF parsing

**Files:**
- Create: `lib/resume/parse.mjs`, `scripts/test-resume-parse.mjs`, `scripts/fixtures/make-fixtures.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseResume(buffer, filename)` returning `{ok:true, text, pages, lines}` where `lines` is `Array<{n:number, text:string}>`; or `{ok:false, reason, detail}` with `reason` one of `"not-pdf" | "too-large" | "too-many-pages" | "no-text" | "unreadable"`. Also `LIMITS = {maxBytes: 2000000, maxPages: 10}`.

- [ ] **Step 1: Install the dependency**

```bash
npm install unpdf@1.8.1
```

Chosen over `pdf-parse`, which depends on `@napi-rs/canvas` — a native binary that will not run on Vercel. `unpdf` has zero dependencies and targets all JS runtimes.

- [ ] **Step 2: Write the fixture generator** — `scripts/fixtures/make-fixtures.mjs`:

```js
// Hand-built minimal PDFs so the fixtures are reviewable text, not opaque
// binaries checked into the repo.
import { writeFileSync } from "node:fs";

const LINES = [
  "ARJUN MEHTA",
  "Bengaluru, India | arjun.mehta@mail.com | +91 98000 00000 | linkedin.com/in/arjunmehta",
  "SUMMARY",
  "Backend engineer with 7 years building distributed systems in Go and Python.",
  "SKILLS",
  "Languages and tools include Go, Python, PostgreSQL, Redis and Terraform across several teams.",
  "EXPERIENCE",
  "Northwind Labs - Senior Engineer   Jan 2022 - Present",
  "- Worked on the ingestion pipeline and improved performance",
  "- Responsible for the internal API gateway",
  "- Reduced p99 latency from 480ms to 190ms across 12 services",
  "Solvent - Backend Engineer   Jun 2019 - Dec 2021",
  "- Owned the Redis caching layer",
];

function pdf(lines) {
  const content = lines
    .map((t, i) => `BT /F1 11 Tf 40 ${740 - i * 18} Td (${t.replace(/[()\\]/g, "")}) Tj ET`)
    .join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

const here = (n) => new URL(n, import.meta.url);
writeFileSync(here("resume-normal.pdf"), pdf(LINES), "latin1");
// No text operators at all: stands in for a scanned or screenshotted page.
writeFileSync(here("resume-image-only.pdf"), pdf([]), "latin1");
console.log("fixtures written");
```

Run it: `node scripts/fixtures/make-fixtures.mjs`

- [ ] **Step 3: Write the failing test** — `scripts/test-resume-parse.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseResume, LIMITS } from "../lib/resume/parse.mjs";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url));

// A normal text PDF parses into numbered lines.
const ok = await parseResume(fx("resume-normal.pdf"), "resume-normal.pdf");
assert.equal(ok.ok, true);
assert.ok(ok.pages >= 1 && ok.pages <= 10);
assert.ok(ok.lines.length > 5, "expected several extracted lines");
assert.equal(ok.lines[0].n, 1, "line numbers are 1-based");
assert.ok(/ARJUN MEHTA/.test(ok.text), "expected the fixture's own content");

// An image-only PDF is a FINDING, not a crash: no ATS could read it either.
const img = await parseResume(fx("resume-image-only.pdf"), "resume-image-only.pdf");
assert.equal(img.ok, false);
assert.equal(img.reason, "no-text");

// Rejected on content, not extension: a renamed .docx must not get through.
const docx = await parseResume(Buffer.from("PK not a pdf at all"), "cv.pdf");
assert.equal(docx.ok, false);
assert.equal(docx.reason, "not-pdf");

// Oversize is rejected before any parsing work happens.
const big = await parseResume(Buffer.alloc(LIMITS.maxBytes + 1), "big.pdf");
assert.equal(big.ok, false);
assert.equal(big.reason, "too-large");

// Never throws, whatever it is handed.
const empty = await parseResume(Buffer.alloc(0), "empty.pdf");
assert.equal(empty.ok, false);
const nothing = await parseResume(null, "");
assert.equal(nothing.ok, false);

console.log("resume-parse ok");
```

- [ ] **Step 4: Run it and watch it fail**

Run: `node scripts/test-resume-parse.mjs`
Expected: FAIL — cannot resolve `../lib/resume/parse.mjs`.

- [ ] **Step 5: Implement `lib/resume/parse.mjs`**

```js
// The only module that knows what a PDF is. Everything downstream sees text
// and numbered lines.
//
// Never throws: callers are user-facing and must distinguish "your file is a
// picture" (a real finding about the resume) from "our parser broke" (our
// problem, and not chargeable to the user's quota).
import { extractText, getDocumentProxy } from "unpdf";

export const LIMITS = { maxBytes: 2000000, maxPages: 10 };

export async function parseResume(buffer, filename = "") {
  if (!buffer || buffer.length === 0) {
    return { ok: false, reason: "unreadable", detail: "empty file" };
  }
  if (buffer.length > LIMITS.maxBytes) {
    return { ok: false, reason: "too-large", detail: `${(buffer.length / 1e6).toFixed(1)} MB` };
  }
  // Sniff the magic bytes. The extension is caller-controlled, so a renamed
  // .docx must not reach the parser.
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { ok: false, reason: "not-pdf", detail: filename.split(".").pop() || "unknown" };
  }

  let pages, text;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    pages = pdf.numPages;
    if (pages > LIMITS.maxPages) {
      return { ok: false, reason: "too-many-pages", detail: `${pages} pages` };
    }
    ({ text } = await extractText(pdf, { mergePages: true }));
  } catch (error) {
    return { ok: false, reason: "unreadable", detail: error.message };
  }

  const cleaned = String(text || "").replace(/\r/g, "");
  // An image-only PDF yields whitespace. That is a finding, not a failure:
  // every ATS receiving it reads nothing either.
  if (cleaned.trim().length < 40) {
    return { ok: false, reason: "no-text", detail: `0 characters extracted from ${pages} pages` };
  }

  const lines = cleaned.split("\n").map((t, i) => ({ n: i + 1, text: t.replace(/\s+$/, "") }));
  return { ok: true, text: cleaned, pages, lines };
}
```

- [ ] **Step 6: Run the test**

Run: `node scripts/test-resume-parse.mjs`
Expected: PASS.

- [ ] **Step 7: Register and commit**

Add to `package.json` scripts: `"resume-parse:test": "node scripts/test-resume-parse.mjs"`

```bash
git add lib/resume/parse.mjs scripts/test-resume-parse.mjs scripts/fixtures package.json package-lock.json
git commit -m "feat(resume): PDF parsing with image-only detection"
```

---

## Task 3: Format checks

**Files:**
- Create: `lib/resume/format-checks.mjs`, `scripts/test-format-checks.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `lines`, `pages`, `text` from Task 2.
- Produces: `formatChecks({lines, pages, text})` returning `{parseScore:number, formatScore:number, faults:Array<{sev, issue, fix, impact, line}>}` where `sev` is `"High" | "Medium" | "Low"`. Also `SEVERITIES = ["High","Medium","Low"]`.

- [ ] **Step 1: Write the failing test** — `scripts/test-format-checks.mjs`:

```js
import assert from "node:assert/strict";
import { formatChecks, SEVERITIES } from "../lib/resume/format-checks.mjs";

const mk = (arr) => ({ lines: arr.map((t, i) => ({ n: i + 1, text: t })), pages: 1, text: arr.join("\n") });

// Skills as prose is a real ATS fault: parsers index list items, not sentences.
const prose = formatChecks(mk(["SKILLS", "Languages and tools include Go, Python and PostgreSQL across several teams."]));
assert.ok(prose.faults.some((f) => /paragraph/i.test(f.issue)), "expected the skills-as-paragraph fault");

// A comma list of the same terms is fine.
const list = formatChecks(mk(["SKILLS", "Go, Python, PostgreSQL, Redis, gRPC, AWS"]));
assert.ok(!list.faults.some((f) => /paragraph/i.test(f.issue)), "comma list must not be flagged");

// Bullets with no number are the "no measurable outcomes" finding.
const vague = formatChecks(mk(["EXPERIENCE", "- Worked on the ingestion pipeline", "- Responsible for the API gateway"]));
const impact = vague.faults.find((f) => /measurable/i.test(f.issue));
assert.ok(impact, "expected the measurable-outcomes fault");
assert.ok(/2 of 2/.test(impact.issue), `expected a real count, got: ${impact.issue}`);

// A bullet carrying a number is not flagged.
const measured = formatChecks(mk(["EXPERIENCE", "- Reduced p99 latency from 480ms to 190ms"]));
assert.ok(!measured.faults.some((f) => /measurable/i.test(f.issue)));

// Every fault carries a severity the UI can colour and an actionable fix.
for (const f of [...prose.faults, ...vague.faults]) {
  assert.ok(SEVERITIES.includes(f.sev), `unknown severity: ${f.sev}`);
  assert.ok(f.fix && f.fix.length > 5, "every fault needs an actionable fix");
}

// Scores are bounded integers.
for (const r of [prose, list, vague, measured]) {
  for (const s of [r.parseScore, r.formatScore]) {
    assert.ok(Number.isInteger(s) && s >= 0 && s <= 100, `score out of range: ${s}`);
  }
}

// A clean resume must outscore a faulty one, or the score means nothing.
assert.ok(list.formatScore > prose.formatScore, "clean skills list must score higher than prose");

console.log("format-checks ok");
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node scripts/test-format-checks.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/resume/format-checks.mjs`**

```js
// Pure. No IO, no AI. Everything here is a mechanical property of the parsed
// text, which is exactly what an ATS sees, so these are the findings we can
// state with certainty.
export const SEVERITIES = ["High", "Medium", "Low"];

const BULLET = /^\s*[-*•]\s+/;
const HAS_NUMBER = /\d/;

export function formatChecks({ lines = [], pages = 1, text = "" }) {
  const faults = [];
  const body = lines.filter((l) => l.text.trim());

  // Skills written as prose: parsers index comma-separated terms, not sentences.
  const skillsIdx = body.findIndex((l) => /^SKILLS\b/i.test(l.text.trim()));
  if (skillsIdx >= 0) {
    const after = body.slice(skillsIdx + 1, skillsIdx + 4).map((l) => l.text).join(" ");
    const commas = (after.match(/,/g) || []).length;
    const words = after.trim().split(/\s+/).filter(Boolean).length;
    if (words > 8 && commas < words / 6) {
      faults.push({
        sev: "Medium", line: body[skillsIdx].n,
        issue: "Skills written as a paragraph",
        fix: "comma-separated list so each term is indexed",
        impact: "+2",
      });
    }
  }

  // Bullets with no number: the most common weakness, and measurable.
  const bullets = body.filter((l) => BULLET.test(l.text));
  const vague = bullets.filter((l) => !HAS_NUMBER.test(l.text));
  if (bullets.length && vague.length) {
    faults.push({
      sev: vague.length > bullets.length / 2 ? "High" : "Medium", line: vague[0].n,
      issue: `No measurable outcomes in ${vague.length} of ${bullets.length} bullets`,
      fix: "add a number: latency, throughput, cost, team size",
      impact: `+${Math.min(6, vague.length)}`,
    });
  }

  // A wrapped contact line breaks naive field extraction.
  const contact = body.slice(0, 4).find((l) => /@/.test(l.text));
  if (contact && contact.text.length > 70) {
    faults.push({
      sev: "Medium", line: contact.n,
      issue: "Contact line wraps",
      fix: "keep email, phone and location on one short line",
      impact: "+3",
    });
  }

  // "Present" in more than one role reads as two current jobs to a date parser.
  if ((text.match(/\bPresent\b/g) || []).length > 1) {
    faults.push({
      sev: "Low", line: null,
      issue: "'Present' used in two roles",
      fix: "fine for humans; add start months for consistency",
      impact: "+1",
    });
  }

  // Parse score reflects extraction quality: did real content come out?
  const density = body.length ? Math.min(1, body.length / (pages * 35)) : 0;
  const parseScore = Math.round(60 + 40 * density);

  // Format score starts clean and pays for each fault by severity.
  const cost = { High: 14, Medium: 8, Low: 3 };
  const formatScore = Math.max(0, 100 - faults.reduce((n, f) => n + cost[f.sev], 0));

  return { parseScore, formatScore, faults };
}
```

- [ ] **Step 4: Run the test**

Run: `node scripts/test-format-checks.mjs`
Expected: PASS.

- [ ] **Step 5: Register and commit**

Add `"format-checks:test": "node scripts/test-format-checks.mjs"`.

```bash
git add lib/resume/format-checks.mjs scripts/test-format-checks.mjs package.json
git commit -m "feat(resume): deterministic format and parse scoring"
```

---

## Task 4: AI extraction

**Files:**
- Create: `lib/resume/extract.mjs`, `scripts/test-resume-extract.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `chat` from Task 1; `text` from Task 2.
- Produces: `extractResume(text, {signal, model})` returning `{ok:true, skills:string[], impact:Array<{bullet, why}>, headline:string, subline:string}` or `{ok:false, reason:"unconfigured"|"http"|"network"|"invalid", detail?}`. Also `EXTRACT_SCHEMA`. The `model` override exists so Task 10's harness can evaluate a different model; without it the harness would silently always test the default.

- [ ] **Step 1: Write the failing test** — `scripts/test-resume-extract.mjs`:

```js
import assert from "node:assert/strict";

process.env.OPENROUTER_API_KEY = "test-key";

const VALID = JSON.stringify({
  skills: ["Go", "PostgreSQL", "gRPC"],
  impact: [{ bullet: "Worked on the ingestion pipeline", why: "no outcome stated" }],
  headline: "Passes most ATS filters.",
  subline: "Keyword coverage is the drag.",
});

// Happy path: a valid payload is parsed into the documented shape.
globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: VALID } }] }) });
const m1 = await import(`../lib/resume/extract.mjs?v=${Date.now()}a`);
const good = await m1.extractResume("ARJUN MEHTA\nSKILLS\nGo, PostgreSQL");
assert.equal(good.ok, true);
assert.deepEqual(good.skills, ["Go", "PostgreSQL", "gRPC"]);
assert.equal(good.impact.length, 1);
assert.ok(good.headline.length > 0);

// Malformed JSON must be reported, never thrown and never half-returned.
globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "not json at all" } }] }) });
const m2 = await import(`../lib/resume/extract.mjs?v=${Date.now()}b`);
const bad = await m2.extractResume("x");
assert.equal(bad.ok, false);
assert.equal(bad.reason, "invalid");

// Well-formed JSON of the WRONG shape is also "invalid" — a model that
// returns {} must not produce a scan with zero skills and no explanation.
globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) });
const m3 = await import(`../lib/resume/extract.mjs?v=${Date.now()}c`);
const shape = await m3.extractResume("x");
assert.equal(shape.ok, false);
assert.equal(shape.reason, "invalid");

// Transport failures pass the underlying reason straight through.
globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
const m4 = await import(`../lib/resume/extract.mjs?v=${Date.now()}d`);
const net = await m4.extractResume("x");
assert.equal(net.ok, false);
assert.equal(net.reason, "network");

// A model override must reach the wire. Without this the eval harness would
// silently report on the default model whatever it was asked to test.
let usedModel = null;
globalThis.fetch = async (_u, init) => {
  usedModel = JSON.parse(init.body).model;
  return { ok: true, json: async () => ({ choices: [{ message: { content: VALID } }] }) };
};
const m5 = await import(`../lib/resume/extract.mjs?v=${Date.now()}e`);
await m5.extractResume("x", { model: "openai/gpt-5-mini" });
assert.equal(usedModel, "openai/gpt-5-mini");
// ...and omitting it must fall through to the configured default, not undefined.
await m5.extractResume("x");
assert.ok(usedModel && usedModel !== "openai/gpt-5-mini", `expected the default model, got ${usedModel}`);

console.log("resume-extract ok");
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node scripts/test-resume-extract.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/resume/extract.mjs`**

```js
// The single AI call over the resume. The only module that knows the prompt.
//
// Returns ok:false rather than a partial result on every failure path,
// including a well-formed response of the wrong shape: a scan built on {} is
// worse than no scan, because the user acts on it.
import { chat } from "../ai/openrouter.mjs";

export const EXTRACT_SCHEMA = {
  name: "resume_extract",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["skills", "impact", "headline", "subline"],
    properties: {
      skills: { type: "array", items: { type: "string" }, maxItems: 40 },
      impact: {
        type: "array", maxItems: 12,
        items: {
          type: "object", additionalProperties: false,
          required: ["bullet", "why"],
          properties: { bullet: { type: "string" }, why: { type: "string" } },
        },
      },
      headline: { type: "string" },
      subline: { type: "string" },
    },
  },
};

const SYSTEM = [
  "You read one resume and report what is in it. You never invent facts.",
  "skills: concrete technologies, tools and named methodologies the resume",
  "actually mentions. Normalise to a canonical form (K8s -> Kubernetes,",
  "Golang -> Go, Postgres -> PostgreSQL). Do not add skills that are merely",
  "implied. Do not include job titles, soft skills or company names.",
  "impact: bullets that describe responsibility without a measurable outcome.",
  "headline: one sentence on the resume's overall ATS readiness.",
  "subline: one sentence on the single biggest thing to fix.",
].join(" ");

export async function extractResume(text, { signal, model } = {}) {
  // The static rubric goes in `system` so it sits at the head of the prompt
  // and benefits from the provider's 10x cheaper cached-input reads.
  //
  // `model` is normally undefined, which lets chat() apply MODEL. Task 10's
  // harness passes it to evaluate an alternative; without threading it here
  // the harness would report on the default model whatever it was asked for.
  const result = await chat({
    system: SYSTEM,
    user: String(text || "").slice(0, 24000),
    schema: EXTRACT_SCHEMA,
    maxTokens: 1500,
    signal,
    ...(model ? { model } : {}),
  });
  if (!result.ok) return result;

  let payload;
  try {
    payload = JSON.parse(result.text);
  } catch {
    return { ok: false, reason: "invalid", detail: "response was not JSON" };
  }
  // strict:true should guarantee the shape, but a provider that silently
  // ignores the schema must not reach the scorer.
  if (
    !Array.isArray(payload.skills) ||
    !Array.isArray(payload.impact) ||
    typeof payload.headline !== "string" || !payload.headline ||
    typeof payload.subline !== "string" || !payload.subline
  ) {
    return { ok: false, reason: "invalid", detail: "response did not match the schema" };
  }

  return {
    ok: true,
    skills: payload.skills.map((s) => String(s).trim()).filter(Boolean),
    impact: payload.impact.filter((i) => i && i.bullet),
    headline: payload.headline,
    subline: payload.subline,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `node scripts/test-resume-extract.mjs`
Expected: PASS.

- [ ] **Step 5: Register and commit**

Add `"resume-extract:test": "node scripts/test-resume-extract.mjs"`.

```bash
git add lib/resume/extract.mjs scripts/test-resume-extract.mjs package.json
git commit -m "feat(resume): AI extraction with strict schema validation"
```

---

## Task 5: Score assembly

**Files:**
- Create: `lib/resume/score.mjs`, `scripts/test-resume-score.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `formatChecks` output (Task 3), `extractResume` output (Task 4), `parseResume` output (Task 2).
- Produces: `buildScan({parsed, checks, extracted, filename})` returning `{score, parts, issues, found, headline, subline, scan:{filename,pages,lines}, skills}`. `parts` is `Array<{label,value,color}>` with labels exactly `["Parse","Keywords","Format","Impact"]`. Also `PREVIEW_LINES = 40`.

- [ ] **Step 1: Write the failing test** — `scripts/test-resume-score.mjs`:

```js
import assert from "node:assert/strict";
import { buildScan, PREVIEW_LINES } from "../lib/resume/score.mjs";

const parsed = {
  ok: true, pages: 2,
  text: "ARJUN MEHTA\nSKILLS\nGo, PostgreSQL",
  lines: Array.from({ length: 120 }, (_, i) => ({ n: i + 1, text: `line ${i + 1}` })),
};
const checks = {
  parseScore: 96, formatScore: 78,
  faults: [{ sev: "High", issue: "No measurable outcomes in 6 of 11 bullets", fix: "add a number", impact: "+5", line: 15 }],
};
const extracted = {
  ok: true, skills: ["Go", "PostgreSQL", "gRPC"],
  impact: [{ bullet: "Worked on the pipeline", why: "no outcome" }],
  headline: "Passes most ATS filters.", subline: "Keyword coverage is the drag.",
};

const out = buildScan({ parsed, checks, extracted, filename: "arjun.pdf" });

// The four bars the design draws, in the design's order.
assert.deepEqual(out.parts.map((p) => p.label), ["Parse", "Keywords", "Format", "Impact"]);
for (const p of out.parts) {
  assert.ok(Number.isInteger(p.value) && p.value >= 0 && p.value <= 100, `bad part value: ${p.value}`);
  assert.ok(/^#[0-9a-f]{6}$/i.test(p.color), `part needs a colour: ${p.color}`);
}

// Overall score is a bounded integer derived from the parts, not a constant.
assert.ok(Number.isInteger(out.score) && out.score >= 0 && out.score <= 100);

// Spec D11: only the displayed lines are retained, never the whole document.
assert.ok(out.scan.lines.length <= PREVIEW_LINES, `retained ${out.scan.lines.length} lines, cap is ${PREVIEW_LINES}`);
assert.equal("text" in out.scan, false, "the full extracted text must not be carried into the stored shape");

// Lines flagged by a fault are marked so the parser view can highlight them.
const flagged = out.scan.lines.find((l) => l.n === 15);
assert.ok(flagged && flagged.flag, "line 15 carries a fault and must be flagged");

// Both fault sources merge into one issues list.
assert.ok(out.issues.length >= 2, "format faults and AI impact findings must merge");

// Prose and skills pass through.
assert.equal(out.headline, "Passes most ATS filters.");
assert.deepEqual(out.skills, ["Go", "PostgreSQL", "gRPC"]);

// A worse resume must score lower. Reverting the weighting breaks this.
const worse = buildScan({
  parsed, filename: "x.pdf", extracted,
  checks: { parseScore: 40, formatScore: 30, faults: checks.faults },
});
assert.ok(worse.score < out.score, "lower subscores must produce a lower overall score");

console.log("resume-score ok");
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node scripts/test-resume-score.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/resume/score.mjs`**

```js
// Pure assembly. Every number the user sees is produced here, from plain data,
// so the whole scoring behaviour is table-testable with no network and no DB.
//
// Keywords is a placeholder weight in plan 1: the corpus comparison that gives
// it a real denominator is plan 2. It is derived from how many distinct skills
// the resume states, which is honest on its own terms and never fabricated.

// Spec D11: the parser view shows a window, and only that window is stored.
export const PREVIEW_LINES = 40;

const COLORS = { good: "#12876b", warn: "#d98324", accent: "#5b4ef0" };
const colorFor = (v) => (v >= 85 ? COLORS.good : v >= 70 ? COLORS.accent : COLORS.warn);

export function buildScan({ parsed, checks, extracted, filename }) {
  const skills = extracted.skills || [];

  // Keywords: 12 distinct stated skills is a full mark. Plan 2 replaces this
  // with coverage against a real posting cohort.
  const keywords = Math.max(0, Math.min(100, Math.round((skills.length / 12) * 100)));
  const impactScore = Math.max(
    0,
    100 - (extracted.impact || []).length * 8
  );

  const parts = [
    { label: "Parse", value: checks.parseScore, color: colorFor(checks.parseScore) },
    { label: "Keywords", value: keywords, color: colorFor(keywords) },
    { label: "Format", value: checks.formatScore, color: colorFor(checks.formatScore) },
    { label: "Impact", value: impactScore, color: colorFor(impactScore) },
  ];

  // Parse is weighted hardest: if a parser cannot read the file, nothing else
  // about it matters.
  const score = Math.round(
    checks.parseScore * 0.35 + keywords * 0.25 + checks.formatScore * 0.2 + impactScore * 0.2
  );

  const issues = [
    ...checks.faults,
    ...(extracted.impact || []).map((i) => ({
      sev: "Medium", line: null,
      issue: i.bullet.slice(0, 80),
      fix: i.why,
      impact: "+2",
    })),
  ];

  const flagged = new Set(checks.faults.map((f) => f.line).filter((n) => n != null));
  const lines = (parsed.lines || []).slice(0, PREVIEW_LINES).map((l) => ({
    n: l.n,
    text: l.text.slice(0, 120),
    flag: flagged.has(l.n) ? "bad" : null,
  }));

  return {
    score, parts, issues,
    found: skills,
    headline: extracted.headline,
    subline: extracted.subline,
    skills,
    // Note the absence of `text`: only the displayed window is retained.
    scan: { filename, pages: parsed.pages, lines },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `node scripts/test-resume-score.mjs`
Expected: PASS.

- [ ] **Step 5: Register and commit**

Add `"resume-score:test": "node scripts/test-resume-score.mjs"`.

```bash
git add lib/resume/score.mjs scripts/test-resume-score.mjs package.json
git commit -m "feat(resume): pure score assembly with bounded line retention"
```

---

## Task 6: Persistence and quota

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/resume/store.mjs`, `scripts/test-resume-store.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildScan` output (Task 5).
- Produces: `saveScan(userId, built)`, `latestScan(userId)`, `scanQuota(userId)` returning `{used, quota, remaining, exhausted}`, `deleteScans(userId)`. Also `QUOTA = 3`.

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

```prisma
model ResumeScan {
  id        String   @id @default(cuid())
  userId    String
  filename  String
  pages     Int
  score     Int
  skills    String[]
  result    Json
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  targets   ResumeScanTarget[]

  @@index([userId, createdAt])
}

model ResumeScanTarget {
  id             String     @id @default(cuid())
  scanId         String
  canonicalTitle String
  score          Int
  cohortSize     Int
  detail         Json
  createdAt      DateTime   @default(now())
  scan           ResumeScan @relation(fields: [scanId], references: [id], onDelete: Cascade)

  @@unique([scanId, canonicalTitle])
  @@index([scanId, createdAt])
}
```

Add the back-relation to the existing `User` model alongside its other relation fields:

```prisma
  resumeScans     ResumeScan[]
```

`ResumeScanTarget` is unused in plan 1 — plan 2 writes it. It ships now so the migration is one operation on a shared schema rather than two.

- [ ] **Step 2: Confirm the target database**

```bash
node --input-type=module -e '
import { loadEnvFile } from "./lib/load-env.mjs";
loadEnvFile(".env.local");
const u = new URL(process.env.DATABASE_URL);
console.log("target host:", u.hostname);
if (!u.hostname.endsWith("aivencloud.com")) {
  console.error("REFUSING: not the Aiven staging host. Stop and ask.");
  process.exit(1);
}
console.log("ok - staging");
'
```

Expected: `pg-3fe711d-redgear204-9f81.i.aivencloud.com` then `ok - staging`. Anything else — a raw IP in particular — **stop and ask**. Do not edit `.env.local` to make it pass.

- [ ] **Step 3: Generate the client, then apply ADDITIVE SQL — never `db:push`**

> **`npm run db:push` must never be run against this database.** It was in an
> earlier draft of this plan and it is wrong. The job-board tables (`jobs`,
> `job_locations`, `companies`, `title_stats`, `skill_stats`, `site_metrics`,
> `location_stats`, `country_stats`, `remote_title_stats`, `salary_tier_stats`,
> `blocked_ips`) are created by `scripts/import_to_postgres.py` in raw SQL and
> are declared **nowhere** in `prisma/schema.prisma`. Prisma therefore treats
> them as foreign and proposes **dropping all eleven** — 5,000 jobs, 10,641
> locations, 3,380 title stats and the rest. Verified: a real `db:push` attempt
> against staging listed exactly those drops before refusing without
> `--accept-data-loss`. This hazard predates this feature and applies to any
> `db push` on this repo.

Generate the client — this reads the schema file only and never touches the database:

```bash
npx prisma generate
```

Then apply only the two new tables. Write `scripts/migrate-resume-tables.mjs`, which must re-check the host itself rather than trusting that Step 2 was run:

```js
// Additive DDL for the resume-scan tables. Deliberately NOT `prisma db push`:
// the job-board tables are managed by raw SQL and are absent from
// prisma/schema.prisma, so db push proposes dropping all eleven of them.
// Statements are idempotent and touch nothing that already exists.
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig } from "../lib/pg-config.mjs";

loadEnvFile(".env.local");
const host = new URL(process.env.DATABASE_URL).hostname;
if (!host.endsWith("aivencloud.com")) {
  console.error(`REFUSING: ${host} is not the Aiven staging host.`);
  process.exit(1);
}

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "ResumeScan" (
     "id" TEXT NOT NULL,
     "userId" TEXT NOT NULL,
     "filename" TEXT NOT NULL,
     "pages" INTEGER NOT NULL,
     "score" INTEGER NOT NULL,
     "skills" TEXT[],
     "result" JSONB NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ResumeScan_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE TABLE IF NOT EXISTS "ResumeScanTarget" (
     "id" TEXT NOT NULL,
     "scanId" TEXT NOT NULL,
     "canonicalTitle" TEXT NOT NULL,
     "score" INTEGER NOT NULL,
     "cohortSize" INTEGER NOT NULL,
     "detail" JSONB NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ResumeScanTarget_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "ResumeScan_userId_createdAt_idx" ON "ResumeScan"("userId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ResumeScanTarget_scanId_createdAt_idx" ON "ResumeScanTarget"("scanId", "createdAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ResumeScanTarget_scanId_canonicalTitle_key" ON "ResumeScanTarget"("scanId", "canonicalTitle")`,
];

// Foreign keys have no IF NOT EXISTS, so add them only when absent.
const CONSTRAINTS = [
  [`ResumeScan_userId_fkey`, `ALTER TABLE "ResumeScan" ADD CONSTRAINT "ResumeScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  [`ResumeScanTarget_scanId_fkey`, `ALTER TABLE "ResumeScanTarget" ADD CONSTRAINT "ResumeScanTarget_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "ResumeScan"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
];

const pool = new pg.Pool(buildPgConfig());
const client = await pool.connect();
try {
  const before = await client.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`);
  await client.query("BEGIN");
  for (const sql of STATEMENTS) await client.query(sql);
  for (const [name, sql] of CONSTRAINTS) {
    const { rows } = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [name]);
    if (!rows.length) await client.query(sql);
  }
  await client.query("COMMIT");
  const after = await client.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`);
  console.log(`tables before: ${before.rows[0].n}  after: ${after.rows[0].n}  (expected +2 on a fresh run, +0 when re-run)`);
  for (const t of ["ResumeScan", "ResumeScanTarget"]) {
    const { rows } = await client.query(`SELECT to_regclass($1) AS t`, [`public.\"${t}\"`]);
    console.log(`  ${t}: ${rows[0].t ? "present" : "MISSING"}`);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("migration failed, rolled back:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
```

Register it as `"resume-tables:migrate": "node scripts/migrate-resume-tables.mjs"` and run it. The table count must go up by exactly 2, and both tables must report `present`. Re-running it must be a no-op (`+0`), which proves it is idempotent.

- [ ] **Step 4: Write the failing test** — `scripts/test-resume-store.mjs`:

```js
import assert from "node:assert/strict";
import { QUOTA, quotaFrom } from "../lib/resume/store.mjs";

// Quota arithmetic is pure and must be testable without a database, because
// it is the thing that decides whether a user is charged.
assert.deepEqual(quotaFrom(0), { used: 0, quota: QUOTA, remaining: QUOTA, exhausted: false });
assert.deepEqual(quotaFrom(2), { used: 2, quota: QUOTA, remaining: 1, exhausted: false });
assert.deepEqual(quotaFrom(3), { used: 3, quota: QUOTA, remaining: 0, exhausted: true });

// Never negative, whatever the count says. A stored counter could drift past
// the quota; a derived count should not, but the UI must not render "-1 left".
assert.equal(quotaFrom(5).remaining, 0);
assert.equal(quotaFrom(5).exhausted, true);

console.log("resume-store ok");
```

- [ ] **Step 5: Run it and watch it fail**

Run: `node scripts/test-resume-store.mjs`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement `lib/resume/store.mjs`**

```js
// The only module that knows Prisma. Quota is derived from scan rows rather
// than stored in a counter (spec D8): a counter is a second source of truth
// that drifts the first time a write half-fails, and then the header and the
// scan history disagree about how many scans a user has had.
import prisma from "../prisma.js";

export const QUOTA = 3;

// Pure, so the arithmetic that decides whether a user is charged can be
// tested without a database.
export function quotaFrom(used) {
  const safe = Math.max(0, Number(used) || 0);
  return {
    used: safe,
    quota: QUOTA,
    remaining: Math.max(0, QUOTA - safe),
    exhausted: safe >= QUOTA,
  };
}

export async function scanQuota(userId) {
  if (!userId) return quotaFrom(0);
  return quotaFrom(await prisma.resumeScan.count({ where: { userId } }));
}

// Called only after a fully successful scan. Writing the row IS consuming the
// quota, so there is no path where a failed scan costs the user anything.
export async function saveScan(userId, built) {
  return prisma.resumeScan.create({
    data: {
      userId,
      filename: built.scan.filename,
      pages: built.scan.pages,
      score: built.score,
      skills: built.skills,
      result: built,
    },
    select: { id: true, createdAt: true },
  });
}

export async function latestScan(userId) {
  if (!userId) return null;
  return prisma.resumeScan.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

// Spec D11: the user can delete what we hold. Cascades to targets.
export async function deleteScans(userId) {
  return prisma.resumeScan.deleteMany({ where: { userId } });
}
```

- [ ] **Step 7: Run the test**

Run: `node scripts/test-resume-store.mjs`
Expected: PASS.

- [ ] **Step 8: Register and commit**

Add `"resume-store:test": "node scripts/test-resume-store.mjs"`.

```bash
git add prisma/schema.prisma lib/resume/store.mjs scripts/test-resume-store.mjs package.json
git commit -m "feat(resume): persistence with derived quota"
```

---

## Task 7: The scan route

**Files:**
- Create: `app/api/resume/scan/route.js`, `app/api/resume/quota/route.js`, `app/api/resume/delete/route.js`

**Interfaces:**
- Consumes: everything from Tasks 2-6.
- Produces: `POST /jobs/api/resume/scan` accepting `multipart/form-data` with a `file` field, returning `200 {ok:true, scan}` or `4xx/5xx {ok:false, reason, detail, quotaConsumed:false}`. `GET /jobs/api/resume/quota` returning `{used, quota, remaining, exhausted, signedIn}`. `POST /jobs/api/resume/delete` returning `{ok:true, deleted:number}`.

- [ ] **Step 1: Implement `app/api/resume/scan/route.js`**

```js
// Orchestrates the scan. The ordering here is the spec's "never half-score"
// rule made concrete: parse, extract, assemble, and only then write. Any
// failure returns before the write, so the user is never charged for a scan
// they did not receive.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { parseResume } from "@/lib/resume/parse.mjs";
import { formatChecks } from "@/lib/resume/format-checks.mjs";
import { extractResume } from "@/lib/resume/extract.mjs";
import { buildScan } from "@/lib/resume/score.mjs";
import { saveScan, scanQuota } from "@/lib/resume/store.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The AI call dominates and runs 10-20s. The platform default would cut it off.
export const maxDuration = 60;

const fail = (status, reason, detail) =>
  NextResponse.json({ ok: false, reason, detail, quotaConsumed: false }, { status });

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return fail(401, "signed-out", "Sign in to scan a resume.");

  const quota = await scanQuota(userId);
  if (quota.exhausted) return fail(402, "quota", `${quota.used} of ${quota.quota} free scans used`);

  let file;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return fail(400, "bad-request", "Expected a multipart upload.");
  }
  if (!file || typeof file.arrayBuffer !== "function") {
    return fail(400, "bad-request", "No file was uploaded.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseResume(buffer, file.name || "resume.pdf");
  if (!parsed.ok) {
    // "no-text" is a finding about the resume, not a server error, so it is a
    // 200-adjacent 422 rather than a 500 — and it still costs no quota.
    return fail(parsed.reason === "unreadable" ? 500 : 422, parsed.reason, parsed.detail);
  }

  const extracted = await extractResume(parsed.text);
  if (!extracted.ok) {
    return fail(extracted.reason === "unconfigured" ? 503 : 502, "scanner", extracted.detail || extracted.reason);
  }

  const checks = formatChecks(parsed);
  const built = buildScan({ parsed, checks, extracted, filename: file.name || "resume.pdf" });

  // The write is the last thing that happens, and it is what consumes quota.
  const saved = await saveScan(userId, built);
  return NextResponse.json({ ok: true, scan: { ...built, id: saved.id } });
}
```

- [ ] **Step 2: Implement `app/api/resume/quota/route.js`**

```js
// AuthNav is a client component using useSession, so the header pips cannot
// read the derived quota directly. This is the smallest surface that lets them.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { scanQuota, QUOTA } from "@/lib/resume/store.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ used: 0, quota: QUOTA, remaining: QUOTA, exhausted: false, signedIn: false });
  }
  return NextResponse.json({ ...(await scanQuota(session.user.id)), signedIn: true });
}
```

- [ ] **Step 3: Implement `app/api/resume/delete/route.js`**

The upload screen's "Good to know" block and the result screen both tell the
user they can delete their scan. Without this route that is a false promise,
and spec D11 makes deletability part of the justification for storing text at
all.

```js
// Honours the deletion the UI promises. POST, not GET: it is destructive and
// must not be triggerable by a prefetch or a link crawler.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { deleteScans } from "@/lib/resume/store.mjs";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ ok: false, reason: "signed-out" }, { status: 401 });

  // Scoped to the caller's own rows by userId. Cascades to ResumeScanTarget.
  const { count } = await deleteScans(userId);
  return NextResponse.json({ ok: true, deleted: count });
}
```

Deleting scans returns the user's quota to full, because quota is derived from
the rows (spec D8). That is the correct behaviour and should be stated in the
confirmation copy, not discovered.

- [ ] **Step 4: Verify the guards by hand**

Run the dev server (`npm run dev`) and check, signed out:

```bash
curl -si -X POST http://localhost:4100/jobs/api/resume/scan -F file=@scripts/fixtures/resume-normal.pdf | head -3
```

Expected: `401` with `"reason":"signed-out"`.

```bash
curl -s http://localhost:4100/jobs/api/resume/quota
```

Expected: `{"used":0,...,"signedIn":false}`.

- [ ] **Step 5: Verify the no-charge rule**

Signed in, upload the image-only fixture. Expected: `422` with `"reason":"no-text"` and `"quotaConsumed":false`, and `GET /jobs/api/resume/quota` still reports the same `used` as before the attempt. This is the spec's central promise — check it explicitly rather than assuming.

- [ ] **Step 6: Verify deletion restores quota**

Signed in with at least one scan: `POST /jobs/api/resume/delete`, then `GET /jobs/api/resume/quota`. Expected: `used` returns to `0` and `remaining` to `3`. Confirm signed-out `POST` returns `401` and deletes nothing.

- [ ] **Step 7: Commit**

```bash
git add app/api/resume
git commit -m "feat(resume): scan, quota and delete routes, no charge on failure"
```

---

## Task 8: The resume screens

**Files:**
- Create: `components/ResumeUpload.jsx`, `ResumeScanning.jsx`, `ResumeError.jsx`, `ResumeSignedOut.jsx`, `ParsedTextView.jsx`
- Modify: `app/resume/page.jsx`, `components/ResumeScan.jsx`, `app/globals.css`

**Interfaces:**
- Consumes: `latestScan`, `scanQuota` (Task 6); the scan route (Task 7).
- Produces: `/jobs/resume` rendering signed-out, upload, scanning, result and error states.

Design reference: `docs/superpowers/specs/direction-c.html` screens `C Resume Upload`, `C Resume Scanning`, `C Resume Errors`, `C Resume Signed Out`, `C Resume ATS`, `C Mobile Resume`. Match the token palette exactly; IBM Plex Mono for every number.

- [ ] **Step 1: Rewrite `app/resume/page.jsx` as the state router**

```jsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { latestScan, scanQuota } from "@/lib/resume/store.mjs";
import ResumeSignedOut from "@/components/ResumeSignedOut";
import ResumeUpload from "@/components/ResumeUpload";
import ResumeScan from "@/components/ResumeScan";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Resume scan | LeadNear Jobs",
  description: "See your resume the way an ATS sees it.",
  // Personal, per-user output. Never indexed, and deliberately absent from
  // app/sitemap.js for the same reason.
  robots: "noindex",
};

export default async function ResumePage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return <ResumeSignedOut />;

  const [scan, quota] = await Promise.all([latestScan(userId), scanQuota(userId)]);
  if (!scan) return <ResumeUpload quota={quota} />;
  return <ResumeScan data={scan.result} quota={quota} />;
}
```

- [ ] **Step 2: Create `components/ParsedTextView.jsx`**

Replaces the design's un-buildable "rendered resume page" panel (spec section 9).

```jsx
// Shows the text exactly as the parser read it, which is the product promise:
// this is what an ATS receives. Lines carrying a fault are highlighted.
export default function ParsedTextView({ lines = [], pages = 1 }) {
  const words = lines.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0);
  return (
    <div className="rs-card">
      <div className="rs-card-head">
        <span>What the parser read</span>
        <span className="mono">{pages} pages · {words} words</span>
      </div>
      <div className="rs-caption">
        Plain text exactly as an ATS extracts it. Highlighted lines are the ones costing you points.
      </div>
      <div className="rs-parsed">
        {lines.map((l) => (
          <div key={l.n} className={l.flag ? `rs-parsed-line is-${l.flag}` : "rs-parsed-line"}>
            <span className="rs-parsed-n mono">{l.n}</span>
            <span className="rs-parsed-t">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/ResumeUpload.jsx`**

A client component with drag-and-drop and a browse button. It POSTs to the scan route, shows `ResumeScanning` while in flight, and `ResumeError` on a non-ok response.

Required copy, verbatim from the design and the Global Constraints:
- `PDF · max 2 MB · max 10 pages`
- Three value props: `An ATS score out of 100` / `The text a parser actually reads` / `Every open role ranked by fit`
- "Good to know" block, with the D11 wording: **"We store the text we show you, never the file."**, "Scoring against a different job title later is free.", "Delete your scan any time from your account."
- Do **not** include "Import from Files or Drive" (spec section 9).

- [ ] **Step 4: Create `components/ResumeScanning.jsx`**

Indeterminate only — no percentage. Shows the filename. Copy: "Reading your resume", "This usually takes 10 to 20 seconds."

Do **not** include "We will email you if it takes longer than a minute" or "Safe to close the app" — the scan is synchronous and cannot honour either (spec D9, section 9).

- [ ] **Step 5: Create `components/ResumeError.jsx`**

Maps `reason` to the four cards in `C Resume Errors`:

| reason | title | tag |
|---|---|---|
| `not-pdf` | That file is a Word document | Not scanned |
| `too-large`, `too-many-pages` | That file is too big to read | Not scanned |
| `no-text` | No readable text in this PDF | **Worth fixing** (warn palette) |
| `scanner`, `unreadable` | Scanner is temporarily unavailable | **No scan used** (ok palette) |

`no-text` uses the warning palette, not the error palette, and says this is a real finding: an ATS receiving that file reads nothing either. The outage card's green "No scan used" tag is a literal promise Task 7 keeps.

Omit the secondary CTAs "How to shrink a PDF", "Why this matters" and "Notify me when it is back" — they link to pages that do not exist (spec section 9).

- [ ] **Step 6: Create `components/ResumeSignedOut.jsx`**

Per `C Resume Signed Out`: sells the feature, sign-in is the CTA rather than a wall, and the sample score is labelled "A sample result".

- [ ] **Step 7: Update `components/ResumeScan.jsx`**

- Take `data` (the stored `result`) and `quota`; drop `scansUsed`.
- Replace the Preview panel with `ParsedTextView`.
- Keep the `Upload revised` confirm modal the design added — it costs one of three scans and users will not expect that.
- The `Scored against` select renders disabled in plan 1 with the note "Comparison against live postings is coming" — plan 2 wires it. Do not fabricate cohort options.

- [ ] **Step 8: Add the delete control**

The upload and result screens both promise the user can delete their scan, so
the control has to exist. Put it in the result screen's footer as a quiet text
button — "Delete my scan" — that confirms before POSTing to
`/api/resume/delete`, then refreshes the route.

The confirmation must state the consequence plainly, because it is not obvious
and it is in the user's favour:

> Deleting removes the stored text and the result. Your free scans go back to 3.

Do not use a bare `confirm()`; reuse the modal treatment the design added for
`Upload revised` so the two destructive-ish actions look the same.

- [ ] **Step 9: Add styles to `app/globals.css`**

`.rs-parsed`, `.rs-parsed-line`, `.rs-parsed-n`, `.rs-parsed-t`, `.is-bad`, `.is-warn`, `.ru-*` (upload), `.rsc-*` (scanning), `.re-*` (error). Reuse the existing token variables; add none.

Two precedents in this file that must be respected:
- `.hh-cta-note:empty` uses `position:absolute; margin:0`, not `display:none`, because `display:none` breaks live-region announcement. Follow it for any new empty-state note.
- The phone breakpoint rules are grouped at the end of the file; add phone variants there, matching `C Mobile Resume`.

- [ ] **Step 10: Verify in the browser**

Start the dev server and check, at desktop and at 390px: signed out, upload (including drag-hover), scanning, a real result from `scripts/fixtures/resume-normal.pdf`, each error via a deliberately bad upload, and the delete flow. Confirm no horizontal scroll at 390px.

Measure rather than eyeball the two things a screenshot hides: that the phone CTA is actually full-width (`getBoundingClientRect().width`, not `getComputedStyle().width` — a previous effort shipped a regression where `min-height` was reported correctly while the element was 122px wide), and that `.rs-parsed` scrolls horizontally on its own rather than widening the page.

- [ ] **Step 11: Commit**

```bash
git add components app/resume app/globals.css
git commit -m "feat(resume): upload, scanning, result and error screens"
```

---

## Task 9: Retire the fabricated layer

**Files:**
- Delete: `lib/demo-fit.js`, `lib/demo-resume.js`, `lib/match-buckets.js`, `components/DemoDisclosure.jsx`, `components/DemoOffPanel.jsx`, `scripts/test-demo-fit.mjs`, `scripts/test-demo-resume.mjs`, `scripts/test-match-buckets.mjs`
- Modify: `components/JobCard.jsx`, `JobPreview.jsx`, `Filters.jsx`, `AuthNav.jsx`, `app/matches/page.jsx`, `package.json`, `.env.example`

**Interfaces:**
- Consumes: `scanQuota` (Task 6), `GET /api/resume/quota` (Task 7).
- Produces: no module. After this task `grep -r "demo-fit\|demo-resume\|DEMO_FIT" app components lib` returns nothing.

Spec D12. Every fit badge on the site is currently derived from an FNV-1a hash of the job slug. Real fit arrives in plan 2; until then no badge is correct, and a fabricated one is not.

- [ ] **Step 1: Strip the fallback in `components/JobCard.jsx`**

```jsx
// job.fit is set by the scoring subsystem for signed-in users who have
// scanned. Nothing else sets it, and nothing fabricates one: a job with no
// computed fit renders no badge at all, never a guessed "Low fit", which
// would read as a judgement of the job.
const fit = job.fit ?? null;
```

Remove the `FIT_LABEL`/`fitFor` import. Keep the badge markup — it renders only when `fit` is set — and move `FIT_LABEL` into `JobCard` as a local constant, since it is now the only consumer.

- [ ] **Step 2: Strip `components/JobPreview.jsx`**

Remove the `bannerFor(fitFor(...))` banner and its import. The Save button and the rest of the pane stay.

- [ ] **Step 3: Strip `components/Filters.jsx`**

Remove the `DEMO_FIT` import; set `fitSortEnabled` to `false` with a comment pointing at plan 2. Sorting by a fit nothing computes would produce an arbitrary order presented as a ranking.

- [ ] **Step 4: Make `components/AuthNav.jsx` read the real quota**

Replace the `DEMO_FIT`/`DEMO_SCANS_USED`/`DEMO_QUOTA` imports with a fetch of `/api/resume/quota` (via `NEXT_PUBLIC_BASE_PATH`) once the session resolves. Pips show only for authenticated users. While the request is in flight keep the existing placeholder so the navbar does not shift — that behaviour is already implemented and must not regress.

- [ ] **Step 5: Reduce `app/matches/page.jsx` to the empty state**

Real ranking is plan 2. Until then `/matches` renders the `C Matches Empty` treatment: "No matches yet", pointing at `/resume`. Delete the `bucketJobs` import and the cohort query. Keep `robots: "noindex"`.

- [ ] **Step 6: Delete the modules and their tests**

```bash
git rm lib/demo-fit.js lib/demo-resume.js lib/match-buckets.js \
       components/DemoDisclosure.jsx components/DemoOffPanel.jsx \
       scripts/test-demo-fit.mjs scripts/test-demo-resume.mjs scripts/test-match-buckets.mjs
```

Remove `demo-fit:test`, `demo-resume:test` and `match-buckets:test` from `package.json`, and `NEXT_PUBLIC_DEMO_FIT` from `.env.example`.

- [ ] **Step 7: Prove nothing references them**

```bash
grep -rn "demo-fit\|demo-resume\|match-buckets\|DEMO_FIT\|fitFor\|bannerFor\|DemoDisclosure\|DemoOffPanel" app components lib scripts
```

Expected: no output. Then `npm run lint` — expected: no new errors.

- [ ] **Step 8: Check `scripts/test-home-spec.mjs` still passes**

That suite asserts against home-page CSS and markup that this task touches. If it fails, fix the suite only where the fabricated layer was genuinely removed — do not weaken an assertion to make it pass.

Run: `npm run home-spec:test`

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: delete the fabricated fit and scan layer"
```

---

## Task 10: Model evaluation harness

**Files:**
- Create: `lib/resume/eval.mjs`, `scripts/test-resume-eval.mjs`, `scripts/fixtures/eval-cases.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `extractResume` (Task 4), `MODEL` (Task 1).
- Produces: `runEval({model})` returning `{model, cases, passed, failed, details}`.

Spec D7. `deepseek-v4-flash` is unproven for this task; this makes "is the cheap model good enough" a measurement rather than an assumption, and switching models a one-line change.

- [ ] **Step 1: Create `scripts/fixtures/eval-cases.json`**

```json
[
  {
    "name": "backend-normalisation",
    "text": "SKILLS\nGolang, K8s, Postgres, gRPC\nEXPERIENCE\n- Built services handling 2M records daily",
    "expectSkills": ["Go", "Kubernetes", "PostgreSQL", "gRPC"],
    "forbidSkills": ["Golang", "K8s", "Postgres"]
  },
  {
    "name": "no-invention",
    "text": "SKILLS\nExcel, PowerPoint\nEXPERIENCE\n- Managed the monthly reporting pack",
    "expectSkills": ["Excel", "PowerPoint"],
    "forbidSkills": ["Python", "SQL", "Tableau"]
  },
  {
    "name": "impact-detection",
    "text": "EXPERIENCE\n- Responsible for the billing service\n- Cut infra cost by 32% in one quarter",
    "expectImpactContains": "billing",
    "forbidImpactContains": "32%"
  }
]
```

`forbidSkills` is the important half: a model that invents plausible skills is worse than one that misses real ones, because the user cannot tell.

- [ ] **Step 2: Implement `lib/resume/eval.mjs`**

```js
// Runs the fixture cases against any model id and reports per-case results.
// Not a unit test: it needs a real API key and costs a fraction of a cent.
import { readFileSync } from "node:fs";
import { extractResume } from "./extract.mjs";

export async function runEval({ model } = {}) {
  const cases = JSON.parse(readFileSync(new URL("../../scripts/fixtures/eval-cases.json", import.meta.url), "utf8"));
  const details = [];

  for (const c of cases) {
    const got = await extractResume(c.text, { model });
    if (!got.ok) { details.push({ name: c.name, pass: false, note: `extract failed: ${got.reason}` }); continue; }

    const skills = got.skills.map((s) => s.toLowerCase());
    const missing = (c.expectSkills || []).filter((s) => !skills.includes(s.toLowerCase()));
    const invented = (c.forbidSkills || []).filter((s) => skills.includes(s.toLowerCase()));
    const impact = (got.impact || []).map((i) => i.bullet.toLowerCase()).join(" ");
    const impactMissing = c.expectImpactContains && !impact.includes(c.expectImpactContains.toLowerCase());
    const impactWrong = c.forbidImpactContains && impact.includes(c.forbidImpactContains.toLowerCase());

    const pass = !missing.length && !invented.length && !impactMissing && !impactWrong;
    details.push({ name: c.name, pass, missing, invented, impactMissing: !!impactMissing, impactWrong: !!impactWrong });
  }

  return {
    model: model || "default",
    cases: cases.length,
    passed: details.filter((d) => d.pass).length,
    failed: details.filter((d) => !d.pass).length,
    details,
  };
}
```

- [ ] **Step 3: Implement `scripts/test-resume-eval.mjs`**

```js
// Skips cleanly without a key so it can live in the normal test list, and
// reports rather than asserts a pass rate: this measures the model, not our code.
import { runEval } from "../lib/resume/eval.mjs";

if (!process.env.OPENROUTER_API_KEY) {
  console.log("resume-eval skipped (no OPENROUTER_API_KEY)");
  process.exit(0);
}

const model = process.argv[2];
const out = await runEval({ model });
console.log(`model: ${out.model}  passed ${out.passed}/${out.cases}`);
for (const d of out.details) {
  if (d.pass) { console.log(`  PASS  ${d.name}`); continue; }
  const why = [
    d.missing?.length ? `missed ${d.missing.join(", ")}` : null,
    d.invented?.length ? `INVENTED ${d.invented.join(", ")}` : null,
    d.impactMissing ? "missed the vague bullet" : null,
    d.impactWrong ? "flagged a measured bullet" : null,
    d.note,
  ].filter(Boolean).join("; ");
  console.log(`  FAIL  ${d.name} — ${why}`);
}
// Inventing a skill is the one failure that must break the build: the user
// cannot tell a fabricated skill from a real one.
if (out.details.some((d) => d.invented?.length)) {
  console.error("\nModel invented skills that are not in the resume. Do not ship this model.");
  process.exit(1);
}
console.log("resume-eval ok");
```

- [ ] **Step 4: Run it**

Run: `node scripts/test-resume-eval.mjs`
Expected without a key: `resume-eval skipped`. With a key: a per-case report.

Compare models: `node scripts/test-resume-eval.mjs openai/gpt-5-mini`

- [ ] **Step 5: Register and commit**

Add `"resume-eval:test": "node scripts/test-resume-eval.mjs"`.

```bash
git add lib/resume/eval.mjs scripts/test-resume-eval.mjs scripts/fixtures/eval-cases.json package.json
git commit -m "feat(resume): model evaluation harness"
```

---

## Done when

- `npm run resume-parse:test format-checks:test resume-extract:test resume-score:test resume-store:test ai:test home-spec:test` all pass (run individually; the repo has no aggregate runner).
- A real PDF uploaded at `/jobs/resume` produces a score, the parser view, and findings — all derived, none fabricated.
- A failed scan consumes no quota, verified against `GET /jobs/api/resume/quota`.
- Every promise the copy makes is honoured: deletion works and restores the quota, and no screen claims email, push, Drive import or a help page.
- `/jobs/resume` and `/jobs/matches` are absent from `app/sitemap.js` and still carry `robots: "noindex"`.
- `grep -rn "DEMO_FIT\|fitFor\|demo-resume" app components lib scripts` returns nothing.
- No fit badge appears anywhere on the site.
- `npm run lint` reports no new errors.

## Deliberately not in this plan

Corpus comparison (plan 2, gated on the production index): the "% of postings mention X" figures, `ResumeScanTarget` writes, the `Scored against` dropdown, `C Resume Retarget`, real `/matches` ranking, and real fit badges on `/` and `/search`. Also out of scope entirely: the Pro tier and payments, auto-apply, cover letters, alerts, Drive import, and DOCX support.
