# Direction C — Home, Pixel-Perfect

**Status:** approved design, ready for an implementation plan.
**Source of truth:** `Direction C - Console Modern.dc.html`, screen `C Home`,
in Claude Design project `446589b8-8815-4932-a60a-7e41f6e8026c`. Local copy:
`docs/superpowers/specs/direction-c.html`, lines 61–135 (desktop) and 412–430
(the phone treatment inside `C Mobile`).

## Goal

Bring `/` — `app/page.jsx`, the job board — to a pixel-for-pixel match with the
`C Home` screen, and build the ATS-dependent affordances the design shows as
frontend only, with static demo values.

## Decisions taken before this document

Four questions were settled with the requester; they are recorded here because
every task below depends on them.

1. **"Home" means `C Home`, the job board at `/`** — not the marketing page at
   `/home`. The design has no marketing screen, so pixel-perfect can only refer
   to `C Home`.
2. **ATS affordances ship as static demo values**, matching the mock 1:1: a fit
   badge on every card, the violet fit banner in the preview, always-visible
   scan pips, and a selectable `Sort: best fit`. All fabricated content is
   confined to one module with one switch.
3. **CTAs are inert.** `Upload resume`, `How scoring works` and
   `+ Auto-apply queue` render pixel-identical but do not navigate. Scope stops
   at `C Home`; the Resume/ATS, Matches and Auto-apply screens are separate
   plans.
4. **The shared header is pixel-matched except for its link set.** Typography,
   spacing, pill sizes and hover states follow the mock; the app's real routes
   (`Jobs`, `Remote Jobs`, `Categories`, `Salary Explorer`, `Discover`,
   `Services`) stay, rather than being replaced by the mock's
   `Remote · Companies · Salaries · Matches · Auto-apply`, two of which point
   at routes that do not exist.

**Approach: surgical correction.** The component tree from the earlier
Direction C plan (Tasks 1–9) already matches the mock structurally. Each
divergence below is corrected in place. The hero and the pagination row are
written fresh, because they are replacements rather than edits. The token
layer, the split-pane grid, the single-sourced `--preview-breakpoint`, the
selection-validation effect and the preview's loading/empty/error states are
all left alone.

## Global constraints inherited from the earlier plan

These still hold and are repeated so this document stands on its own:

- Do not port `support.js`, `ios-frame.jsx`, or the dark canvas tab bar at spec
  line 24. They are canvas scaffolding, not product.
- Tailwind preflight stays disabled. Read `AGENTS.md` before touching
  `app/tailwind.css` or `tailwind.config.js`.
- Never run `npm run build` while `next dev` is running. Stop the dev server,
  `rm -rf .next`, then build.
- Tests are plain `node scripts/test-*.mjs` using `node:assert/strict`,
  registered in `package.json`. There is no Jest or Vitest and this plan adds
  none.
- Every numeric — counts, salary, scores, dates, pagination ranges — is
  IBM Plex Mono. This is structural to the design, not decoration.

## The measured divergences

Each row is a value read off the spec against the value currently in the repo.
This table is the work.

| # | Element | Current | Spec | Where |
|---|---|---|---|---|
| 1 | Page hero | `.directory-hero`: blue gradient, centered, `clamp(2.3rem,5vw,4rem)` h1, `1px solid #dbeafe` bottom border, contains `SearchBox` | dark card, see "Hero" below | `app/page.jsx`, `app/globals.css:956` |
| 2 | Section wrapper | `.container` `max-width:1160px`, `.directory-content` `padding-top:2rem` | `max-width:1440px; margin:0 auto; padding:8px 24px 56px` | `app/page.jsx` |
| 3 | Results header | `<h1 class="results-count">N jobs available</h1>` + "Browse remote jobs" link | absent; the count lives in the filter row | `app/page.jsx:43` |
| 4 | List gap | `.job-list { gap: .6rem }` = 9.6px | `gap: 8px` | `app/globals.css:296` |
| 5 | Card shadow | `var(--shadow)` = `0 1px 3px rgba(21,23,28,.06), 0 0 0 1px rgba(21,23,28,.05)` | `0 1px 2px rgba(21,23,28,.04), 0 0 0 1px rgba(21,23,28,.05)`; strong-fit rows keep `0 1px 2px rgba(21,23,28,.05), 0 0 0 1px rgba(91,78,240,.22)` | `app/globals.css:256` |
| 6 | Pagination | centered numbered pager, `radius:8px`, `margin-top:2rem` | see "Pagination" below | `components/Pagination.jsx` |
| 7 | Fit badge | omitted | on every card; see "Demo data" | `components/JobCard.jsx` |
| 8 | Preview Save button | omitted | `background:#f4f4f6; border-radius:999px; padding:9px 14px; font:600 13px; color:#3d3f4a`, `gap:7px` before Apply; hover `#eaeaef` | `components/JobPreview.jsx` |
| 9 | Preview fit banner | omitted | see "Fit banner" below | `components/JobPreview.jsx` |
| 10 | Description block | "About this role" heading; `h2` `1.1rem/700/var(--text)`; `ul` `padding-left:1.1rem`; `li` `.3rem`; `p` `.75rem` | no wrapper heading; `h2` `12px/600`, `letter-spacing:.06em`, uppercase, `#9a9aa4`, `margin:22px 0 8px`; `ul` `padding-left:18px`; `li` `margin-bottom:5px`; `p` `margin-bottom:12px` | `app/globals.css:386` |
| 11 | Scan pips | rendered only when signed in | always visible | `components/AuthNav.jsx` |

