# Direction C — Design System & Re-skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's blue/Inter visual language with Direction C's violet/Instrument Sans "console" language across every screen, and land the OpenRouter AI client that the later feature plans depend on.

**Architecture:** Retokenise the existing `:root` custom-property layer in `app/globals.css` (14 vars, 264 call sites) so most of the app moves at once, then sweep the 178 hardcoded hex values and re-skin components one at a time. Fonts are self-hosted via `next/font`. The AI client is a thin, provider-agnostic wrapper over OpenRouter that degrades explicitly when unkeyed.

**Tech Stack:** Next.js 15 (App Router), plain CSS with custom properties, Tailwind 3 (preflight disabled, utilities only), `next/font/google`, OpenRouter (`deepseek/deepseek-chat`), Node `assert/strict` test scripts.

**Spec:** `Direction C - Console Modern.dc.html` in Claude Design project `446589b8-8815-4932-a60a-7e41f6e8026c`. A local copy of the unwrapped HTML should be kept at `docs/superpowers/specs/direction-c.html` (Task 1, Step 1).

## Global Constraints

- **Do not port `support.js`** — Claude Design canvas runtime, header says `GENERATED … do not edit`.
- **Do not port `ios-frame.jsx`** — iOS device-frame mock marked `@ds-adherence-ignore`. C Mobile's *content* ships responsively; the bezel does not ship.
- **Do not port the dark tab bar** at spec line 24 (`Direction C · Console, modern` + Home/Job/Resume/… buttons) — that is the canvas screen switcher, not product navigation.
- **Tailwind preflight stays disabled.** `tailwind.config.js` sets `corePlugins.preflight: false`; the two resets in `app/tailwind.css` use `:where()` for zero specificity. Read `AGENTS.md` before touching either — a global reset here previously flattened `.jc-save`'s background and broke `.text-white` on the marketing button.
- **Never run `npm run build` while `next dev` is running.** Both write `.next`; the collision surfaces as a misleading `Cannot find module './chunks/…'`. Stop the dev server, `rm -rf .next`, then build.
- **Test convention:** plain `node scripts/test-*.mjs` using `node:assert/strict`, registered in `package.json` scripts. There is no Jest/Vitest and this plan does not add one.
- **AI provider:** OpenRouter, model `deepseek/deepseek-chat`, via `OPENROUTER_API_KEY`. The key arrives later — all AI code must work unkeyed by returning an explicit "not configured" result, never by throwing or silently faking output.
- Exact design values (copy verbatim): accent `#5b4ef0`, accent-hover `#4a3ee0`, accent-tint `#ecebff`, ink `#15171c`, ink-2 `#3d3f4a`, muted `#6b6d78`, faint `#9a9aa4`, surface `#ffffff`, canvas `#f4f4f6`, border `#eaeaef`, success `#e7f6f1`/`#0e6e57`, warning `#fdf4e3`/`#8a5b0a`, danger `#fdeeea`/`#a8341a`, base font-size `13.5px`, pill radius `999px`, card radius `18px`.
- Stated product limits, to be enforced server-side when the feature plans build them: **PDF or DOCX, ≤ 5 MB**; **3 free ATS scans, lifetime, no card**; **auto-apply ≤ 50/week**; **Pro $9/month**.

---

## Scope Note

Direction C spans **six** independent subsystems. This plan covers only the first two:

| Subsystem | Covered here |
|---|---|
| Design system + re-skin | **Yes** |
| AI client foundation (OpenRouter/DeepSeek) | **Yes** (Task 10) |
| Resume ATS scan | No — separate plan |
| Fit matching | No — separate plan |
| Auto-apply | No — separate plan |
| **Remote / timezone eligibility** | No — separate plan |
| Plans, paywall, billing | No — separate plan |

Each needs its own spec and plan. This plan ends with the app wearing Direction C, feature affordances rendered as honest disabled states.

---

## Complete Feature Inventory

Every capability the design introduces, read from the full markup of all eight
screens. Written out because the four feature plans depend on it being complete
— an earlier pass that sampled only extracted strings missed roughly half of
what is below.

### Resume ATS (`C Resume ATS`, spec 195–252)

- **Rendered resume preview** — an 8.5×11 page image with *flagged regions
  highlighted*. Requires PDF rasterisation and mapping each issue back to page
  coordinates. The single largest hidden cost in the whole design.
- **Cohort scoring, not per-job scoring** — "Scored against: Senior Backend
  Engineer · 214 postings", with "Keywords weighted by how often they appear in
  current postings for this title." Scoring runs against an aggregate of live
  postings for a title. `title_stats` and `skill_stats` already exist and are
  the natural basis.
- **Four-dimension score** — Parse, Keywords, Format, Impact, each 0–100 with
  its own bar and colour, plus one headline score in a conic-gradient donut.
- **Fixes checklist** — 5 open items, each with a severity pill (High/Medium/Low),
  an issue, a concrete fix, an estimated impact (`+6`, `+5`, …) and a
  **checkbox**, implying persisted per-fix completion state.
- **Keywords found (9)** and **Missing (4)** with the share of postings
  mentioning each term (`Kubernetes · 71%`).
- Header carries filename, page count, scan timestamp **and duration** ("in 18s"),
  plus "Upload revised" (re-scan) and "View 214 matches →".

### Matching (`C Matches`, spec 253–304)

- Three buckets — **Strong 18 / Good 63 / Low 133** — with **Low collapsed** by
  default and "Show N more" progressive disclosure per bucket.
- Every match carries a **`why` string** explaining it: "Go, PostgreSQL, gRPC ·
  7 yrs matches 6+", "Terraform, AWS, CI/CD · gap: Kubernetes". Human-readable
  justification is part of the product, not a nicety.
- Filters: Remote, Salary listed, **Hide applied** (needs application state).
- **Bulk "Queue all 18"** per bucket, plus per-row "+ Queue" and "Apply".
- Header ties matches to a resume, a title cohort and a refresh time
  ("refreshed 2h ago").

### Auto-apply (`C Auto-apply`, spec 305–349)

- **Batch scheduler** — "Running · next batch 18:00". Applications submit on a
  schedule, not immediately.
- **Rules engine**, 8 settings: target roles (chips, add/remove), minimum fit
  (Strong only | Strong and Good), min salary, daily cap, remote only,
  **tailored cover letter** (AI), **hold when a question is unanswered**, and
  **excluded companies** (chips, including "Current employer").
- **Held-question workflow** — the "hold" rule produces a `Needs input` state:
  *Held: "Are you authorized to work in Brazil?"* with an **Answer** action. A
  real sub-feature, not a status label.
- **Counters** — Queued, Submitted this week, Replies, and **Weekly cap 32/50**.
- **Activity feed** with tabs (All 46 / Needs input 1 / Replied 3), each row
  carrying date, time, role, company, **ATS provenance** (Greenhouse, Lever,
  Ashby, Workday), an event description and a contextual action
  (View / Answer / Open / Remove).
