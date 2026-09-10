# Direction C Home — Pixel-Perfect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `/` — the job board at `app/page.jsx` — to a pixel-for-pixel match with the design's `C Home` screen, building the ATS-dependent affordances as frontend-only static demo values.

**Architecture:** Surgical correction, not a rebuild. The component tree from the earlier Direction C plan already matches the mock structurally, so each task closes one measured divergence in place. Everything fabricated lives in a single new module, `lib/demo-fit.js`, behind one environment switch; the hero and the pagination row are written fresh because they are replacements rather than edits.

**Tech Stack:** Next.js 15 (App Router), plain CSS with custom properties, Tailwind 3 (preflight disabled, utilities only), `next/font`, Node `assert/strict` test scripts.

**Spec:** `docs/superpowers/specs/2026-09-10-direction-c-home-design.md`. The design markup it argues from is `docs/superpowers/specs/direction-c.html`, screen `C Home`, lines 61–135 (desktop) and 412–430 (phone). Read both before starting.

## Global Constraints

- **Exact design values, copy verbatim.** accent `#5b4ef0`, accent-hover `#4a3ee0`, accent-tint `#ecebff`, ink `#15171c`, ink-2 `#3d3f4a`, muted `#6b6d78`, faint `#9a9aa4`, surface `#ffffff`, canvas `#f4f4f6`, border `#eaeaef`, base font-size `13.5px`, pill radius `999px`, card radius `18px`. These are already in `:root` in `app/globals.css` — use the tokens, do not re-type the hex.
- **Do not port** `support.js`, `ios-frame.jsx`, or the dark canvas tab bar at spec line 24. They are canvas scaffolding, not product.
- **Tailwind preflight stays disabled.** `tailwind.config.js` sets `corePlugins.preflight: false`; the two resets in `app/tailwind.css` use `:where()` for zero specificity. Read `AGENTS.md` before touching either.
- **Never run `npm run build` while `next dev` is running.** Both write `.next`; the collision surfaces as a misleading `Cannot find module './chunks/…'`. Stop the dev server, `rm -rf .next`, then build.
- **Every numeric is IBM Plex Mono** — counts, salary, scores, dates, pagination ranges. Apply via `var(--font-mono)` or the existing `.mono` class. This is structural to the design, not decoration.
- **Do not add a second breakpoint for `.jobs-layout` / `.job-preview`.** `--preview-breakpoint` on `:root` is the single source; `app/globals.css` carries a comment saying so, and `lib/previewBreakpoint.js` reads it at runtime. The new `640px` rules in Task 8 target the hero, filter row and cards only — different elements, no conflict.
- **Test convention:** plain `node scripts/test-*.mjs` using `node:assert/strict`, registered in `package.json` scripts. There is no Jest or Vitest and this plan adds none. If node warns `MODULE_TYPELESS_PACKAGE_JSON`, ignore it — `lib/*.js` is ESM in a package without `"type": "module"`, and adding that field would change how every other `.js` file is interpreted.
- **Inert CTAs** get `aria-disabled="true"`, a `title` explaining what is not live, `cursor: default`, and **no** `disabled` attribute — `disabled` suppresses the tooltip and removes focusability, and the mock's appearance is the requirement.

## File Structure

| File | Responsibility |
|---|---|
| `lib/demo-fit.js` *(create)* | The only place fabricated content lives. Exports the switch, the slug→tier hash, tier labels, sort ranks and banner copy. |
| `components/HomeHero.jsx` *(create)* | Dark ATS hero. Both copy variants, two inert CTAs. Presentational, no state. |
| `app/page.jsx` *(modify)* | Page shell: 1440px section, hero, filters, split view. Loses the old hero, results header and `SearchBox`. |
| `components/JobCard.jsx` *(modify)* | Reads the fit tier from `lib/demo-fit.js` instead of the never-populated `job.fit`. |
| `components/JobPreview.jsx` *(modify)* | Adds Save button and the violet fit banner; drops the description wrapper heading; `h1` → `h2`. |
| `components/Pagination.jsx` *(modify)* | Mono range + two round arrows, `space-between`. Shared with `/search` and `JobListLayout`. |
| `components/Filters.jsx` *(modify)* | Enables `Sort: best fit` when the demo layer is on. |
| `components/AuthNav.jsx` *(modify)* | Scan pips render for everyone, reading the demo constant. |
| `app/globals.css` *(modify)* | All new CSS; removal of the superseded hero/results-header rules. |
| `scripts/test-demo-fit.mjs` *(create)* | Determinism, tier composition, card/pane agreement, switch-off behaviour. |
| `scripts/test-home-spec.mjs` *(create)* | Asserts the load-bearing spec literals actually reached `app/globals.css`. Grows across Tasks 2, 3, 5, 6. |

`app/SearchBox.jsx` is **not** deleted — `app/search/page.jsx` still imports it.

---

## Task 1: The demo-fit module

**Files:**
- Create: `lib/demo-fit.js`, `scripts/test-demo-fit.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing.
- Produces, relied on by Tasks 3, 4 and 6:
  - `DEMO_FIT: boolean` — `false` only when `NEXT_PUBLIC_DEMO_FIT === "false"`.
  - `DEMO_SCANS_USED: number` — `2`.
  - `TIER_BY_SLOT: string[]` — the ten-slot tier table, exported for the test.
  - `FIT_LABEL: { strong: "Strong fit", good: "Good fit", low: "Low fit" }`.
  - `FIT_RANK: { strong: 0, good: 1, low: 2 }`.
  - `fitFor(jobSlug: string): "strong" | "good" | "low" | null`.
  - `fitRank(jobSlug: string): number` — `FIT_RANK` of the slug's tier, or
    `Number.MAX_SAFE_INTEGER` when unscored, so unscored rows sort last.
  - `bannerFor(tier: string): { label: string, score: number, copy: string } | null`.

The spec described the switch as a bare `const`. It is an environment variable here instead, for one reason: a `const` cannot be flipped by a test, so "the layer degrades cleanly when off" would be untestable. `NEXT_PUBLIC_` is the correct prefix because `JobCard` is a client component and Next inlines the value into the client bundle at build time.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-demo-fit.mjs`:

```js
import assert from "node:assert/strict";
import {
  DEMO_FIT, DEMO_SCANS_USED, TIER_BY_SLOT, FIT_LABEL, FIT_RANK, fitFor, bannerFor,
} from "../lib/demo-fit.js";

// On by default: nothing has to be configured for the demo layer to render.
assert.equal(DEMO_FIT, true);
assert.equal(DEMO_SCANS_USED, 2);

// The mock's own ten job fixtures are 2 strong, 2 good, 6 low (spec lines
// 481-490). The slot table reproduces that ratio exactly, so this is an
// exact-count assertion rather than a statistical band over sampled slugs.
assert.equal(TIER_BY_SLOT.length, 10);
assert.equal(TIER_BY_SLOT.filter((t) => t === "strong").length, 2);
assert.equal(TIER_BY_SLOT.filter((t) => t === "good").length, 2);
assert.equal(TIER_BY_SLOT.filter((t) => t === "low").length, 6);

// Deterministic: the same slug must produce the same tier on every call, or
// the list reshuffles as you page back and forth, and — because JobCard is a
// client component fed by server-rendered data — server and client output
// disagree and React logs a hydration mismatch.
for (const slug of ["senior-backend-engineer-go-northwind-labs", "ios-engineer-lantern-works"]) {
  assert.equal(fitFor(slug), fitFor(slug));
  assert.ok(["strong", "good", "low"].includes(fitFor(slug)));
}
assert.notEqual(
  fitFor("senior-backend-engineer-go-northwind-labs"),
  fitFor("senior-backend-engineer-go-northwind-labs-x"),
  "different slugs should not all collapse to one tier"
);

// All three tiers must be reachable, otherwise the page only ever shows one
// badge colour and the demo looks broken rather than varied.
const sampled = new Set(Array.from({ length: 200 }, (_, i) => fitFor(`job-${i}`)));
assert.deepEqual([...sampled].sort(), ["good", "low", "strong"]);

// Absent or malformed slugs yield no badge at all — never a fabricated one.
assert.equal(fitFor(""), null);
assert.equal(fitFor(undefined), null);
assert.equal(fitFor(null), null);

// The card badge and the preview banner must agree for the same job. If they
// can disagree, clicking a "Low fit" card opens a "Strong fit" banner and the
// whole demo reads as a bug.
const tier = fitFor("platform-engineer-kubernetes-tessellate");
assert.equal(bannerFor(tier).label, FIT_LABEL[tier]);

// Banner copy is tier-keyed and complete for every tier.
for (const t of ["strong", "good", "low"]) {
  const banner = bannerFor(t);
  assert.equal(banner.label, FIT_LABEL[t]);
  assert.equal(typeof banner.copy, "string");
  assert.ok(banner.copy.length > 0);
  assert.ok(Number.isInteger(banner.score) && banner.score > 0 && banner.score <= 100);
}
assert.equal(bannerFor("nonsense"), null);
assert.equal(bannerFor(null), null);

// Best-fit sort order: strong first, low last.
assert.deepEqual(
  ["low", "strong", "good"].sort((a, b) => FIT_RANK[a] - FIT_RANK[b]),
  ["strong", "good", "low"]
);

// Switch off: re-import a separate module instance with the env var set, so
// the constant is evaluated again. The query string is what makes Node treat
// it as a distinct module rather than serving the cached one.
process.env.NEXT_PUBLIC_DEMO_FIT = "false";
const off = await import(new URL("../lib/demo-fit.js?off", import.meta.url).href);
assert.equal(off.DEMO_FIT, false);
assert.equal(off.fitFor("platform-engineer-kubernetes-tessellate"), null);
assert.equal(off.bannerFor("strong"), null);

console.log("demo-fit ok");
```