### Hero (spec lines 62–75)

```
container   position:relative; overflow:hidden; border-radius:20px;
            background:#15171c; color:#fff; padding:26px 30px;
            margin-bottom:18px; display:grid;
            grid-template-columns:minmax(0,1fr) auto; gap:28px;
            align-items:center
glow        position:absolute; right:-80px; top:-120px; 360x360;
            border-radius:999px;
            background:radial-gradient(circle,rgba(122,105,255,.5),transparent 65%)
badge       inline-flex; gap:7px; background:rgba(255,255,255,.1);
            border-radius:999px; padding:5px 11px; font:600 11.5px;
            letter-spacing:.03em; color:#c9c2ff; margin-bottom:14px
            dot: 6x6; border-radius:999px; background:#a99cff
h1          font:600 26px; letter-spacing:-.025em; line-height:1.2;
            margin-bottom:8px; max-width:640px; text-wrap:pretty
            "Drop your resume. Get an ATS score and every open role ranked by fit."
p           color:#a7a8b3; max-width:560px; font-size:14px
            "PDF or DOCX, up to 5 MB. Three free scans, no card. Your resume is
             never shared with employers."
cta row     position:relative; display:flex; gap:9px; align-items:center
cta 1       background:#fff; color:#15171c; border-radius:999px;
            padding:12px 20px; font:600 13.5px;
            box-shadow:0 6px 20px rgba(0,0,0,.28); hover background:#ecebff
            "Upload resume"
cta 2       background:rgba(255,255,255,.08); color:#fff; border-radius:999px;
            padding:12px 18px; font:600 13.5px;
            hover background:rgba(255,255,255,.16)
            "How scoring works"
```

The glow sits behind the content: the copy column and the CTA row both carry
`position:relative` so they paint above it, and the container clips it with
`overflow:hidden`.

Both CTAs are inert. They render as `<button type="button" disabled>` with
`aria-disabled="true"` and a `title` explaining that resume scoring is not live
yet, styled so `disabled` does not grey them out — the mock's appearance is the
requirement.

### Pagination (spec line 103)

```
row         display:flex; justify-content:space-between; align-items:center;
            padding:6px 6px 0; font-size:12px; color:#6b6d78
range       font-family:'IBM Plex Mono'; "1–20 of 128,431"
buttons     display:flex; gap:6px
button      border:0; background:#fff; box-shadow:0 0 0 1px rgba(21,23,28,.07);
            border-radius:999px; width:28px; height:28px
prev, at page 1:  color:#c3c3cb, no cursor:pointer  (disabled)
next:             cursor:pointer; font-weight:600;
                  hover background:#15171c; color:#fff
```

The range string is `((page-1)*pageSize)+1`–`min(page*pageSize, total)` of
`total.toLocaleString()`, with an en-dash (U+2013). `Pagination.jsx` currently
returns `null` when `totalPages <= 1`; the spec's row shows the range whenever
there are results, so the early return moves to "render the range, disable both
arrows". Both arrows are `<Link>`s today; the disabled edge becomes a
`<button disabled>` so it is not focusable or navigable.

### Fit banner (spec lines 116–120)

```
container   margin:0 24px 20px; border-radius:14px;
            background:linear-gradient(180deg,#f3f1ff,#ecebff);
            padding:14px 16px; display:grid;
            grid-template-columns:auto minmax(0,1fr) auto; gap:14px;
            align-items:center
pill        font:600 11.5px; background:#5b4ef0; color:#fff;
            padding:5px 11px; border-radius:999px; white-space:nowrap
copy        color:#3a2fa8; min-width:0; font-size:13px
            score inside it: font-family:'IBM Plex Mono'; font-weight:500
action      border:0; background:#fff; color:#4a3ee0; border-radius:999px;
            padding:8px 13px; font:600 12.5px; white-space:nowrap;
            box-shadow:0 1px 2px rgba(59,47,168,.14); hover background:#f6f5ff
            "+ Auto-apply queue"
```