- Four statuses with distinct tokens: Submitted, Queued, Needs input, Replied.

### Remote / timezone eligibility (`C Remote`, spec 373–411)

**Not a listing re-skin.** A distinct product:

- Personalised headline — "41,203 remote roles. **9,412 will hire in India.**"
- **Country selector with UTC offsets** — India UTC+5:30, United States UTC−5
  to −8, United Kingdom UTC+0, Germany UTC+1, Brazil UTC−3.
- **Overlap visualiser** — a 00/06/12/18/24 timeline plotting "Your 09–18 (IST)"
  against "Northwind Labs (US East) 09–18" to show overlapping hours.
- Filters "Eligible for me" and "**≥ 4h overlap**".
- **Hires-in facet** with counts: Worldwide 12,904 · Asia-Pacific 3,311 ·
  EMEA 8,207 · Americas 9,612 · US only 14,873.
- Table columns: Role, Salary, **Overlap**, Posted, Save, Apply.

Data gap: "will hire in India" is **hiring eligibility**, which is not the same
as `address_country` (where the employer sits). Nothing in `jobs` carries it and
the ingestion pipeline does not emit it.

### Plans and paywall (`C Upgrade`, spec 350–372)

- **Free $0** — 3 ATS scans total, roles ranked by fit, saved jobs and weekly
  alerts, no auto-apply.
- **Pro $9/month** — unlimited scans and rescans, matches refreshed daily,
  auto-apply up to 50/week, tailored cover letters, instant alerts.
- Presented as an **interstitial over the resume flow**, not a standalone
  pricing page: it shows the just-uploaded file beside "This scan needs Pro."
  The file is accepted and stored, then the scan is refused.
- Escape hatch "Not now, back to matches"; reassurance "Cancel any time".

### Mobile (`C Mobile`, spec 412–464)

Same three screens at phone width, plus one thing absent from every desktop
screen: a **site footer** — Search jobs, Resume scan, Salaries, Post a job,
About, Privacy, Terms, Opt-out, and the provenance line "© 2026 LeadNear Jobs ·
jobs from career pages and ATS feeds, refreshed nightly". "Post a job" implies an
employer route the app does not have.

---

## Edge-Case Audit

The re-check you asked for. Each item is either handled by a task below or explicitly deferred.

**Chrome and layout**
1. Header is `position:sticky; top:35px` in the spec only to clear the canvas tab bar → must be `top:0`. *(Task 2)*
2. Preview pane is `top:96px` / `max-height:calc(100vh - 116px)` for the same reason → `top:61px` / `calc(100vh - 81px)`. *(Task 5)*
3. Header renders **both** "Log in" *and* an "AM" avatar simultaneously — contradictory. Resolve: signed-out shows Log in only; signed-in shows avatar + scan pips. *(Task 2)*
4. The `N/3 free scans` pips button assumes a signed-in user. Undefined for anonymous → hide when signed out. *(Task 2)*
5. The two-column grid `minmax(300px,2fr) minmax(0,3fr)` has no stated breakpoint; C Mobile is a separate screen. Collapse to single column below 900px. *(Task 8)*

**Data gaps — design shows information we do not store**
6. Preview needs **"What you will do" / "What we look for"** as separate sections. `jobs.description` is one TEXT blob with no structure. Render the blob under a single heading and omit the split until the ingestion pipeline provides structure. *(Task 6 — deliberate reduction)*
7. **Timezone overlap** (`2h`, `25%`, `Any`, `100%`) appears on job cards and drives the whole of C Remote. No column carries it and the ingestion pipeline does not emit it. Omit it from the **card** here; the C Remote screen it belongs to is a separate subsystem, not a column to drop. *(Task 3, Task 7)*
8. **Fit badges** appear on every card, but fit requires a scored resume. Anonymous users and users without a resume have none — a state the design never shows. Render nothing rather than a fake "Low fit". *(Task 3)*
9. **Sort: best fit** requires the matching subsystem. Render the option `disabled` with a title explaining why. *(Task 4)*
10. Design's category list (Software Eng, DevOps/Cloud, Data & AI, Product, Design, Sales, Marketing) must be reconciled against actual `category_slugs` values before the filter is trusted. *(Task 4, Step 1)*

**Formatting**
11. Missing salary renders as **`—`** (Orbital Analytics row), not empty. Verify `fmtSalary` in `lib/format.js`. *(Task 3)*
12. Salary strings vary far more than our formatter may handle: `USD 150–190K`, `EUR 55–70K`, `USD 95+ /hr`, `INR 18–24L`, `SGD 110–140K`, `GBP 60–75K + OTE`. Test against all six. *(Task 3)*
13. Every numeric — counts, salary, scores, dates, IDs — is **IBM Plex Mono**. Missing this breaks the "console" read entirely; it is not decoration. *(Task 1, applied throughout)*
14. Job-card avatars use initials; `initials()` already exists in `lib/format.js` — reuse, do not rewrite. *(Task 3)*
15. "You will be redirected to X on Greenhouse" needs the ATS label; `formatAtsLabel()` exists in `lib/ats.js` — reuse. *(Task 5)*
16. "128,431 roles · updated 12 min ago" maps to `site_metrics.updated_at`, already served by `/api/live-count`. Reuse. *(Task 4)*

**States the design omits entirely**
17. **No empty state** for Home/Remote/Matches. The current app has `.empty-box`; restyle and keep it. *(Task 5)*
18. **No loading state** anywhere, yet the spec itself says a scan takes 18s. Preview fetch needs a skeleton. *(Task 5)*
19. **No error state** — upload failure, parse failure, AI timeout, DB error all unrepresented. Preview fetch failure handled here; the rest belong to the feature plans. *(Task 5)*

**Business rules extracted from the spec's state script**
20. `trialExhausted: used >= 3` is the **only** conditional in the entire design beyond screen routing. Everything else is static mock data.
21. Free scan quota is **lifetime** ("3 ATS scans total"), not periodic.
22. The paywall fires **after** upload — the Upgrade screen shows "arjun-mehta-resume-v2.pdf · uploaded just now" beside "This scan needs Pro." So the file is accepted and stored, then the scan is refused. That has storage-cost implications for non-paying users. *(Deferred — feature plan)*
23. Four application statuses (`Submitted`, `Queued`, `Needs input`, `Replied`) and three issue severities (`High`, `Medium`, `Low`) each carry distinct token pairs — captured in Task 1 so the feature plans inherit them.