- [ ] **Step 2: Register the script and run it to verify it fails**

Add to `package.json` under `scripts`, after `"design-tokens:test"`:

```json
"demo-fit:test": "node scripts/test-demo-fit.mjs",
```

Run: `npm run demo-fit:test`
Expected: FAIL — `Cannot find module .../lib/demo-fit.js`

- [ ] **Step 3: Write the module**

Create `lib/demo-fit.js`:

```js
// Every fabricated value on the C Home screen lives here and nowhere else.
//
// The design shows a fit badge on each card, a violet fit banner in the
// preview pane, a "best fit" sort and a used-scan quota. All four need a
// resume-scoring subsystem that does not exist. This module supplies static
// stand-ins so the page matches the mock 1:1, and switches all of them off
// together when the real thing lands:
//
//   NEXT_PUBLIC_DEMO_FIT=false
//
// With it off, fitFor() and bannerFor() return null, badges and banner render
// nothing, "Sort: best fit" goes back to disabled, and the pips return to
// signed-in-only — without touching a single component.
export const DEMO_FIT = process.env.NEXT_PUBLIC_DEMO_FIT !== "false";

// The mock's own default (spec line 469: scansUsed range editor, default 2).
export const DEMO_SCANS_USED = 2;

export const FIT_LABEL = { strong: "Strong fit", good: "Good fit", low: "Low fit" };

// Sort order for "Sort: best fit". Unscored jobs sort last — see fitRank().
export const FIT_RANK = { strong: 0, good: 1, low: 2 };

// Ten slots in the mock's own proportion: 2 strong, 2 good, 6 low, in the
// order the design's ten job fixtures appear (spec lines 481-490).
export const TIER_BY_SLOT = [
  "strong", "low", "low", "low", "good",
  "low", "strong", "low", "low", "good",
];

// FNV-1a, 32-bit. Chosen for three properties the demo needs:
//   deterministic  — the same job keeps its badge across renders and pages;
//   pure of state  — no Date, no Math.random, so server and client agree and
//                    React does not report a hydration mismatch;
//   well spread    — adjacent slugs land in different slots, so the list
//                    shows a mix rather than runs of one tier.
function hash(value) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function fitFor(jobSlug) {
  if (!DEMO_FIT) return null;
  if (typeof jobSlug !== "string" || jobSlug === "") return null;
  return TIER_BY_SLOT[hash(jobSlug) % TIER_BY_SLOT.length];
}

// Sort key for "Sort: best fit". Anything unscored sorts after every scored
// tier rather than jumping to the top of the list.
export function fitRank(jobSlug) {
  const rank = FIT_RANK[fitFor(jobSlug)];
  return rank === undefined ? Number.MAX_SAFE_INTEGER : rank;
}

// Wording follows the mock's register — concrete, specific, no hedging. The
// strong-fit line is the design's own copy (spec line 118).
const BANNERS = {
  strong: { label: FIT_LABEL.strong, score: 81, copy: "Matches Go, PostgreSQL, gRPC and 6+ years. Missing Kubernetes." },
  good:   { label: FIT_LABEL.good,   score: 64, copy: "Matches the core stack. Two listed requirements are not evidenced." },
  low:    { label: FIT_LABEL.low,    score: 38, copy: "Little overlap with this posting's requirements." },
};

export function bannerFor(tier) {
  if (!DEMO_FIT) return null;
  return BANNERS[tier] ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run demo-fit:test`
Expected: PASS — `demo-fit ok`

- [ ] **Step 5: Commit**

```bash
git add lib/demo-fit.js scripts/test-demo-fit.mjs package.json
git commit -m "feat(home): demo fit layer behind a single switch

Deterministic slug-hashed fit tiers so the card badge and the preview
banner can never disagree, and so server and client render identically.
NEXT_PUBLIC_DEMO_FIT=false turns the whole layer off.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Page shell and hero

**Files:**
- Create: `components/HomeHero.jsx`, `scripts/test-home-spec.mjs`
- Modify: `app/page.jsx`, `app/globals.css`, `package.json`

**Interfaces:**
- Consumes: tokens from `:root` in `app/globals.css`.
- Produces: `<HomeHero />` — no props. The `.home-shell` wrapper class, which Task 8 adds phone rules to. The `scripts/test-home-spec.mjs` file, which Tasks 3, 5 and 6 append assertions to.

Spec: design doc "Hero", from `direction-c.html` lines 62–75.

- [ ] **Step 1: Write the failing spec test**

Create `scripts/test-home-spec.mjs`. This asserts that the literal values from the design actually reached the stylesheet — the cheap half of the pixel check, run on every commit. The expensive half is the screenshot comparison in Task 9.

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

// Collapse whitespace so assertions are not hostage to line wrapping.
const flat = css.replace(/\s+/g, " ");

// Assertions are scoped to a single rule body, never to the whole file. A
// bare flat.includes("max-width: 1440px") would pass on .site-header's own
// 1440px and prove nothing about the home shell.
function rule(selector) {
  const start = flat.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing rule: ${selector}`);
  return flat.slice(start, flat.indexOf("}", start));
}
function decl(selector, declaration) {
  assert.ok(
    rule(selector).includes(declaration),
    `${selector} should declare "${declaration}"`
  );
}

// ─── Page shell (spec line 61) ───
decl(".home-shell", "max-width: 1440px");
decl(".home-shell", "padding: 8px 24px 56px");

// ─── Hero (spec lines 62-75) ───
decl(".home-hero", "border-radius: 20px");
decl(".home-hero", "padding: 26px 30px");
decl(".home-hero", "grid-template-columns: minmax(0,1fr) auto");
decl(".home-hero", "gap: 28px");
decl(".home-hero", "margin-bottom: 18px");
decl(".home-hero", "--hero-glow: rgba(122,105,255,.5)");
decl(".home-hero .hh-glow", "width: 360px");
decl(".home-hero .hh-glow", "height: 360px");
decl(".home-hero .hh-glow", "right: -80px");
decl(".home-hero .hh-glow", "top: -120px");
decl(".home-hero .hh-badge", "padding: 5px 11px");
decl(".home-hero .hh-badge", "font-size: 11.5px");
decl(".home-hero .hh-badge", "letter-spacing: .03em");
decl(".home-hero .hh-dot", "width: 6px");
decl(".home-hero .hh-title", "font-size: 26px");
decl(".home-hero .hh-title", "letter-spacing: -.025em");
decl(".home-hero .hh-title", "max-width: 640px");
decl(".home-hero .hh-sub", "font-size: 14px");
decl(".home-hero .hh-sub", "max-width: 560px");
decl(".home-hero .hh-cta", "gap: 9px");
decl(".home-hero .hh-cta-primary", "padding: 12px 20px");
decl(".home-hero .hh-cta-primary", "box-shadow: 0 6px 20px rgba(0,0,0,.28)");
decl(".home-hero .hh-cta-ghost", "padding: 12px 18px");
decl(".home-hero .hh-cta-ghost", "background: rgba(255,255,255,.08)");