The hero and banner introduce six colours that are not in the token layer and
appear nowhere else: `#c9c2ff` and `#a99cff` (hero badge text and dot),
`#a7a8b3` (hero subcopy), `rgba(122,105,255,.5)` (the glow), `#3a2fa8` and
`#f3f1ff` (banner text and gradient start). They are declared together as one
small scoped group at the top of the hero/banner CSS block — not promoted to
global tokens, since nothing else uses them, and not scattered inline, so a
later re-skin has one place to look.

## Demo data

New module `lib/demo-fit.js`. Everything fabricated on this page lives here and
nowhere else.

```js
export const DEMO_FIT = true;      // one line disables the whole layer
export const DEMO_SCANS_USED = 2;  // the mock's own default
export function fitFor(jobSlug) { /* "strong" | "good" | "low" | null */ }
export function bannerFor(tier)  { /* { label, copy, score } | null */ }
```

`fitFor` derives the tier from a **stable hash of the job slug**. Three
properties make this the right shape, and each of them rules out an easier
alternative:

- **Deterministic.** The same job carries the same badge on every render, so
  paging back and forth does not reshuffle the list. Rules out `Math.random()`.
- **SSR-safe.** `JobCard` is a client component fed by server-fetched data.
  Hashing a value that is already in the payload keeps server and client output
  identical. Rules out anything time-based or random, which would hydration-
  mismatch.
- **Shared between card and pane.** `JobPreview` calls the same `fitFor(slug)`,
  so a card badged "Low fit" cannot open a banner reading "Strong fit". Without
  this the demo reads as a bug rather than as a mock.

Distribution follows the mock's own ten fixtures — 2 strong, 2 good, 6 low —
by bucketing the hash across ten slots and mapping slots to tiers in that
proportion.

Tier tokens, taken verbatim from the design's `fitStyle()` (spec line 474), and
already present in `app/globals.css:290`:

| Tier | Badge background | Badge text | Card ring |
|---|---|---|---|
| `strong` | `#ecebff` | `#4a3ee0` | `0 0 0 1px rgba(91,78,240,.22)` |
| `good` | `#f4f4f6` | `#6b6d78` | default |
| `low` | `transparent` | `#9a9aa4` | default |

`bannerFor` returns tier-keyed static copy, in the mock's wording and register:

| Tier | Pill | Score | Copy |
|---|---|---|---|
| `strong` | Strong fit | 81 | Matches Go, PostgreSQL, gRPC and 6+ years. Missing Kubernetes. |
| `good` | Good fit | 64 | Matches the core stack. Two listed requirements are not evidenced. |
| `low` | Low fit | 38 | Little overlap with this posting's requirements. |

`Sort: best fit` becomes selectable and orders the current page by tier
(strong, good, low), replacing the `disabled` option in `components/Filters.jsx`.
It sorts the fetched page client-side only — it is a demo ordering, not a query.

Scan pips move out of the signed-in branch in `components/AuthNav.jsx` and
render for everyone, reading `DEMO_SCANS_USED` — two filled pips and
"1/3 free scans", matching the mock's `scansUsed: 2` default. This does mean a
signed-out visitor sees a quota they never spent; it is one constant away from
reading `3/3` if that trade is unwanted.

When `DEMO_FIT` is `false`, `fitFor` and `bannerFor` return `null`, badges and
banner render nothing, `Sort: best fit` returns to `disabled`, and the pips
return to signed-in-only. The page degrades to today's honest behaviour without
touching any component.

## Semantics and accessibility

- **Three `<h1>`s become one.** Today the page ships `.directory-hero h1`,
  `.results-count` and `.jp-title`. After this change the hero is the sole
  `<h1>`; `.jp-title` becomes an `<h2>` with identical styling, and
  `.results-count` is gone with the results header. No visual change; correct
  document outline.
- The description section keeps an `aria-label` now that its visible heading is
  removed.
- Inert CTAs carry `aria-disabled="true"` and an explanatory `title`.
- Fit badges are decorative demo content; they are announced as plain text and
  are not given a role.

## SEO note

Removing `.directory-hero` changes the `<h1>` of the indexed `/` route from
"Find your next opportunity" to the ATS headline, and removes the on-page
`SearchBox` in favour of the header's search form. That is what the design
specifies and what this plan builds. `metadata.title` and
`metadata.description` are unchanged, and `SearchBox` itself stays in the
repo — `app/search/page.jsx` still uses it. Flagged so the trade is a decision
rather than a side effect.

## Responsive

The split pane already collapses below `--preview-breakpoint` (900px) and the
preview is hidden outright; that rule is untouched and must not be duplicated.