**Brand**
24. `assets/leadnear-logo.svg` is blue `#0D6EFD`, clashing with violet `#5b4ef0`. Open question — Task 2 keeps the existing asset until you decide.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/globals.css` *(modify)* | Token layer + all component CSS. Single source of colour/type/radius. |
| `app/fonts.js` *(create)* | `next/font` declarations for Instrument Sans + IBM Plex Mono; exports CSS-variable class names. |
| `app/layout.jsx` *(modify)* | Applies font variables to `<html>`. |
| `tailwind.config.js` *(modify)* | Mirrors tokens so Tailwind-styled ported pages resolve to the same palette. |
| `components/SiteNavbar.jsx` *(modify)* | Header: logo, inline search, nav, scan pips, auth state. |
| `components/JobCard.jsx` *(modify)* | List row: initials, title, company·location, posted, salary, fit slot. |
| `components/Filters.jsx` *(modify)* | Filter pills + sort control. |
| `components/JobPreview.jsx` *(create)* | Right-hand preview pane; client component owning selection. |
| `app/page.jsx` *(modify)* | Two-column listing + preview layout. |
| `app/[slug]/page.jsx` *(modify)* | Full job detail re-skin. |
| `lib/ai/openrouter.mjs` *(create)* | OpenRouter chat client; `isAiConfigured()` + `chat()`. |
| `scripts/test-design-tokens.mjs` *(create)* | Asserts token values and absence of legacy palette. |
| `scripts/test-format.mjs` *(create)* | Asserts salary/date/initials formatting incl. the six salary shapes. |
| `scripts/test-openrouter.mjs` *(create)* | Asserts unkeyed degradation and request shape. |

---

## Task 1: Design tokens and fonts

**Files:**
- Create: `docs/superpowers/specs/direction-c.html`, `app/fonts.js`, `scripts/test-design-tokens.mjs`
- Modify: `app/globals.css` (`:root`, lines 4–20), `app/layout.jsx`, `tailwind.config.js`, `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties `--accent`, `--accent-hover`, `--accent-tint`, `--text`, `--text2`, `--text3`, `--text4`, `--bg`, `--bg2`, `--border`, `--ok-bg`, `--ok-fg`, `--warn-bg`, `--warn-fg`, `--bad-bg`, `--bad-fg`, `--radius`, `--radius-pill`, `--font-sans`, `--font-mono`. Every later task styles exclusively through these.

- [ ] **Step 1: Confirm the spec is present**

Already materialised at `docs/superpowers/specs/direction-c.html` (557 lines,
8 screens) — an earlier draft told you to copy it from a session-scoped
`/private/tmp` path, which does not exist for you.

```bash
wc -l docs/superpowers/specs/direction-c.html          # 557
grep -c 'data-screen-label' docs/superpowers/specs/direction-c.html   # 8
```

Read lines 10–22 (`<helmet>`) for the base styles, and 466–555 (the state
script) for the design's data model and business rules. **Ignore** the dark bar
at line 24 and anything under `data-screen-label="C Mobile"`'s device frame —
both are canvas scaffolding, per Global Constraints.

- [ ] **Step 2: Write the failing token test**

Create `scripts/test-design-tokens.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));

const expected = {
  "--accent": "#5b4ef0",
  "--accent-hover": "#4a3ee0",
  "--accent-tint": "#ecebff",
  "--text": "#15171c",
  "--text2": "#3d3f4a",
  "--text3": "#6b6d78",
  "--text4": "#9a9aa4",
  "--bg": "#ffffff",
  "--bg2": "#f4f4f6",
  "--border": "#eaeaef",
  "--ok-bg": "#e7f6f1",
  "--ok-fg": "#0e6e57",
  "--warn-bg": "#fdf4e3",
  "--warn-fg": "#8a5b0a",
  "--bad-bg": "#fdeeea",
  "--bad-fg": "#a8341a",
  "--radius-pill": "999px",
};

for (const [name, value] of Object.entries(expected)) {
  const found = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(root);
  assert.ok(found, `missing token ${name}`);
  assert.equal(found[1].trim().toLowerCase(), value, `${name} should be ${value}`);
}

// The legacy palette must be gone from the whole stylesheet, not just :root —
// a half-migrated sweep is the likeliest failure mode here.
for (const legacy of ["#1d4ed8", "#2563eb", "#0f172a", "#eff6ff", "#020617"]) {
  assert.ok(!css.toLowerCase().includes(legacy), `legacy colour ${legacy} still present`);
}

console.log("design tokens ok");
```

- [ ] **Step 3: Register and run it to verify it fails**

Add to `package.json` scripts: `"design-tokens:test": "node scripts/test-design-tokens.mjs"`

Run: `npm run design-tokens:test`
Expected: FAIL — `--accent should be #5b4ef0`

- [ ] **Step 4: Replace the token block**

In `app/globals.css`, replace the `:root` block (currently lines 4–20):

```css
:root {
  --bg:           #ffffff;
  --bg2:          #f4f4f6;
  --bg3:          #f0f0f3;
  --border:       #eaeaef;
  --text:         #15171c;
  --text2:        #3d3f4a;
  --text3:        #6b6d78;
  --text4:        #9a9aa4;
  --accent:       #5b4ef0;
  --accent-hover: #4a3ee0;
  --accent-tint:  #ecebff;
  --ok-bg:        #e7f6f1;
  --ok-fg:        #0e6e57;
  --warn-bg:      #fdf4e3;
  --warn-fg:      #8a5b0a;
  --bad-bg:       #fdeeea;
  --bad-fg:       #a8341a;
  --radius:       18px;
  --radius-sm:    10px;
  --radius-pill:  999px;
  --shadow:       0 1px 3px rgba(21,23,28,.06), 0 0 0 1px rgba(21,23,28,.05);
  --shadow-ring:  0 4px 16px rgba(21,23,28,.09), 0 0 0 1px rgba(91,78,240,.22);
}
```

- [ ] **Step 5: Sweep the legacy hex values**

```bash
grep -n -iE '#1d4ed8|#2563eb|#0f172a|#eff6ff|#020617|#e2e8f0|#64748b|#94a3b8|#334155|#f8fafc' app/globals.css
```

Replace each with the token that matches its role (`#1d4ed8`→`var(--accent)`, `#0f172a`→`var(--text)`, `#64748b`→`var(--text3)`, `#e2e8f0`→`var(--border)`, `#f8fafc`→`var(--bg2)`, and so on). Work through every hit; the test in Step 2 fails until the five listed legacy values are gone.

- [ ] **Step 6: Run the token test to verify it passes**

Run: `npm run design-tokens:test`
Expected: PASS — `design tokens ok`

- [ ] **Step 7: Add the fonts**

Create `app/fonts.js`:

```js
// Self-hosted via next/font rather than the spec's <link> to Google Fonts:
// that link is render-blocking and ships layout shift. next/font inlines the
// @font-face and preloads the files from our own origin.
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";

export const sans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// Carries every metric, score, count and date in this design. Not decorative.
export const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});
```

- [ ] **Step 8: Apply the fonts and base type scale**

In `app/layout.jsx`, import `{ sans, mono }` from `@/app/fonts` and put both variables on `<html>`:

```jsx
<html lang="en" className={`${sans.variable} ${mono.variable}`}>
```

In `app/globals.css`, set the base:

```css
body {
  font-family: var(--font-sans), system-ui, sans-serif;
  font-size: 13.5px;        /* Direction C base — denser than the old ~15px */
  line-height: 1.5;
  color: var(--text);
  background: var(--bg2);
  -webkit-font-smoothing: antialiased;
}
.mono { font-family: var(--font-mono), ui-monospace, monospace; }
```

- [ ] **Step 9: Mirror tokens into Tailwind**

In `tailwind.config.js`, under `theme.extend`, so the Tailwind-styled ported pages resolve to one palette:

```js
colors: {
  accent: { DEFAULT: "#5b4ef0", hover: "#4a3ee0", tint: "#ecebff" },
  ink:    { DEFAULT: "#15171c", 2: "#3d3f4a", 3: "#6b6d78", 4: "#9a9aa4" },
  canvas: "#f4f4f6",
  hairline: "#eaeaef",
},
fontFamily: {
  sans: ["var(--font-sans)", "system-ui", "sans-serif"],
  mono: ["var(--font-mono)", "ui-monospace", "monospace"],
},
borderRadius: { pill: "999px" },
```

Do **not** touch `corePlugins.preflight` or the `:where()` resets in `app/tailwind.css`.

- [ ] **Step 10: Verify the build and commit**

```bash
rm -rf .next && npm run build
npm run design-tokens:test
git add app/globals.css app/fonts.js app/layout.jsx tailwind.config.js package.json scripts/test-design-tokens.mjs docs/superpowers/
git commit -m "feat(design): adopt Direction C tokens and typefaces

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Header

**Files:**
- Modify: `components/SiteNavbar.jsx`, `app/globals.css`

**Interfaces:**
- Consumes: tokens from Task 1; `useSession()` from `next-auth/react` (already wired — `components/SessionProvider.jsx` sets `basePath`).
- Produces: `.site-header` markup contract used by Task 5's sticky offset (header height **61px**).

Spec: lines 37–59. Structure: logo + wordmark → inline search (title/skill + location + Search) → nav (Remote, Companies, Salaries, Matches, Auto-apply) → scan pips → auth.

- [ ] **Step 1: Resolve the contradictory auth state**

The spec renders "Log in" *and* an avatar together, which cannot both be right. Implement:

```jsx
{status === "loading"  && <span className="auth-nav-placeholder" aria-hidden="true" />}
{status === "unauthenticated" && <Link href="/signin" className="nav-login">Log in</Link>}
{status === "authenticated" && (
  <>
    <Link href="/resume" className="scan-pips">
      <span className="pips" aria-hidden="true">
        {[0, 1, 2].map(i => <span key={i} className={i < scansUsed ? "pip used" : "pip"} />)}
      </span>
      {3 - scansUsed}/3 free scans
    </Link>
    <span className="avatar" title={session.user.email}>{initials(session.user.name || session.user.email)}</span>
  </>
)}
```

Reuse `initials` from `lib/format.js` — do not write another. Scan pips are hidden when signed out (edge case 4); until the Resume feature plan lands, `scansUsed` is `0`.

- [ ] **Step 2: Set the sticky offset correctly**

The spec's `top:35px` exists only to clear the canvas tab bar, which we are not shipping.

```css
.site-header {
  position: sticky; top: 0; z-index: 150;
  background: rgba(244,244,246,.86);
  backdrop-filter: blur(12px);
}
.site-header .inner { max-width: 1440px; margin: 0 auto; padding: 12px 24px;
  display: flex; align-items: center; gap: 14px; white-space: nowrap; }
```

- [ ] **Step 3: Style search, nav, pips and avatar**

```css
.header-search { flex: 1 1 240px; min-width: 180px; max-width: 520px;
  display: flex; align-items: center; gap: 8px; height: 38px;
  background: var(--bg); border-radius: var(--radius-pill); padding: 0 6px 0 14px;
  box-shadow: 0 1px 2px rgba(21,23,28,.06), 0 0 0 1px rgba(21,23,28,.05); }
.header-search input { flex: 1; min-width: 0; border: 0; background: transparent;
  font: inherit; font-size: 13.5px; outline: none; color: var(--text); }
.header-search button { border: 0; background: var(--text); color: #fff;
  border-radius: var(--radius-pill); height: 28px; padding: 0 14px;
  font-weight: 600; font-size: 12.5px; cursor: pointer; }