// ─── Rules the redesign removes (they styled markup that no longer exists) ───
for (const dead of [".directory-hero", ".directory-content", ".results-header", ".results-count"]) {
  assert.ok(!flat.includes(dead), `dead rule still present: ${dead}`);
}

console.log("home spec ok");
```

- [ ] **Step 2: Register the script and run it to verify it fails**

Add to `package.json` under `scripts`:

```json
"home-spec:test": "node scripts/test-home-spec.mjs",
```

Run: `npm run home-spec:test`
Expected: FAIL — `home shell width — missing: max-width: 1440px`

- [ ] **Step 3: Write the hero component**

Create `components/HomeHero.jsx`. No `"use client"` — it has no state and no handlers, so it stays a server component and ships no JavaScript.

```jsx
// C Home's hero (spec lines 62-75), with the phone variant from the design's
// own mobile screen (spec line 420).
//
// The phone version is not a narrower desktop hero: it drops the second CTA
// and shortens both strings. Both copy variants are rendered and toggled with
// CSS `display` rather than JavaScript — no hydration branch, no layout shift,
// and the strings stay in one file.
//
// Both CTAs are inert: resume scanning is not built. They carry aria-disabled
// and a title rather than the `disabled` attribute, because `disabled`
// suppresses the tooltip and removes focusability, and the mock's appearance
// is the requirement.
const NOT_LIVE = "Resume scoring isn't live yet";

export default function HomeHero() {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <span className="hh-glow" aria-hidden="true" />
      <div className="hh-copy">
        <span className="hh-badge">
          <span className="hh-dot" aria-hidden="true" />
          AI resume match
        </span>
        <h1 id="home-hero-title" className="hh-title">
          <span className="hh-wide">Drop your resume. Get an ATS score and every open role ranked by fit.</span>
          <span className="hh-narrow">Drop your resume. Get an ATS score and every role ranked by fit.</span>
        </h1>
        <p className="hh-sub">
          <span className="hh-wide">PDF or DOCX, up to 5 MB. Three free scans, no card. Your resume is never shared with employers.</span>
          <span className="hh-narrow">3 free scans · no card</span>
        </p>
      </div>
      <div className="hh-cta">
        <button type="button" className="hh-cta-primary" aria-disabled="true" title={NOT_LIVE}>
          Upload resume
        </button>
        <button type="button" className="hh-cta-ghost" aria-disabled="true" title={NOT_LIVE}>
          How scoring works
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add the hero CSS**

In `app/globals.css`, add a new block immediately before the `/* ─── Job list ─── */` section:

```css
/* ─── Home shell + hero (Direction C — spec lines 61–75) ───────────
   The section is 1440px, not the 1160px .container used elsewhere: C Home
   is a two-column working surface, and .container's measure would crush the
   preview pane. */
.home-shell { max-width: 1440px; margin: 0 auto; padding: 8px 24px 56px; }

.home-hero {
  /* Six colours that appear only in this hero. Scoped here rather than
     promoted to :root — nothing else in the app uses them — and grouped
     rather than inlined, so a later re-skin has one place to look. */
  --hero-glow:     rgba(122,105,255,.5);
  --hero-badge-fg: #c9c2ff;
  --hero-dot:      #a99cff;
  --hero-sub:      #a7a8b3;

  position: relative; overflow: hidden; border-radius: 20px;
  background: var(--text); color: #fff; padding: 26px 30px; margin-bottom: 18px;
  display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 28px; align-items: center;
}
/* Sits behind the content; .hh-copy and .hh-cta take position:relative so
   they paint above it, and the container clips it with overflow:hidden. */
.home-hero .hh-glow {
  position: absolute; right: -80px; top: -120px; width: 360px; height: 360px;
  border-radius: var(--radius-pill);
  background: radial-gradient(circle, var(--hero-glow), transparent 65%);
}
.home-hero .hh-copy { position: relative; min-width: 0; }
.home-hero .hh-badge {
  display: inline-flex; align-items: center; gap: 7px;
  background: rgba(255,255,255,.1); border-radius: var(--radius-pill);
  padding: 5px 11px; font-size: 11.5px; font-weight: 600;
  letter-spacing: .03em; color: var(--hero-badge-fg); margin-bottom: 14px;
}
.home-hero .hh-dot {
  width: 6px; height: 6px; border-radius: var(--radius-pill); background: var(--hero-dot);
}
.home-hero .hh-title {
  font-size: 26px; font-weight: 600; letter-spacing: -.025em; line-height: 1.2;
  margin-bottom: 8px; max-width: 640px; text-wrap: pretty; color: #fff;
}
.home-hero .hh-sub { color: var(--hero-sub); max-width: 560px; font-size: 14px; }
.home-hero .hh-cta { position: relative; display: flex; gap: 9px; align-items: center; }
.home-hero .hh-cta button {
  border: 0; border-radius: var(--radius-pill); font-family: inherit;
  font-weight: 600; font-size: 13.5px; white-space: nowrap;
  /* Not cursor:pointer — these do nothing yet, and a pointer cursor on a
     dead control is a lie the mock's static rendering cannot tell. */
  cursor: default;
}
.home-hero .hh-cta-primary {
  background: #fff; color: var(--text); padding: 12px 20px;
  box-shadow: 0 6px 20px rgba(0,0,0,.28);
}
.home-hero .hh-cta-primary:hover { background: var(--accent-tint); }
.home-hero .hh-cta-ghost { background: rgba(255,255,255,.08); color: #fff; padding: 12px 18px; }
.home-hero .hh-cta-ghost:hover { background: rgba(255,255,255,.16); }
/* Phone copy is hidden by default; Task 8 swaps the two at 640px. */
.home-hero .hh-narrow { display: none; }
```

- [ ] **Step 5: Rewrite the page shell**

Replace the whole `return (…)` block and the imports in `app/page.jsx`. The design has no page-level search (the header owns it) and no results header (the count lives in the filter row), so both go:

```jsx
import { Suspense } from "react";
import { searchJobs } from "@/lib/jobs";
import Filters from "@/components/Filters";
import HomeHero from "@/components/HomeHero";
import JobsSplitView from "./JobsSplitView";
```

```jsx
  return (
    <div className="home-shell">
      <HomeHero />
      <Suspense>
        <Filters initialCount={Number(results.total)} />
      </Suspense>
      {/* JobsSplitView validates `selectedSlug` against the incoming `jobs`
          itself (falling back to the first row when the previous selection
          isn't in the new result set) — see the effect there. No `key` here:
          keying on the raw searchParams would remount on any unrelated
          param and would also discard a still-valid selection whenever the
          new jobs array happens to contain it (e.g. a sort-order change),
          forcing a needless preview refetch and loading flash. */}
      <JobsSplitView jobs={results.jobs} total={results.total} />
    </div>
  );
```

Delete the now-unused `Link` and `SearchBox` imports. Leave `export const dynamic`, `metadata` and the `searchJobs` call exactly as they are — the SEO trade is recorded in the design doc and `metadata` is deliberately unchanged.

- [ ] **Step 6: Remove the superseded CSS**

The old hero and results header no longer have markup. Find every rule for them:

```bash
grep -n "directory-hero\|directory-content\|results-header\|results-count" app/globals.css
```

Delete each matched rule, **including any inside media queries**. Do not touch `.eyebrow`, `.search-wrap-two`, `.search-field`, `.search-bar` or `.autocomplete-*` — `app/SearchBox.jsx` still uses them on `/search`.

Then confirm nothing else referenced them:

```bash
grep -rn "directory-hero\|directory-content\|results-header\|results-count" app components
```

Expected: no output.

- [ ] **Step 7: Run the spec test to verify it passes**

Run: `npm run home-spec:test`
Expected: PASS — `home spec ok`

- [ ] **Step 8: Verify it renders**

```bash
npm run dev
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4100/jobs
```

Expected: `200`. In the browser at 1440px: a dark hero card with a violet glow bleeding off the top-right corner, the badge pill above a 26px headline, two pill buttons on the right, and the filter row directly beneath it. No blue gradient, no "N jobs available" heading, no second search box on the page.

- [ ] **Step 9: Commit**

```bash
git add components/HomeHero.jsx app/page.jsx app/globals.css scripts/test-home-spec.mjs package.json
git commit -m "feat(home): Direction C hero and 1440px page shell

Replaces the blue directory hero and the results header with the
design's dark ATS hero. Both copy variants ship in the markup and are
toggled with CSS, because the phone hero drops a CTA and shortens both
strings rather than just reflowing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Job card fit badge, shadow and list gap

**Files:**
- Modify: `components/JobCard.jsx`, `app/globals.css`, `scripts/test-home-spec.mjs`

**Interfaces:**
- Consumes: `fitFor`, `FIT_LABEL` from `lib/demo-fit.js` (Task 1).
- Produces: nothing new. `JobCard`'s props are unchanged — `{ job, selected, onSelect }`.

Spec: `direction-c.html` lines 88–102, and `fitStyle()` at line 474 for the tier colours.

- [ ] **Step 1: Append the failing assertions**

Add to `scripts/test-home-spec.mjs`, before the dead-rule loop:

```js
// ─── Job list + card (spec lines 88-102) ───
decl(".job-list", "gap: 8px");
decl(".job-card", "border-radius: 14px");
decl(".job-card", "padding: 13px 16px");
decl(".job-card", "box-shadow: var(--shadow-card)");
decl(":root", "--shadow-card: 0 1px 2px rgba(21,23,28,.04), 0 0 0 1px rgba(21,23,28,.05)");
decl(".job-card .jc-avatar", "width: 32px");
decl(".job-card .jc-name", "font-size: 14.5px");
decl(".job-card .jc-foot", "padding-left: 43px");
decl(".fit-badge", "font-size: 11.5px");
decl(".fit-badge", "padding: 3px 9px");
decl(".fit-badge.strong", "background: var(--accent-tint)");
decl(".fit-badge.good", "background: var(--bg2)");
decl(".fit-badge.low", "background: transparent");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run home-spec:test`
Expected: FAIL — `.job-list should declare "gap: 8px"` (it is `.6rem` today, which is 9.6px)

- [ ] **Step 3: Correct the CSS**

In `app/globals.css`, add to the `:root` block, directly after `--shadow`:

```css
  /* The job card's own shadow is lighter than --shadow, which dresses the
     larger 18px-radius surfaces (the preview pane). Spec line 89: cards use
     0 1px 2px at .04 alpha; the pane uses 0 1px 3px at .06. */
  --shadow-card:  0 1px 2px rgba(21,23,28,.04), 0 0 0 1px rgba(21,23,28,.05);
```

Change `.job-card`'s shadow from `var(--shadow)` to `var(--shadow-card)`. Leave `.job-card:hover` and `.job-card.selected, .job-card.strong` exactly as they are — the hover ring and the violet selected ring already match the spec.

Change the list gap:

```css
.job-list { display: flex; flex-direction: column; gap: 8px; }
```

- [ ] **Step 4: Read the fit tier from the demo layer**

In `components/JobCard.jsx`, delete the local `FIT_LABEL` constant and its comment, and import from the demo module instead:

```jsx
"use client";
import Link from "next/link";
import { fmtSalary, fmtDate, initials } from "@/lib/format";
import { FIT_LABEL, fitFor } from "@/lib/demo-fit";
```

Inside the component, resolve the tier once — a real `job.fit` from a future scoring subsystem always wins over the demo value:

```jsx
  // job.fit is what a real scoring subsystem will set. Until one exists it is
  // always undefined, and the demo layer supplies a deterministic stand-in
  // (lib/demo-fit.js). With NEXT_PUBLIC_DEMO_FIT=false, fitFor returns null
  // and no badge renders at all — never a fabricated "Low fit", which would
  // read as a judgement of the job.
  const fit = job.fit ?? fitFor(job.job_slug);
```

Use it in both places that currently read `job.fit`:

```jsx
      className={`job-card${selected ? " selected" : ""}${fit === "strong" ? " strong" : ""}`}
```

```jsx
        {fit ? <span className={`fit-badge ${fit}`}>{FIT_LABEL[fit]}</span> : null}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run home-spec:test
npm run demo-fit:test
```

Expected: `home spec ok`, `demo-fit ok`

- [ ] **Step 6: Verify it renders**

With `npm run dev` running, load `http://localhost:4100/jobs` at 1440px. Every card carries a badge; roughly one in five reads "Strong fit" in violet on `#ecebff` with a violet ring around the card, one in five "Good fit" in grey on `#f4f4f6`, the rest "Low fit" as bare grey text with no pill background. Reload twice: **the same job keeps the same badge every time.** If badges shuffle between reloads, `fitFor` is reading something other than the slug — stop and fix it before continuing.

- [ ] **Step 7: Commit**

```bash
git add components/JobCard.jsx app/globals.css scripts/test-home-spec.mjs
git commit -m "feat(home): fit badges on job cards, card shadow and list gap

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Best-fit sort and always-visible scan pips

**Files:**
- Modify: `components/Filters.jsx`, `components/AuthNav.jsx`, `app/page.jsx`, `scripts/test-demo-fit.mjs`

**Interfaces:**
- Consumes: `DEMO_FIT`, `DEMO_SCANS_USED`, `fitRank` from `lib/demo-fit.js` (Task 1).
- Produces: `sort=fit` becomes a live URL state that `app/page.jsx` honours.

- [ ] **Step 1: Append the failing sort assertions**

Add to `scripts/test-demo-fit.mjs`, immediately before the "Switch off" block at the end (it must stay last — it mutates `process.env`). Import `fitRank` by adding it to the existing import list at the top of the file.

```js
// Best-fit ordering: every strong-fit slug sorts ahead of every good-fit
// slug, which sorts ahead of every low-fit slug.
const slugs = Array.from({ length: 60 }, (_, i) => `job-${i}`);
const ordered = [...slugs].sort((a, b) => fitRank(a) - fitRank(b));
const ranks = ordered.map((s) => fitRank(s));
assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), "fitRank must produce a total order");
assert.equal(fitFor(ordered[0]), "strong");
assert.equal(fitFor(ordered[ordered.length - 1]), "low");