The hero needs two treatments, because the mock's phone screen is not a
narrower desktop hero — it drops the second CTA and shortens both strings:

| | ≥901px (spec 62–75) | ≤640px (spec 420) |
|---|---|---|
| container | `radius:20px; padding:26px 30px; margin-bottom:18px` | `radius:18px; padding:18px; margin-bottom:14px` |
| glow | `360x360` at `right:-80px/top:-120px` | `220x220` at `right:-60px/top:-70px` |
| badge | `gap:7px; padding:5px 11px; 11.5px`; dot 6px | `gap:6px; padding:4px 10px; 11px`; dot 5px |
| headline | `26px/1.2/-.025em` — "…every **open** role ranked by fit." | `18px/1.25/-.02em` — "…every role ranked by fit." |
| subcopy | `14px` — full PDF/DOCX/5 MB line | `12.5px` — "3 free scans · no card" |
| CTAs | two, side by side, `gap:9px` | one, `width:100%; padding:13px; min-height:46px` |

Both copy variants render in the markup and are toggled with CSS
`display`, not JavaScript — no hydration branch, no layout shift, and the
strings stay in one file.

The 641–900px band is **an inference, not a spec value**: the design has no
tablet screen. The desktop hero keeps its type scale but the grid collapses to
one column and the CTA row wraps below the copy.

The filter row on phones becomes a horizontal chip strip —
`padding:0 18px 12px; gap:7px; overflow-x:auto`, chips `padding:7px 13px;
font-size:12.5px; white-space:nowrap` — and cards take `radius:16px;
padding:14px` with the list at `padding:0 18px 24px; gap:8px`.

## Files

| File | Change |
|---|---|
| `app/page.jsx` | modify — drop hero/results-header/`SearchBox`, swap `.container` for the 1440px section, mount `<HomeHero />` |
| `components/HomeHero.jsx` | create — dark ATS hero, both copy variants, two inert CTAs |
| `lib/demo-fit.js` | create — `DEMO_FIT`, `fitFor`, `bannerFor`, `DEMO_SCANS_USED` |
| `components/JobCard.jsx` | modify — fit badge from `fitFor(job.job_slug)` |
| `components/JobPreview.jsx` | modify — Save button, fit banner, description heading removal |
| `components/Pagination.jsx` | modify — mono range + two round arrows, `space-between` |
| `components/Filters.jsx` | modify — enable `Sort: best fit` behind `DEMO_FIT` |
| `components/AuthNav.jsx` | modify — pips always visible, read `DEMO_SCANS_USED` |
| `components/SiteNavbar.jsx` | modify — typography only; link set preserved |
| `app/globals.css` | modify — hero, pagination, banner, badge, description, gap and shadow corrections; remove dead `.directory-hero`/`.results-header` rules |
| `scripts/test-demo-fit.mjs` | create |
| `scripts/test-home-spec.mjs` | create |
| `package.json` | modify — register both test scripts |

`app/SearchBox.jsx` is **not** deleted; `app/search/page.jsx` still imports it.

## Verification

1. `node scripts/test-demo-fit.mjs` — determinism across repeated calls, the
   2/2/6 distribution over a large slug sample, card and pane agreeing for the
   same slug, and `DEMO_FIT = false` returning `null` from both exports.
2. `node scripts/test-home-spec.mjs` — asserts the load-bearing literals
   reached `app/globals.css`: section `1440px`, hero `20px` and `26px 30px`,
   glow `360px`, list gap `8px`, card shadow `0 1px 2px rgba(21,23,28,.04)`,
   the three badge pairs, pagination `28px`, banner gradient stops.
3. `npm run design-tokens:test` and `npm run format:test` still pass.
4. `rm -rf .next && npm run build` clean.
5. **The pixel check, which is the acceptance gate.** Render
   `docs/superpowers/specs/direction-c.html`'s `C Home` section standalone at
   1440px wide, screenshot it, screenshot `http://localhost:4100/jobs` at the
   same width, and walk the diff region by region: hero, filter row, first
   three cards, pagination row, preview header, fit banner, description,
   preview footer. Repeat at 900px and 390px. Reading the CSS is not the check;
   the comparison is.

## Explicitly out of scope

- The `C Resume ATS`, `C Matches`, `C Auto-apply`, `C Upgrade` and `C Remote`
  screens. Each needs its own spec and plan.
- Real resume scoring, fit matching, saved jobs, and the auto-apply queue.
  The Save button and `+ Auto-apply queue` are visual only in this plan.
- The marketing page at `/home`.
- `assets/leadnear-logo.svg` still being blue `#0D6EFD` against violet
  `#5b4ef0` — an open brand question carried over from the earlier plan.