.header-search button:hover { background: var(--accent); }
.site-header nav a { padding: 7px 10px; color: #5c5e69; font-weight: 500; border-radius: 8px; }
.site-header nav a:hover { background: var(--border); color: var(--text); }
.scan-pips { display: inline-flex; align-items: center; gap: 7px; border: 0;
  background: var(--accent-tint); color: var(--accent-hover);
  border-radius: var(--radius-pill); padding: 7px 12px;
  font-size: 12.5px; font-weight: 600; }
.pips { display: inline-flex; gap: 3px; }
.pip { width: 6px; height: 6px; border-radius: var(--radius-pill); background: #c3bffa; }
.pip.used { background: var(--accent); }
.avatar { width: 30px; height: 30px; border-radius: var(--radius-pill);
  background: var(--text); color: #fff; display: inline-flex;
  align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
```

- [ ] **Step 4: Verify against a running server**

```bash
npm run dev            # :4100
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4100/jobs
```

Then in the browser: header is flush to the top (no 35px gap), signed out shows "Log in" with **no** pips and **no** avatar, and the mono/violet language is visible.

- [ ] **Step 5: Commit**

```bash
git add components/SiteNavbar.jsx app/globals.css
git commit -m "feat(design): re-skin header, resolve signed-in/out states

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Job card

**Files:**
- Modify: `components/JobCard.jsx`, `app/globals.css`
- Create: `scripts/test-format.mjs`

**Interfaces:**
- Consumes: `fmtSalary`, `fmtDate`, `initials` from `lib/format.js`; tokens from Task 1.
- Produces: `<JobCard job={job} selected={bool} onSelect={fn} />` — Task 5 drives selection through these two new props.

- [ ] **Step 1: Write the failing formatter test**

Verified current behaviour before writing expectations — `fmtSalary` returns
`"USD 150K–190K/yr"` and `"USD 95+/hr"` today, and `initials()` returns `"QU"`
for Quarry and `"JB"` for empty input.

Two consequences worth stating, because they are easy to get wrong:

- **Do not change `initials()`.** The spec's fixtures use hand-authored initials
  (`QR` for "Quarry", which no rule derives), and its `"JB"` empty-case fallback
  is deliberate. It already returns `NL` for "Northwind Labs", which is all the
  card needs.
- **Do not make `fmtSalary` return `"—"`.** It returns `null` for "no salary",
  and other callers rely on that to omit the element. The em-dash is a
  *presentation* choice and belongs in the card (Step 5).

Create `scripts/test-format.mjs`:

```js
import assert from "node:assert/strict";
import { fmtSalary, initials } from "../lib/format.js";

// Absent salary stays null — the em-dash is applied by the card, not here,
// because other callers depend on null to omit the field entirely.
assert.equal(fmtSalary({ salary_min: null, salary_max: null }), null);

// Shapes taken verbatim from the spec's job fixtures. The design abbreviates
// once at the end of a range and drops the unit for annual pay.
assert.equal(
  fmtSalary({ salary_min: 150000, salary_max: 190000, salary_currency: "USD", salary_period: "year" }),
  "USD 150–190K"
);
assert.equal(
  fmtSalary({ salary_min: 120000, salary_max: 145000, salary_currency: "EUR", salary_period: "year" }),
  "EUR 120–145K"
);
// Non-annual pay keeps its unit, spaced as the spec shows it.
assert.equal(
  fmtSalary({ salary_min: 95, salary_max: null, salary_currency: "USD", salary_period: "hour" }),
  "USD 95+ /hr"
);

// Unchanged behaviour, asserted so a later edit cannot quietly regress it.
assert.equal(initials("Northwind Labs"), "NL");
assert.equal(initials(""), "JB");

console.log("format ok");
```

- [ ] **Step 2: Register and run it to verify it fails**

Add to `package.json`: `"format:test": "node scripts/test-format.mjs"`

Run: `npm run format:test`
Expected: FAIL — `'USD 150K–190K/yr' !== 'USD 150–190K'`

If node warns `MODULE_TYPELESS_PACKAGE_JSON`, ignore it: `lib/format.js` is ESM
in a package without `"type": "module"`. It parses correctly; adding that field
would change how every other `.js` file in the project is interpreted.

- [ ] **Step 3: Make `fmtSalary` match the design**

Edit `lib/format.js` so that, for a range, only the upper bound carries the `K`
(`USD 150–190K`, not `USD 150K–190K`); annual pay emits **no** unit suffix while
`/mo` and `/hr` keep theirs preceded by a space (`USD 95+ /hr`); the separator is
an en-dash `–` (U+2013); and the `null` return for absent salary is preserved.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run format:test`
Expected: PASS — `format ok`

- [ ] **Step 5: Re-skin the card**

Per spec lines 89–101. Two rows: header (initials avatar 32px/`--radius-sm`, title 14.5px/600, `company · location` in `--text3`, posted date right-aligned in mono/`--text4`) and footer (salary in mono/`--text2`, fit badge right, indented `padding-left:43px` to clear the avatar).

```css
.job-card { background: var(--bg); border-radius: 14px; padding: 13px 16px;
  cursor: pointer; box-shadow: var(--shadow); }
.job-card:hover { box-shadow: var(--shadow-ring); transform: translateY(-1px); }
.job-card.selected, .job-card.strong { box-shadow: 0 1px 2px rgba(21,23,28,.05), 0 0 0 1px rgba(91,78,240,.22); }
.job-card .jc-avatar { width: 32px; height: 32px; border-radius: var(--radius-sm);
  background: var(--border); color: #4b4d58; display: inline-flex;
  align-items: center; justify-content: center; font-size: 11px; font-weight: 600; }
.job-card .jc-posted, .job-card .jc-salary { font-family: var(--font-mono), monospace; }
.job-card .jc-posted { font-size: 11px; color: var(--text4); }
.job-card .jc-salary { font-size: 12px; color: var(--text2); }
.fit-badge { font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: var(--radius-pill); }
.fit-badge.strong { background: var(--accent-tint); color: var(--accent-hover); }
.fit-badge.good   { background: var(--bg2); color: var(--text3); }
.fit-badge.low    { background: transparent; color: var(--text4); }
```

- [ ] **Step 6: Render the salary em-dash and the fit badge honestly**

`fmtSalary` returns `null` for absent salary; the design renders `—` (the
Orbital Analytics row). Apply that here, at the presentation layer:

```jsx
<span className="jc-salary">{fmtSalary(job) ?? "—"}</span>
```

Fit requires a scored resume, which does not exist yet (edge case 8):

```jsx
{/* No resume scored yet -> no fit is known. Render nothing rather than a
    misleading "Low fit", which would read as a judgement of the job. */}
{job.fit ? <span className={`fit-badge ${job.fit}`}>{FIT_LABEL[job.fit]}</span> : null}
```

- [ ] **Step 7: Verify and commit**

```bash
npm run format:test
curl -s http://localhost:4100/jobs | grep -c 'job-card'   # expect 20
git add components/JobCard.jsx lib/format.js app/globals.css scripts/test-format.mjs package.json
git commit -m "feat(design): re-skin job card, correct salary formatting

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Filter bar and sort

**Files:**
- Modify: `components/Filters.jsx`, `app/globals.css`

**Interfaces:**
- Consumes: tokens; `/api/live-count` (already exists — `app/api/live-count/route.js`).
- Produces: unchanged query-param contract (`q, location, remote, type, salary_min, category, days, page`), plus a new `sort` param accepting `newest | salary`.

- [ ] **Step 1: Reconcile the category list against real data**

The spec lists seven categories. Confirm they exist before wiring the filter:

```bash
node --input-type=module -e '
import path from "node:path"; import pg from "pg";
import { loadEnvFile } from "./lib/load-env.mjs";
import { buildPgConfig } from "./lib/pg-config.mjs";
loadEnvFile(path.join(process.cwd(), ".env.local"));
const p = new pg.Pool(buildPgConfig({ max: 2 }));
const r = await p.query("select slug, job_count from categories_or_stats_view limit 0");
await p.end();' 2>/dev/null || \
grep -n 'category' lib/jobs.js | head
```

Map each design label to an existing `category_slugs` value. Where no match exists, drop the option rather than shipping a filter that returns nothing.

- [ ] **Step 2: Re-skin the bar**

Count line first (`128,431` in mono + `· updated 12 min ago` from `site_metrics.updated_at`), then the Remote toggle, four selects, a flex spacer, and the sort control right-aligned.

```css
.filter-bar { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 14px; }
.filter-count { font-size: 12.5px; color: var(--text3); margin-right: 4px; }
.filter-count b { color: var(--text); font-family: var(--font-mono), monospace; font-weight: 500; }
.filter-select { background: var(--bg); border: 0; box-shadow: 0 0 0 1px rgba(21,23,28,.07);
  border-radius: var(--radius-pill); padding: 7px 12px; font-size: 12.5px;
  font-weight: 500; cursor: pointer; color: var(--text2); }
.filter-toggle { background: var(--bg); border: 0; box-shadow: 0 0 0 1px rgba(21,23,28,.07);
  border-radius: var(--radius-pill); padding: 7px 13px; font-size: 12.5px;
  font-weight: 600; cursor: pointer; color: var(--text2); }
.filter-toggle[aria-pressed="true"] { background: var(--text); color: #fff; box-shadow: none; }
.sort-select { background: transparent; border: 0; padding: 7px 4px;
  font-size: 12.5px; font-weight: 600; cursor: pointer; color: var(--text2); }
```

- [ ] **Step 3: Disable "best fit" honestly**

```jsx
<select className="sort-select" name="sort" defaultValue={sp.sort || "newest"}>
  <option value="newest">Sort: newest</option>
  <option value="salary">Sort: salary</option>
  {/* Requires the matching subsystem; shipping it enabled would silently
      fall back to another order and look like a bug. */}
  <option value="fit" disabled title="Available once you scan a resume">Sort: best fit</option>
</select>
```

- [ ] **Step 4: Verify and commit**

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:4100/jobs?remote=1&type=Full-time'
git add components/Filters.jsx app/globals.css
git commit -m "feat(design): re-skin filter bar, gate best-fit sort

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Split-pane listing with preview

The largest task — a genuinely new interaction, not a restyle.

**Files:**
- Create: `components/JobPreview.jsx`, `app/api/jobs/preview/route.js`
- Modify: `app/page.jsx`, `app/globals.css`

**Interfaces:**
- Consumes: `JobCard` (Task 3) with `selected`/`onSelect`; `getJob` from `lib/jobs.js`; `formatAtsLabel` from `lib/ats.js`.
- Produces: `GET /jobs/api/jobs/preview?slug=<job_slug>` → `{ job: { title, company, company_slug, location, employment_type, salary, description, source, job_slug } }`, `404` when absent.

- [ ] **Step 1: Add the preview endpoint**

Create `app/api/jobs/preview/route.js`, following the existing `app/api/live-count/route.js` shape:

```js
import { getJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) return Response.json({ error: "slug required" }, { status: 400 });

  try {
    const job = await getJob(slug);
    if (!job) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ job });
  } catch (error) {
    console.error("Preview lookup failed", error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
```

- [ ] **Step 2: Verify the endpoint before building UI on it**

```bash
SLUG=$(curl -s http://localhost:4100/jobs | grep -oE '/jobs/[a-z0-9-]+-[0-9]+' | head -1 | sed 's|/jobs/||')
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:4100/jobs/api/jobs/preview?slug=$SLUG"   # 200
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:4100/jobs/api/jobs/preview?slug=nope"    # 404
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:4100/jobs/api/jobs/preview"              # 400
```

- [ ] **Step 3: Build the preview pane with all three states**

Create `components/JobPreview.jsx` (client component). The design shows only the loaded state; loading, empty and error are ours to add (edge cases 17–19).

```jsx
"use client";
import { useEffect, useState } from "react";
import { formatAtsLabel } from "@/lib/ats";

export default function JobPreview({ slug }) {
  const [state, setState] = useState({ status: "empty" });

  useEffect(() => {
    if (!slug) return setState({ status: "empty" });
    let live = true;
    setState({ status: "loading" });
    fetch(`/jobs/api/jobs/preview?slug=${encodeURIComponent(slug)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => live && setState({ status: "ready", job: d.job }))
      .catch(() => live && setState({ status: "error" }));
    return () => { live = false; };
  }, [slug]);

  if (state.status === "empty")
    return <aside className="job-preview is-empty"><p>Select a role to preview it here.</p></aside>;
  if (state.status === "loading")
    return <aside className="job-preview is-loading" aria-busy="true"><div className="skeleton" /></aside>;
  if (state.status === "error")
    return <aside className="job-preview is-error"><p>Could not load this role. Open the full page instead.</p></aside>;

  const { job } = state;
  return (
    <aside className="job-preview">
      {/* … header, meta pills, description … */}
      <footer>
        <span>You will be redirected to {job.company} on {formatAtsLabel(job.source)}.</span>
        <a href={`/${job.job_slug}`}>Open full page →</a>
      </footer>
    </aside>
  );
}
```

- [ ] **Step 4: Style the pane with the corrected sticky offset**

The spec's `top:96px` assumes the 35px canvas bar we are not shipping (edge
case 2). The replacement is the real header height — **measure it, don't trust
the 61px below**, since padding and the 38px search field can shift it by a
pixel or two and the symptom is a preview that hides under the header on scroll:

```js
// browser console on /jobs
document.querySelector('.site-header').getBoundingClientRect().height
```

Use that value for `top` and `100vh - (value + 20)` for `max-height`.

```css
.jobs-layout { display: grid; grid-template-columns: minmax(300px,2fr) minmax(0,3fr);
  gap: 16px; align-items: start; }