// Unscored rows sort last rather than jumping to the top of the list.
assert.equal(fitRank(""), Number.MAX_SAFE_INTEGER);
assert.ok(fitRank("") > fitRank("job-0"));
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run demo-fit:test`
Expected: FAIL — `fitRank is not a function` if Task 1's `fitRank` export was missed; otherwise this passes immediately, which is fine and means Task 1 already covered it. Move to Step 3 either way.

- [ ] **Step 3: Enable the sort option in the filter bar**

In `components/Filters.jsx`, import the switch and widen the allowed sorts:

```jsx
import { DEMO_FIT } from "@/lib/demo-fit";
```

```jsx
// "fit" is only a legal sort value while the demo layer is on; with it off
// the option goes back to disabled and clampSort drops the value from the URL.
const SORTS = DEMO_FIT ? ["newest", "salary", "fit"] : ["newest", "salary"];
```

Replace the `Sort: best fit` option:

```jsx
        <option value="fit" disabled={!DEMO_FIT} title={DEMO_FIT ? undefined : "Available once you scan a resume"}>
          Sort: best fit
        </option>
```

Leave the rest of the component untouched, including the `hasFilters` and `scopedResults` logic.

- [ ] **Step 4: Apply the ordering on the page**

In `app/page.jsx`, import the helpers:

```jsx
import { DEMO_FIT, fitRank } from "@/lib/demo-fit";
```

After the `searchJobs` call, before the `return`:

```jsx
  // "Sort: best fit" has no backing query — lib/jobs.js deliberately falls
  // back to newest for an unrecognised sort value rather than erroring — so
  // the demo ordering is applied to the fetched page here. This reorders the
  // current 20 rows only; it is a presentation of the demo tiers, not a
  // ranking across the corpus, and it disappears with the demo layer.
  const jobs = sp.sort === "fit" && DEMO_FIT
    ? [...results.jobs].sort((a, b) => fitRank(a.job_slug) - fitRank(b.job_slug))
    : results.jobs;
```

and pass it down:

```jsx
      <JobsSplitView jobs={jobs} total={results.total} />
```

- [ ] **Step 5: Show the scan pips to everyone**

In `components/AuthNav.jsx`, the pips currently live inside the signed-in branch. The design shows them unconditionally. Replace the component body with:

```jsx
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { initials } from "@/lib/format";
import { DEMO_FIT, DEMO_SCANS_USED } from "@/lib/demo-fit";

export default function AuthNav({ mobile = false }) {
  const { data: session, status } = useSession();

  // The design shows the pips for every visitor (spec line 57), not only for
  // signed-in users, and the count is the mock's own default of 2 used. Both
  // the control and its number come from the demo layer: with
  // NEXT_PUBLIC_DEMO_FIT=false this renders nothing and the header returns to
  // showing auth state alone. Desktop only — the mock's phone header has no
  // pips (spec line 417).
  const pips = DEMO_FIT && !mobile ? (
    <span className="scan-pips">
      <span className="pips" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={i < DEMO_SCANS_USED ? "pip used" : "pip"} />
        ))}
      </span>
      <span className="mono">{3 - DEMO_SCANS_USED}</span>/3 free scans
    </span>
  ) : null;

  // Placeholder keeps the navbar from shifting while the session resolves;
  // its dimensions are set in globals.css. The pips do not depend on the
  // session, so they render straight away.
  if (status === "loading") {
    return <>{pips}<div className="auth-nav-placeholder" aria-hidden="true" /></>;
  }

  if (session?.user) {
    if (mobile) {
      return (
        <button
          type="button"
          className="mobile-auth-link dashboard"
          title={session.user.email ?? undefined}
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          Sign out
        </button>
      );
    }

    // The avatar has no menu, so it doubles as the sign-out control itself
    // rather than opening an account surface that does not exist yet.
    return (
      <>
        {pips}
        <button
          type="button"
          className="avatar"
          title={session.user.email ?? undefined}
          aria-label="Sign out"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          {initials(session.user.name || session.user.email)}
        </button>
      </>
    );
  }

  return (
    <>
      {pips}
      <Link href="/signin" className={mobile ? "mobile-auth-link" : "nav-login"}>
        Log in
      </Link>
    </>
  );
}
```

Delete the now-stale block comment at the top of the file that says the pips are signed-in-only and `scansUsed` is hardcoded to 0.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm run demo-fit:test
npm run home-spec:test
```

Expected: `demo-fit ok`, `home spec ok`

- [ ] **Step 7: Verify it renders**

With the dev server running:
- Signed out at `http://localhost:4100/jobs`, the header shows two filled violet pips, `1/3 free scans`, then `Log in`. No avatar.
- Choose `Sort: best fit`. The URL gains `?sort=fit` and every "Strong fit" card moves to the top of the list, then "Good fit", then "Low fit".
- Switch back to `Sort: newest`; the `sort` param is dropped and the original order returns.

- [ ] **Step 8: Commit**