.job-preview { background: var(--bg); border-radius: var(--radius);
  box-shadow: var(--shadow); position: sticky; top: 61px;
  max-height: calc(100vh - 81px); overflow: auto; }
.job-preview.is-empty, .job-preview.is-error { padding: 32px 24px; color: var(--text3); }
.job-preview .skeleton { height: 320px; margin: 22px 24px;
  border-radius: 14px; background: linear-gradient(90deg,#f0f0f3,#f7f7f9,#f0f0f3);
  background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }
```

- [ ] **Step 5: Wire selection in the listing**

`app/page.jsx` is a server component. Extract the list + preview into a small client component holding `selectedSlug` (defaulting to the first result), pass `selected`/`onSelect` into each `JobCard`, and keep the server-side data fetch exactly as it is.

- [ ] **Step 6: Verify all four states by hand**

With `npm run dev` running: the first row is selected on load; clicking another row swaps the pane; a slow network shows the skeleton; and the empty state appears when a search returns nothing.

- [ ] **Step 7: Commit**

```bash
rm -rf .next && npm run build
git add app/page.jsx components/JobPreview.jsx app/api/jobs/preview/route.js app/globals.css
git commit -m "feat(design): split-pane listing with job preview

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Job detail page

**Files:**
- Modify: `app/[slug]/page.jsx`, `app/globals.css`

**Interfaces:**
- Consumes: tokens; `getJob`; `formatAtsLabel`; the JSON-LD builder in `lib/job-jsonld.js`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Re-skin per spec lines 136–194**

Title 23px/600 with `-.025em` tracking, company link in `--text`, meta pills (`Full-time`, salary in mono) on `--bg2` pills, Save + Apply buttons, description body at 14px/1.65 in `--text2`, section headings 12px uppercase `.06em` in `--text4`.

- [ ] **Step 2: Render the description honestly**

The design splits "What you will do" from "What we look for", but `jobs.description` is a single unstructured TEXT blob (edge case 6):

```jsx
{/* The design shows two structured sections. Our column holds one blob with
    no reliable delimiter, and inventing a split would mislabel content.
    Render it whole under one heading until the ingestion pipeline emits
    structure. */}
<h2 className="section-label">About this role</h2>
<div className="job-body" dangerouslySetInnerHTML={{ __html: sanitized }} />
```

Keep whatever sanitisation the file already applies — do not loosen it.

- [ ] **Step 3: Leave the fit banner out**

The spec's violet fit banner needs a scored resume, matched/missing skills and a per-posting ATS score — none of which exist. Do not stub it with fabricated numbers; the Resume plan adds it.

- [ ] **Step 4: Verify JSON-LD survived the re-skin**

```bash
curl -s "http://localhost:4100/jobs/$SLUG" | grep -o '"@type":"JobPosting"'
curl -s "http://localhost:4100/jobs/$SLUG" | grep -oE '"(addressLocality|postalCode)":"(N/A|null)?"' || echo "  no empty address fields — correct"
```

`AGENTS.md` forbids emitting empty, `null` or guessed address fields.

- [ ] **Step 5: Commit**

```bash
git add 'app/[slug]/page.jsx' app/globals.css
git commit -m "feat(design): re-skin job detail page

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Remote page — typographic re-skin only

**Files:**
- Modify: `app/remote/page.jsx`, `app/globals.css`

**Scope correction.** An earlier draft of this plan treated C Remote as a
listing re-skin and said to "omit the overlap column". That was wrong, and
reading the full markup showed why: the screen is a **timezone-eligibility
product** — country selector with UTC offsets, an hour-by-hour overlap
visualiser, an "Eligible for me" filter, a "≥ 4h overlap" threshold, and a
hires-in facet with counts. Stripping the overlap does not simplify that screen,
it removes its reason to exist.

So this task deliberately does **not** attempt C Remote. It applies the new
tokens and type to the existing remote listing so it stops looking like the old
design, and nothing more. The real screen belongs to the *Remote / timezone
eligibility* plan, which must first resolve the data gap: "will hire in India"
is hiring eligibility, and `address_country` records where the employer sits —
they are not the same field, and neither `jobs` nor the ingestion pipeline
carries the former.

- [ ] **Step 1: Apply tokens to the existing page**

Reuse the Task 3 card and Task 4 filter bar. No new columns, no visualiser, no
country selector. The page keeps exactly today's information.

- [ ] **Step 2: Verify and commit**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4100/jobs/remote   # 200
git add app/remote/page.jsx app/globals.css
git commit -m "style(design): apply Direction C tokens to remote listing

The full C Remote screen (timezone eligibility) is a separate subsystem;
this only restyles what already exists.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Responsive behaviour

**Files:**
- Modify: `app/globals.css`

The spec's C Mobile is a separate screen inside a device frame; we ship one responsive layout instead (Global Constraints).

- [ ] **Step 1: Collapse the split pane below 900px**

```css
@media (max-width: 900px) {
  .jobs-layout { grid-template-columns: minmax(0, 1fr); }
  /* Below this width the preview stops being a companion pane; the card links
     navigate to the full page instead. */
  .job-preview { display: none; }
}
```

- [ ] **Step 2: Make the header wrap**

```css
@media (max-width: 860px) {
  .site-header .inner { flex-wrap: wrap; gap: 10px; }
  .site-header nav { order: 3; width: 100%; overflow-x: auto; }
  .header-search { order: 2; flex: 1 1 100%; max-width: none; }
}
```

- [ ] **Step 3: Verify at three widths**

375px, 768px and 1280px: no horizontal scroll, header readable, cards full-width, preview hidden below 900px.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(design): responsive layout for the console redesign

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Marketing and static pages

**Files:**
- Modify: `app/home/page.jsx`, `components/marketing/LeadNearJobsHome.jsx`, `app/about/page.jsx`, `app/services/page.jsx`, `app/signin/page.jsx`, `app/register/page.jsx`, `app/globals.css`

These use Tailwind utilities rather than the CSS layer, so they move via the Task 1 `tailwind.config.js` token mirror plus a class sweep.

- [ ] **Step 1: Sweep the Tailwind colour classes**

```bash
grep -rn 'blue-700\|blue-800\|indigo-600\|slate-950\|blue-50' components/marketing/ app/home/ app/about/ app/services/ | wc -l
```

Replace `blue-700`/`indigo-600` with `accent`/`accent-hover`, `slate-950` with `ink`, `blue-50` with `accent-tint`.

- [ ] **Step 2: Keep the two `:where()` resets intact**

Re-read `app/tailwind.css` before editing. The `.marketing-page` reset and the universal border reset both rely on zero specificity; raising it clobbers `text-white`/`text-base` on the hero button. `AGENTS.md` documents the failure.

- [ ] **Step 3: Verify every route still renders**

```bash
for p in "" /home /about /services /privacy-policy /toc /contact-us /opt-out /signin /register /companies /remote /search?q=engineer; do
  printf "  %s  /jobs%s\n" "$(curl -s -o /dev/null -w '%{http_code}' -m 60 "http://localhost:4100/jobs$p")" "$p"
done
```

All 200.

- [ ] **Step 4: Confirm the marketing gradient still paints**

The hero's `bg-clip-text text-transparent` headline depends on `@tailwind base` emitting `--tw-*` defaults; without it the text renders invisible. In the browser console:

```js
getComputedStyle(document.querySelector('h1 span.bg-clip-text')).backgroundImage
// must be a linear-gradient(...), never "none"
```

- [ ] **Step 5: Re-skin the footer and reconcile its links**

The site footer appears only on `C Mobile` (spec 412–464) but applies to every
page. It is flatter than the one in `app/layout.jsx` today — a single link row
plus a provenance line:

> Search jobs · Resume scan · Salaries · Post a job · About · Privacy · Terms · Opt-out
> © 2026 LeadNear Jobs · jobs from career pages and ATS feeds, refreshed nightly

Two of those have no destination yet. Point **Resume scan** at `/resume` only
once that route exists (Resume plan) — until then omit the link rather than ship
a 404. **Post a job** implies an employer route the app does not have; point it
at `/contact-us?subject=Post%20a%20Job`, which already exists and already
handles that enquiry.

Keep the provenance line verbatim: it is a factual claim about where the data
comes from, and the ingestion cadence ("refreshed nightly") should be corrected
rather than dropped if it stops being true.

- [ ] **Step 6: Verify and commit**

```bash
rm -rf .next && npm run build
curl -s http://localhost:4100/jobs | grep -c 'site-footer'   # expect 1
git add app/ components/
git commit -m "feat(design): extend Direction C to marketing, static pages and footer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: OpenRouter AI client

Foundation for the Resume/Matching/Cover-letter plans. Built now because it is small, fully testable without a key, and unblocks the feature specs.

**Files:**
- Create: `lib/ai/openrouter.mjs`, `scripts/test-openrouter.mjs`
- Modify: `.env.example`, `package.json`

**Interfaces:**
- Produces: `isAiConfigured(): boolean` and `chat({ system, user, model?, maxTokens?, signal? }): Promise<{ ok: true, text: string } | { ok: false, reason: "unconfigured" | "http" | "network", detail?: string }>`. The feature plans consume exactly this — it never throws and never fabricates.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-openrouter.mjs`:

```js
import assert from "node:assert/strict";

delete process.env.OPENROUTER_API_KEY;
const { isAiConfigured, chat } = await import("../lib/ai/openrouter.mjs");

// Unkeyed must degrade explicitly, never throw and never invent an answer.
assert.equal(isAiConfigured(), false);
const off = await chat({ system: "s", user: "u" });
assert.deepEqual(off, { ok: false, reason: "unconfigured" });

// With a key, it must POST to OpenRouter with the DeepSeek model.
process.env.OPENROUTER_API_KEY = "test-key";
const seen = {};
globalThis.fetch = async (url, init) => {
  seen.url = url; seen.init = init;
  return { ok: true, json: async () => ({ choices: [{ message: { content: "hello" } }] }) };
};
const mod = await import(`../lib/ai/openrouter.mjs?v=${Date.now()}`);
const on = await mod.chat({ system: "s", user: "u" });

assert.equal(on.ok, true);
assert.equal(on.text, "hello");
assert.equal(seen.url, "https://openrouter.ai/api/v1/chat/completions");
assert.equal(seen.init.headers.Authorization, "Bearer test-key");
assert.equal(JSON.parse(seen.init.body).model, "deepseek/deepseek-chat");

// A non-2xx response is reported, not thrown.
globalThis.fetch = async () => ({ ok: false, status: 429, text: async () => "rate limited" });
const mod2 = await import(`../lib/ai/openrouter.mjs?v=${Date.now()}b`);
const err = await mod2.chat({ system: "s", user: "u" });
assert.equal(err.ok, false);
assert.equal(err.reason, "http");

console.log("openrouter ok");
```

- [ ] **Step 2: Register and run it to verify it fails**

Add to `package.json`: `"ai:test": "node scripts/test-openrouter.mjs"`

Run: `npm run ai:test`
Expected: FAIL — `Cannot find module '../lib/ai/openrouter.mjs'`

- [ ] **Step 3: Implement the client**

Create `lib/ai/openrouter.mjs`:

```js
// lib/ai/openrouter.mjs — OpenRouter chat client (DeepSeek by default).
//
// Returns a result object and never throws. Callers are user-facing features
// (resume scanning, fit explanations, cover letters) where an AI outage must
// degrade to a clear message rather than a 500 — and must never degrade to
// invented output, because users act on these results.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "deepseek/deepseek-chat";

export function isAiConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export async function chat({ system, user, model = DEFAULT_MODEL, maxTokens = 1024, signal } = {}) {
  if (!isAiConfigured()) return { ok: false, reason: "unconfigured" };

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // OpenRouter attributes usage with these; harmless when unset.
        "HTTP-Referer": process.env.PUBLIC_BASE_URL || "http://localhost:4100/jobs",
        "X-Title": "LeadNear Jobs",
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("OpenRouter HTTP", response.status, detail.slice(0, 200));
      return { ok: false, reason: "http", detail: String(response.status) };
    }

    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content ?? "";
    return { ok: true, text };
  } catch (error) {
    console.error("OpenRouter request failed", error);
    return { ok: false, reason: "network", detail: error.message };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run ai:test`
Expected: PASS — `openrouter ok`

- [ ] **Step 5: Document the variable**

Append to `.env.example`:

```
# ── AI (OpenRouter, DeepSeek) ────────────────────────────────────────────────
# Unset: every AI feature returns { ok: false, reason: "unconfigured" } and the
# UI shows an explicit "not configured" state. It never fabricates a result.
OPENROUTER_API_KEY=
```

Do **not** add the key to Vercel yet — it does not exist. When it does, add it as a Production secret only.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/openrouter.mjs scripts/test-openrouter.mjs .env.example package.json
git commit -m "feat(ai): OpenRouter/DeepSeek client with explicit unkeyed degradation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verification

Run after the final task:

```bash
# 1. Unit tests
npm run design-tokens:test && npm run format:test && npm run ai:test && npm run job-slug:test

# 2. Clean build — stop `next dev` first, both write .next
rm -rf .next && npm run build

# 3. Every route (dev server on :4100)
for p in "" /home /search?q=engineer /companies /remote /titles /locations /categories \
         /salaries /about /services /privacy-policy /toc /contact-us /opt-out /signin /register; do
  printf "  %s  /jobs%s\n" "$(curl -s -o /dev/null -w '%{http_code}' -m 60 "http://localhost:4100/jobs$p")" "$p"
done
printf "  %s  /jobs/backoffice (expect 401)\n" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4100/jobs/backoffice)"

# 4. Database untouched by a pure front-end change
npm run db:verify
```

**Computed-style spot check.** In the browser console on `/jobs`, confirm the design language actually applied rather than trusting the diff:

```js
const cs = getComputedStyle(document.querySelector('.job-card .jc-salary'));
[cs.fontFamily.includes('IBM Plex Mono'), getComputedStyle(document.body).fontSize]
// -> [true, "13.5px"]
```

This technique caught two real regressions during the Vercel work; prefer it over screenshots, which the preview pane scales unpredictably.

**JSON-LD.** A job detail page must still emit `"@type":"JobPosting"` with no empty, `null` or guessed address fields (`AGENTS.md`).

---

## Self-Review

**Spec coverage.** C Home → Tasks 3–5. C Job → Task 6. C Remote → Task 7. C Mobile → Task 8. Header → Task 2. Tokens/type → Task 1. C Resume ATS, C Matches, C Auto-apply and C Upgrade are explicitly out of scope (Scope Note) and need their own specs and plans; the AI client they all depend on is Task 10.

**Deliberate reductions, each with a reason in the task:** structured job sections (no data), timezone overlap (no data), fit badges and the fit banner (no scoring yet), best-fit sort (disabled, not hidden), the iOS bezel and canvas tab bar (canvas scaffolding, not product).

**Type consistency.** `fmtSalary`/`initials`/`fmtDate` from `lib/format.js` and `formatAtsLabel` from `lib/ats.js` are reused, never redefined. `JobCard` gains `selected`/`onSelect` in Task 3 and Task 5 consumes exactly those. `chat()`'s result shape in Task 10 Step 1 matches Step 3 and is the contract the feature plans consume.

**Open questions for you**

1. **Logo colour** — the mark is `#0D6EFD` blue against a `#5b4ef0` violet system. Recolour, or keep brand blue as a deliberate accent?
2. **Timezone overlap** — drop permanently, or add to the ingestion pipeline so C Remote can show it?
3. **Structured job sections** — is splitting "What you will do" / "What we look for" something the JSONL feed could carry? It materially improves both the preview and future ATS scoring.