```bash
git add components/Filters.jsx components/AuthNav.jsx app/page.jsx scripts/test-demo-fit.mjs
git commit -m "feat(home): enable best-fit sort and always-on scan pips

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Pagination row

**Files:**
- Modify: `components/Pagination.jsx`, `app/globals.css`, `scripts/test-home-spec.mjs`

**Interfaces:**
- Consumes: tokens from `:root`.
- Produces: `<Pagination total={number} pageSize={number} />` — props unchanged, markup and classes entirely replaced.

Spec: `direction-c.html` line 103.

**This component is shared.** `app/JobsSplitView.jsx`, `app/search/page.jsx` and `components/JobListLayout.jsx` all render it, so the new pager appears on the search results page and on every category / company / location listing too. That is intended — one pager language across the app — but those pages must be checked in Step 6, not assumed.

- [ ] **Step 1: Append the failing assertions**

Add to `scripts/test-home-spec.mjs`, before the dead-rule loop:

```js
// ─── Pagination (spec line 103) ───
decl(".pager", "justify-content: space-between");
decl(".pager", "padding: 6px 6px 0");
decl(".pager", "font-size: 12px");
decl(".pager-range", "font-family: var(--font-mono), monospace");
decl(".pager-arrows", "gap: 6px");
decl(".pager-btn", "width: 28px");
decl(".pager-btn", "height: 28px");
decl(".pager-btn", "box-shadow: 0 0 0 1px rgba(21,23,28,.07)");
```

and add `.pagination` and `.page-btn` to the dead-rule loop's list:

```js
for (const dead of [".directory-hero", ".directory-content", ".results-header", ".results-count", ".pagination", ".page-btn"]) {
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run home-spec:test`
Expected: FAIL — `missing rule: .pager`

- [ ] **Step 3: Rewrite the component**

Replace the whole of `components/Pagination.jsx`:

```jsx
"use client";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";

// Direction C's pager (spec line 103): the range on the left in mono, two
// round arrows on the right. The numbered page list the old pager rendered
// does not appear anywhere in the design.
//
// Unlike the old one, this renders whenever there are results at all rather
// than only past page 2 — the range reading "1-20 of 128,431" is the point of
// the row, and on a single-page result set it still tells you the count.
export default function Pagination({ total, pageSize = 20 }) {
  const sp = useSearchParams();
  const pathname = usePathname();

  if (!total) return null;

  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const href = (n) => {
    const next = new URLSearchParams(sp.toString());
    next.delete("token");
    next.set("page", String(n));
    return `${pathname}?${next.toString()}`;
  };

  // At an edge the arrow becomes a real disabled <button>, not a styled-dead
  // <Link>: it must not be focusable and must not navigate.
  const arrow = (targetPage, enabled, label, glyph) =>
    enabled ? (
      <Link href={href(targetPage)} className="pager-btn" aria-label={label}>{glyph}</Link>
    ) : (
      <button type="button" className="pager-btn" disabled aria-label={label}>{glyph}</button>
    );

  return (
    <nav className="pager" aria-label="Pagination">
      {/* En-dash (U+2013) between the bounds, per the design. */}
      <span className="pager-range">{first}–{last} of {total.toLocaleString()}</span>
      <div className="pager-arrows">
        {arrow(page - 1, page > 1, "Previous page", "‹")}
        {arrow(page + 1, page < totalPages, "Next page", "›")}
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Replace the CSS**

In `app/globals.css`, delete the entire `/* ─── Pagination ─── */` block (`.pagination`, `.page-btn`, `.page-btn:hover`, `.page-btn.active`, `.page-btn:disabled`) and put this in its place:

```css
/* ─── Pagination (Direction C — spec line 103) ─────────────────── */
.pager {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 6px 0; font-size: 12px; color: var(--text3);
}
.pager-range { font-family: var(--font-mono), monospace; }
.pager-arrows { display: flex; gap: 6px; }
.pager-btn {
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; background: var(--bg); box-shadow: 0 0 0 1px rgba(21,23,28,.07);
  border-radius: var(--radius-pill); width: 28px; height: 28px;
  font-family: inherit; font-weight: 600; color: var(--text2);
  cursor: pointer; transition: background .15s, color .15s;
}
.pager-btn:hover { background: var(--text); color: #fff; }
.pager-btn:disabled { color: #c3c3cb; cursor: default; }
.pager-btn:disabled:hover { background: var(--bg); color: #c3c3cb; }
```

Before deleting, confirm no JSX still uses the old classes:

```bash
grep -rn "page-btn\|className=\"pagination\"" app components
```

Expected: no output.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run home-spec:test`
Expected: PASS — `home spec ok`

- [ ] **Step 6: Verify all three callers**

With the dev server running, check every page that renders this component:

```bash
curl -s -o /dev/null -w 'jobs   %{http_code}\n' http://localhost:4100/jobs
curl -s -o /dev/null -w 'search %{http_code}\n' 'http://localhost:4100/search?q=engineer'
curl -s -o /dev/null -w 'remote %{http_code}\n' http://localhost:4100/remote
```

All `200`. Then in the browser confirm on each: the range reads `1–20 of N` in mono on the left, two round 28px arrows on the right, the left arrow is grey and unclickable on page 1, and the right arrow turns dark on hover. Page forward and confirm the range advances to `21–40 of N` and the left arrow becomes live.

- [ ] **Step 7: Commit**

```bash
git add components/Pagination.jsx app/globals.css scripts/test-home-spec.mjs
git commit -m "feat(home): Direction C pager, mono range and round arrows

Replaces the numbered pager the design does not have. Shared with
/search and JobListLayout, so those pages get it too.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Preview pane — Save, fit banner, description

**Files:**
- Modify: `components/JobPreview.jsx`, `app/globals.css`, `scripts/test-home-spec.mjs`

**Interfaces:**
- Consumes: `fitFor`, `bannerFor` from `lib/demo-fit.js` (Task 1); `formatAtsLabel`, `fmtSalary`, `fmtDate`, `sanitiseHtml`, `decodeEntities` — all already imported there.
- Produces: nothing new. `<JobPreview slug={string|null} />` is unchanged.

Spec: `direction-c.html` lines 105–133.

- [ ] **Step 1: Append the failing assertions**

Add to `scripts/test-home-spec.mjs`, before the dead-rule loop:

```js
// ─── Preview pane (spec lines 105-133) ───
decl(".job-preview .jp-actions", "gap: 7px");
decl(".job-preview .jp-save", "padding: 9px 14px");
decl(".job-preview .jp-save", "font-size: 13px");
decl(".job-preview .jp-fit", "margin: 0 24px 20px");
decl(".job-preview .jp-fit", "border-radius: 14px");
decl(".job-preview .jp-fit", "padding: 14px 16px");
decl(".job-preview .jp-fit", "grid-template-columns: auto minmax(0,1fr) auto");
decl(".job-preview .jp-fit", "--fit-grad-top: #f3f1ff");
decl(".job-preview .jp-fit", "--fit-fg: #3a2fa8");
decl(".job-preview .jp-fit-pill", "padding: 5px 11px");
decl(".job-preview .jp-fit-action", "box-shadow: 0 1px 2px rgba(59,47,168,.14)");
decl(".job-preview .jp-description h3", "text-transform: uppercase");
decl(".job-preview .jp-description h3", "margin: 22px 0 8px");
decl(".job-preview .jp-description ol", "padding-left: 18px");
decl(".job-preview .jp-description li", "margin-bottom: 5px");
decl(".job-preview .jp-description p", "margin-bottom: 12px");
```

`rule(".job-preview .jp-description h3")` works because that selector is the last in the grouped `h1, h2, h3` rule, so the literal `… h3 {` appears in the file. Same for `… ol {`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run home-spec:test`
Expected: FAIL — `missing rule: .job-preview .jp-actions`

- [ ] **Step 3: Add the Save button and the fit banner**

In `components/JobPreview.jsx`, extend the imports:

```jsx
import { bannerFor, fitFor } from "@/lib/demo-fit";
```

Add the inert-control titles beside the existing module constants:

```jsx
const SAVE_NOT_LIVE = "Saved jobs aren't live yet";
const QUEUE_NOT_LIVE = "Auto-apply isn't live yet";
```

After `const salary = fmtSalary(job) ?? "—";`, resolve the banner:

```jsx
  // Same slug, same function as JobCard — so a card badged "Low fit" can
  // never open a "Strong fit" banner. Returns null with the demo layer off,
  // and the banner disappears entirely rather than showing a blank score.
  const banner = bannerFor(fitFor(job.job_slug));
```

Replace the bare `Apply` link in the header row with an action group holding both buttons:

```jsx
          <div className="jp-actions">
            {/* Saved jobs need a subsystem that does not exist — no model, no
                API, nowhere to put the record. The control is in the design,
                so it renders, inert and labelled as such. */}
            <button type="button" className="jp-save" aria-disabled="true" title={SAVE_NOT_LIVE}>
              Save
            </button>
            {job.apply_url ? (
              <a href={job.apply_url} target="_blank" rel="noopener noreferrer" className="jp-apply">
                Apply ↗
              </a>
            ) : null}
          </div>
```

Insert the banner between the closing `</div>` of `.jp-body` and the description `<section>`:

```jsx
      {banner ? (
        <div className="jp-fit">
          <span className="jp-fit-pill">{banner.label}</span>
          <p className="jp-fit-copy">
            {banner.copy} ATS score for this posting <b className="mono">{banner.score}</b>.
          </p>
          <button type="button" className="jp-fit-action" aria-disabled="true" title={QUEUE_NOT_LIVE}>
            + Auto-apply queue
          </button>
        </div>
      ) : null}
```

- [ ] **Step 4: Fix the heading level and drop the wrapper heading**

The page ships three `<h1>`s today. After Task 2 removed two of them, this one is the last offender: the preview pane is a supporting region, not the page's subject.

Change `<h1 className="jp-title">` to `<h2 className="jp-title">` (and its closing tag). The CSS is selector-based, so nothing visual changes.

Delete the `<h2 className="jp-section-title">About this role</h2>` line. The design goes straight from the banner into the description prose; the section keeps its `aria-label="Job description"`, so it stays announced.

Then check whether `.jp-section-title` is still used anywhere:

```bash
grep -rn "jp-section-title" app components
```

If there is no output, delete its rule from `app/globals.css` too.

- [ ] **Step 5: Restyle the description and add the banner CSS**

In `app/globals.css`, add the Save/actions/banner rules directly after `.job-preview .jp-apply:hover`:

```css
.job-preview .jp-actions { display: flex; gap: 7px; flex-shrink: 0; }
.job-preview .jp-save {
  border: 0; background: var(--bg2); border-radius: var(--radius-pill);
  padding: 9px 14px; font-family: inherit; font-weight: 600; font-size: 13px;
  color: var(--text2); cursor: default;
}
.job-preview .jp-save:hover { background: var(--border); }

/* Fit banner (spec lines 116-120). Two colours live only here: the deep
   violet the copy is set in, and the gradient's top stop. Scoped to this
   rule rather than promoted to :root, since nothing else uses them. */
.job-preview .jp-fit {
  --fit-fg:       #3a2fa8;
  --fit-grad-top: #f3f1ff;
  margin: 0 24px 20px; border-radius: 14px;
  background: linear-gradient(180deg, var(--fit-grad-top), var(--accent-tint));
  padding: 14px 16px; display: grid;
  grid-template-columns: auto minmax(0,1fr) auto; gap: 14px; align-items: center;
}
.job-preview .jp-fit-pill {
  font-size: 11.5px; font-weight: 600; background: var(--accent); color: #fff;
  padding: 5px 11px; border-radius: var(--radius-pill); white-space: nowrap;
}
.job-preview .jp-fit-copy { color: var(--fit-fg); min-width: 0; font-size: 13px; }
.job-preview .jp-fit-copy b { font-family: var(--font-mono), monospace; font-weight: 500; }
.job-preview .jp-fit-action {
  border: 0; background: var(--bg); color: var(--accent-hover);
  border-radius: var(--radius-pill); padding: 8px 13px; font-family: inherit;
  font-weight: 600; font-size: 12.5px; white-space: nowrap; cursor: default;
  box-shadow: 0 1px 2px rgba(59,47,168,.14);
}
.job-preview .jp-fit-action:hover { background: #f6f5ff; }
```

Then replace the three description rules that currently carry the old type scale:

```css
/* Real descriptions arrive as one unstructured blob and often carry their own
   headings. The design has no wrapper heading — it splits the prose into
   "What you will do" / "What we look for" micro-headings, which we cannot
   synthesise — so instead any heading the source already contains is styled
   the way the design styles its own (spec lines 126, 130). */
.job-preview .jp-description h1,
.job-preview .jp-description h2,
.job-preview .jp-description h3 {
  font-size: 12px; font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: var(--text4);
  margin: 22px 0 8px; line-height: 1.3;
}
.job-preview .jp-description h1:first-child,
.job-preview .jp-description h2:first-child,
.job-preview .jp-description h3:first-child { margin-top: 0; }
.job-preview .jp-description ul, .job-preview .jp-description ol { padding-left: 18px; margin: .5rem 0; }
.job-preview .jp-description li { margin-bottom: 5px; }
.job-preview .jp-description p { margin-bottom: 12px; }
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm run home-spec:test
npm run demo-fit:test
```

Expected: `home spec ok`, `demo-fit ok`

- [ ] **Step 7: Verify it renders**

With the dev server running at 1440px:
- The preview header shows `Save` in grey then `Apply ↗` in dark, 7px apart.
- Below the header sits the violet gradient banner: a solid violet pill, the copy in deep violet with the score in mono, and a white `+ Auto-apply queue` button on the right.
- **Click a "Low fit" card.** The banner must read "Low fit", not "Strong fit". If the two disagree, `JobCard` and `JobPreview` are not hashing the same slug — stop and fix it.
- The description begins with prose, no "About this role" heading; any headings inside it are small, uppercase and grey.
- Confirm the page now has exactly one `<h1>`:

```bash
curl -s http://localhost:4100/jobs | grep -o '<h1' | wc -l
```

Expected: `1`

- [ ] **Step 8: Commit**

```bash
git add components/JobPreview.jsx app/globals.css scripts/test-home-spec.mjs
git commit -m "feat(home): preview Save button, fit banner and description type

Also demotes the preview title to h2, leaving the hero as the page's
single h1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Header pixel pass

**Files:**
- Modify: `app/globals.css`, `scripts/test-home-spec.mjs`

**Interfaces:**
- Consumes: tokens from `:root`.
- Produces: nothing. `components/SiteNavbar.jsx` is **not** modified — the link set stays as it is by decision (design doc, decision 4), and every remaining divergence is CSS.

Spec: `direction-c.html` lines 37–59. The header is already close: `max-width:1440px`, `padding:12px 24px`, `gap:14px`, the logo at `15.5px/600/-.015em` with `#8b8d99` on the sub-word, and the whole `.header-search` block already match. Four things do not.

- [ ] **Step 1: Append the failing assertions**

Add to `scripts/test-home-spec.mjs`, before the dead-rule loop:

```js
// ─── Header (spec lines 37-59) ───
decl(".site-header .inner", "max-width: 1440px");
decl(".site-header .inner", "padding: 12px 24px");
decl(".site-header .inner", "gap: 14px");
decl(".site-header", "background: rgba(244, 244, 246, .86)");
decl(".site-header .logo-word", "font-size: 15.5px");
decl(".site-header .logo-word", "letter-spacing: -.015em");
decl(".header-search", "height: 38px");
decl(".header-search", "padding: 0 6px 0 14px");
decl(".header-search button", "height: 28px");
decl(".header-search button", "padding: 0 14px");

// The divider is #e7e7ec in the design — a hair lighter than --border
// (#eaeaef), which is what it currently uses.
decl(".header-search-divider", "background: #e7e7ec");

// Nav gap is 2px in the design, not .25rem (4px).
decl(".site-header .nav-links", "gap: 2px");
decl(".site-header .nav-links", "flex: 0 1 auto");
decl(".site-header .nav-discover > summary", "padding: 7px 10px");
decl(".site-header .nav-discover > summary", "border-radius: 8px");

// The logo's drop-shadow is a leftover from the pre-Direction-C header; the
// design's logo is flat.
assert.ok(
  !rule(".site-header .logo img").includes("drop-shadow"),
  "the design's logo carries no drop-shadow"
);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run home-spec:test`
Expected: FAIL — `.header-search-divider should declare "background: #e7e7ec"`

- [ ] **Step 3: Apply the four corrections**

In `app/globals.css`:

```css
.header-search-divider {
  width: 1px; height: 18px;
  /* #e7e7ec, not --border (#eaeaef): the design uses a slightly lighter
     hairline inside the search pill than it does for surface edges. */
  background: #e7e7ec;
  flex-shrink: 0;
}
```

```css
.site-header .logo img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}
```

(the `filter: drop-shadow(...)` line is deleted — it predates Direction C and the design's logo is flat)

```css
.site-header .nav-links {
  display: none;
  /* 0 1 auto with min-width:0 and overflow:hidden, per spec line 46: the nav
     yields space to the search field rather than pushing it below its
     min-width when the viewport tightens. */
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}
```

Leave the `display: none` and the breakpoint that reveals `.nav-links` untouched — that is existing responsive behaviour, not a spec divergence.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run home-spec:test`
Expected: PASS — `home spec ok`

- [ ] **Step 5: Verify it renders**

At 1440px, the header nav items sit 2px apart, the search pill's inner divider is a touch lighter than the card borders around it, and the logo mark has no shadow under it. Nothing in the nav has moved or disappeared — `Jobs`, `Remote Jobs`, `Categories`, `Salary Explorer`, `Discover ▾` and `Services` are all still there and still navigate.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css scripts/test-home-spec.mjs
git commit -m "fix(design): header hairline, nav gap and flat logo per spec

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Responsive — phone hero, chip strip, phone cards

**Files:**
- Modify: `app/globals.css`, `scripts/test-home-spec.mjs`

**Interfaces:**
- Consumes: the `.home-shell`, `.home-hero`, `.hh-wide` / `.hh-narrow` classes from Task 2; `.filter-bar` and `.job-card` from Task 3.
- Produces: nothing new.

Spec: `direction-c.html` line 420 (the phone hero, inside the `C Mobile` screen).

**Read this before writing any media query.** `app/globals.css` already carries a `@media (max-width: 900px)` rule for `.jobs-layout` and `.job-preview`, with a comment stating it is the one rule governing the split pane and that `--preview-breakpoint` on `:root` is its source of truth. Do not touch it, do not duplicate it, and do not put hero or card rules inside it. The new rules below target different elements at a different threshold and are additive.

The `641–900px` band is **an inference, not a spec value** — the design has no tablet screen. The desktop hero keeps its type scale there and only collapses to one column.

- [ ] **Step 1: Append the failing assertions**

Add to `scripts/test-home-spec.mjs`, before the dead-rule loop:

```js
// ─── Responsive (spec line 420 for the phone hero) ───
// Media-query bodies are not addressable by the rule() helper, so these
// assertions check the flattened file for the query and its contents.
assert.ok(flat.includes("@media (max-width: 640px)"), "missing the phone breakpoint");
const phoneStart = flat.indexOf("@media (max-width: 640px)");
const nextQuery = flat.indexOf("@media", phoneStart + 10);
// Bounded at the next @media so a needle cannot match unrelated CSS further
// down the file and pass this vacuously.
const phone = flat.slice(phoneStart, nextQuery === -1 ? undefined : nextQuery);
for (const needle of [
  "border-radius: 18px",     // hero on phone
  "padding: 18px",           // hero on phone
  "width: 220px",            // glow on phone
  "top: -70px",              // glow on phone
  "font-size: 18px",         // headline on phone
  "letter-spacing: -.02em",  // headline on phone
  "min-height: 46px",        // full-width CTA
  "flex-wrap: nowrap",       // filter chip strip
  "overflow-x: auto",        // filter chip strip
]) {
  assert.ok(phone.includes(needle), `phone breakpoint should carry "${needle}"`);
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run home-spec:test`
Expected: FAIL — `missing the phone breakpoint`

- [ ] **Step 3: Add the tablet collapse**

In `app/globals.css`, immediately after the hero block from Task 2:

```css
/* 641-900px is an inference, not a spec value: the design has no tablet
   screen. The hero keeps its desktop type scale and only stops being
   two-column, so the CTAs sit under the copy instead of squeezing it. */
@media (max-width: 900px) {
  .home-hero { grid-template-columns: minmax(0,1fr); gap: 18px; }
  .home-hero .hh-cta { flex-wrap: wrap; }
}
```

- [ ] **Step 4: Add the phone treatment**

Directly after it:

```css
/* Phone values are read from the design's own mobile screen (spec line 420),
   which is not a narrower desktop hero: it drops the second CTA and shortens
   both strings. The copy swap is CSS-only — both variants are already in the
   markup (components/HomeHero.jsx) so there is no hydration branch. */
@media (max-width: 640px) {
  .home-shell { padding: 8px 18px 40px; }

  .home-hero { border-radius: 18px; padding: 18px; margin-bottom: 14px; }
  .home-hero .hh-glow { right: -60px; top: -70px; width: 220px; height: 220px; }
  .home-hero .hh-badge { gap: 6px; padding: 4px 10px; font-size: 11px; margin-bottom: 10px; }
  .home-hero .hh-dot { width: 5px; height: 5px; }
  .home-hero .hh-title { font-size: 18px; line-height: 1.25; letter-spacing: -.02em; margin-bottom: 6px; }
  .home-hero .hh-sub { font-size: 12.5px; margin-bottom: 14px; }
  .home-hero .hh-wide { display: none; }
  .home-hero .hh-narrow { display: inline; }
  .home-hero .hh-cta { display: block; }
  .home-hero .hh-cta-primary { width: 100%; padding: 13px; min-height: 46px; }
  /* The design's phone hero carries one CTA, not two. */
  .home-hero .hh-cta-ghost { display: none; }

  /* Filters become a horizontal strip that bleeds to both edges rather than
     wrapping onto three rows. The negative margin cancels .home-shell's 18px
     so the strip scrolls edge to edge, the way the design's does. */
  .filter-bar {
    flex-wrap: nowrap;
    overflow-x: auto;
    margin-inline: -18px;
    padding-inline: 18px;
    scrollbar-width: none;
  }
  .filter-bar::-webkit-scrollbar { display: none; }
  .filter-count, .filter-toggle, .filter-select, .filter-clear, .sort-select { white-space: nowrap; flex-shrink: 0; }
  /* The spacer would eat the whole scroll width in a nowrap strip. */
  .filter-spacer { display: none; }

  .job-card {
    border-radius: 16px; padding: 14px;
    box-shadow: 0 1px 2px rgba(21,23,28,.05), 0 0 0 1px rgba(21,23,28,.05);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run home-spec:test`
Expected: PASS — `home spec ok`

- [ ] **Step 6: Verify all three widths**

With the dev server running, check each width in the browser and confirm:

- **1440px** — two-column hero, two CTAs, split pane visible.
- **900px** — hero is one column with the CTAs beneath the copy at full desktop type size; the preview pane is gone and cards fill the width; the filter bar still wraps.
- **390px** — hero is the compact card: 18px radius, smaller glow, `18px` headline reading "…every role ranked by fit.", subcopy reading "3 free scans · no card", one full-width `Upload resume` button. The filter row scrolls sideways as a single line of chips and reaches both screen edges. Cards are 16px-radius. Tapping a card **navigates to the job page** rather than doing nothing — that is `JobsSplitView`'s existing breakpoint gate; if a tap does nothing, the 900px rule has been disturbed.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css scripts/test-home-spec.mjs
git commit -m "feat(home): phone hero, filter chip strip and tablet collapse

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: The pixel gate

**Files:**
- Modify: none expected. Any file the measurements prove wrong.

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: a verified page and a clean production build.

**Why this is measurement, not a screenshot diff.** The design file is a `.dc.html`: `<x-dc>` custom elements, `sc-for` loops and `{{ }}` bindings that only resolve under the canvas runtime in `support.js`, which the Global Constraints forbid porting. Opened in a plain browser it renders nothing usable, so there is no honest screenshot to diff against. What *is* available is the spec's exact declared values — so the gate reads the live computed styles and compares them to those numbers directly. That is stricter than a visual diff, not weaker: it catches a 1px padding error a screenshot comparison would miss.

- [ ] **Step 1: Start a clean dev server**

```bash
npm run dev
```

Open the Browser pane at `http://localhost:4100/jobs` and set the viewport to 1440px wide.

- [ ] **Step 2: Run the measurement probe**

Execute this in the page. It compares live computed styles against the spec's declared values and returns only the mismatches.

```js
const EXPECTED = [
  [".home-shell",              { maxWidth: "1440px", paddingTop: "8px", paddingLeft: "24px", paddingBottom: "56px" }],
  [".home-hero",               { borderTopLeftRadius: "20px", paddingTop: "26px", paddingLeft: "30px", marginBottom: "18px", columnGap: "28px" }],
  [".home-hero .hh-glow",      { width: "360px", height: "360px", top: "-120px", right: "-80px" }],
  [".home-hero .hh-badge",     { fontSize: "11.5px", paddingTop: "5px", paddingLeft: "11px", marginBottom: "14px" }],
  [".home-hero .hh-title",     { fontSize: "26px", maxWidth: "640px", lineHeight: "31.2px" }],
  [".home-hero .hh-sub",       { fontSize: "14px", maxWidth: "560px", color: "rgb(167, 168, 179)" }],
  [".home-hero .hh-cta",       { columnGap: "9px" }],
  [".home-hero .hh-cta-primary", { paddingTop: "12px", paddingLeft: "20px", fontSize: "13.5px" }],
  [".filter-bar",              { columnGap: "7px", marginBottom: "14px" }],
  [".jobs-layout",             { columnGap: "16px" }],
  [".job-list",                { rowGap: "8px" }],
  [".job-card",                { borderTopLeftRadius: "14px", paddingTop: "13px", paddingLeft: "16px" }],
  [".job-card .jc-avatar",     { width: "32px", height: "32px", borderTopLeftRadius: "10px" }],
  [".job-card .jc-name",       { fontSize: "14.5px" }],
  [".job-card .jc-foot",       { paddingLeft: "43px" }],
  [".fit-badge",               { fontSize: "11.5px", paddingTop: "3px", paddingLeft: "9px" }],
  [".pager",                   { paddingTop: "6px", fontSize: "12px" }],
  [".pager-btn",               { width: "28px", height: "28px" }],
  [".job-preview",             { borderTopLeftRadius: "18px", position: "sticky", top: "64px" }],
  [".job-preview .jp-body",    { paddingTop: "22px", paddingLeft: "24px", paddingBottom: "18px" }],
  [".job-preview .jp-title",   { fontSize: "23px" }],
  [".job-preview .jp-pill",    { paddingTop: "4px", paddingLeft: "11px", fontSize: "12px" }],
  [".job-preview .jp-fit",     { paddingTop: "14px", paddingLeft: "16px", borderTopLeftRadius: "14px", columnGap: "14px" }],
  [".job-preview .jp-fit-pill",{ fontSize: "11.5px", paddingTop: "5px", paddingLeft: "11px" }],
  [".job-preview .jp-footer",  { paddingTop: "14px", paddingLeft: "24px", fontSize: "13px" }],
  [".site-header .inner",      { maxWidth: "1440px", paddingTop: "12px", paddingLeft: "24px", columnGap: "14px" }],
  [".header-search",           { height: "38px" }],
];

const problems = [];
for (const [selector, expected] of EXPECTED) {
  const el = document.querySelector(selector);
  if (!el) { problems.push(`${selector}: NOT RENDERED`); continue; }
  const actual = getComputedStyle(el);
  for (const [prop, want] of Object.entries(expected)) {
    if (actual[prop] !== want) problems.push(`${selector} ${prop}: ${actual[prop]} (want ${want})`);
  }
}
problems.length ? problems : "all measurements match the spec";
```

Expected: `"all measurements match the spec"`. Every line it returns instead is a real divergence — fix the CSS it names, reload, and re-run until the probe is clean. Do not accept a mismatch as "close enough"; that is the whole point of this task.

- [ ] **Step 3: Check the mono treatment**

Every numeric in the design is IBM Plex Mono. Confirm the four that carry it on this page actually resolve to it:

```js
[".job-card .jc-posted", ".job-card .jc-salary", ".pager-range", ".filter-count b"]
  .map((s) => [s, getComputedStyle(document.querySelector(s)).fontFamily]);
```

Expected: every entry names an IBM Plex Mono family. A result falling back to a generic monospace means the font variable did not reach that element.

- [ ] **Step 4: Check the console and the network**

Read the browser console: there must be **no hydration mismatch warning**. That warning is the specific failure mode `lib/demo-fit.js` was designed around, so its presence means the hash is reading something unstable — investigate before proceeding.

Read the network requests: selecting a card should fire exactly one `/jobs/api/jobs/preview?slug=…` request. At 390px wide, selecting a card should fire **none**, because the pane is hidden.

- [ ] **Step 5: Capture the three widths**

Screenshot at 1440px, 900px and 390px. These are for the requester's eye, not for the gate — the measurements above are the gate. Confirm by looking that the hero glow bleeds off the top-right corner, badges vary between cards, and the violet banner sits directly under the preview header.

- [ ] **Step 6: Run the whole test suite**

```bash
npm run demo-fit:test
npm run home-spec:test
npm run design-tokens:test
npm run format:test
```

Expected: `demo-fit ok`, `home spec ok`, `design tokens ok`, `format ok`.

- [ ] **Step 7: Production build**

Stop the dev server first — both write `.next` and the collision surfaces as a misleading `Cannot find module './chunks/…'`.

```bash
rm -rf .next && npm run build
```

Expected: build completes with no errors. Then confirm the demo switch works in a real build:

```bash
NEXT_PUBLIC_DEMO_FIT=false rm -rf .next && NEXT_PUBLIC_DEMO_FIT=false npm run build
```

Start it and confirm the page still renders correctly with no badges, no fit banner, `Sort: best fit` disabled, and no scan pips — the layout must not collapse or leave holes where they were. Then rebuild without the variable.

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix(home): close measured gaps against the C Home spec

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Out of scope

Carried from the design doc, recorded so nobody widens the plan mid-flight:

- The `C Resume ATS`, `C Matches`, `C Auto-apply`, `C Upgrade` and `C Remote` screens. Each needs its own spec and plan.
- Real resume scoring, fit matching, saved jobs and the auto-apply queue. `Save` and `+ Auto-apply queue` are visual only here.
- The marketing page at `/home`.
- `assets/leadnear-logo.svg` still being blue `#0D6EFD` against violet `#5b4ef0` — an open brand question carried over from the earlier plan.
