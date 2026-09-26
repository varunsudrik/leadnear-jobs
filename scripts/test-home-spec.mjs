import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

// Comments are prose, not CSS. app/globals.css names class selectors in its
// comments ("superseded the old .pagination block", ...), so every text
// search below runs against comment-stripped source — otherwise documenting a
// removed rule would fail this suite. Replaced with a space, not "", so
// stripping a comment can never weld two tokens together.
const css = raw.replace(/\/\*[\s\S]*?\*\//g, " ");

// Collapse whitespace so assertions are not hostage to line wrapping.
const flat = css.replace(/\s+/g, " ");

// Base CSS: the same stylesheet with every @media block removed.
//
// rule() used to resolve against `flat`, i.e. whichever occurrence of a
// selector came FIRST in file order. That is not always the base rule:
// ".site-header .inner {" first appears inside the 601-1080px portrait media
// query (max-width: 920px), so three prescribed assertions about the base
// rule's 1440px / 12px 24px / 14px were deleted rather than asserted against
// the wrong body. Stripping media blocks first makes "the base rule" the
// thing rule() actually returns, and those three are restored below.
//
// A brace-counting scan rather than the review's suggested
// /@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g: that regex handles exactly one
// level of nesting, so a media block containing @keyframes or a nested
// @supports would silently strip the wrong span and leave stray declarations
// behind — the same class of bug this whole helper exists to close. Verified
// byte-identical to that regex on today's stylesheet (all 16 media blocks
// removed, all 4 top-level @keyframes kept); this version simply cannot drift.
function stripMediaBlocks(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const at = source.indexOf("@media", i);
    if (at === -1) { out += source.slice(i); break; }
    out += source.slice(i, at);
    const open = source.indexOf("{", at);
    if (open === -1) { out += source.slice(at); break; }
    let depth = 1;
    let j = open + 1;
    while (j < source.length && depth > 0) {
      if (source[j] === "{") depth += 1;
      else if (source[j] === "}") depth -= 1;
      j += 1;
    }
    out += " ";
    i = j;
  }
  return out;
}
const base = stripMediaBlocks(flat);
assert.ok(!base.includes("@media"), "media blocks should be fully stripped from the base CSS");

// Assertions are scoped to a single rule body, never to the whole file. A
// bare flat.includes("max-width: 1440px") would pass on .site-header's own
// 1440px and prove nothing about the home shell.
//
// The lookup is anchored on a rule boundary — start of source, or the "}", ";"
// or "," that ends whatever came before. An unanchored indexOf(".mb-apply {")
// also matches inside ".mb-card.good .mb-apply {", and ".mb-role"/".mb-sub"
// have the same exposure against their ".mb-card.low" overrides. Today those
// resolve correctly only because the base rule happens to be authored first,
// and this change moved a large block of CSS, so file order is not something
// to lean on. "," stays a boundary so a selector named second in a list
// (".a, .b {") is still findable; a descendant or compound prefix is separated
// by a space or a dot, neither of which is one.
function rule(selector) {
  const anchored = new RegExp(
    `(?:^|[};,])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`
  );
  const match = anchored.exec(base);
  assert.ok(match, `missing base rule: ${selector}`);
  const start = match.index + match[0].length;
  return base.slice(start, base.indexOf("}", start));
}
function decl(selector, declaration) {
  assert.ok(
    rule(selector).includes(declaration),
    `${selector} should declare "${declaration}"`
  );
}

// ─── Page shell (spec line 61) ───
decl(".console-shell", "max-width: 1440px");
decl(".console-shell", "padding: 8px 24px 56px");

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

// ─── Pagination ───
// Spec line 103's range-left/arrows-right row was replaced (product decision,
// 2026-09-26) by a centred numbered pager modelled on naukri.com, with the
// range beneath it, so a viewer can jump to a page.
decl(".pager", "flex-direction: column");
decl(".pager", "align-items: center");
decl(".pager-controls", "justify-content: center");
decl(".pager", "padding: 6px 6px 0");
decl(".pager", "font-size: 12px");
decl(".pager-range", "font-family: var(--font-mono), monospace");
decl(".pager-controls", "gap: 6px");
decl(".pager-step", "border-radius: var(--radius-pill)");
decl(".pager-step", "height: 40px");
decl(".pager-num", "height: 36px");
decl(".pager-num", "border-radius: var(--radius-pill)");

// ─── Preview pane (spec lines 105-133) ───
decl(".job-preview .jp-actions", "gap: 7px");
decl(".job-preview .jp-save", "padding: 9px 14px");
decl(".job-preview .jp-save", "font-size: 13px");
decl(".job-preview .jp-description h3", "text-transform: uppercase");
decl(".job-preview .jp-description h3", "margin: 22px 0 8px");
decl(".job-preview .jp-description ol", "padding-left: 18px");
decl(".job-preview .jp-description li", "margin-bottom: 5px");
decl(".job-preview .jp-description p", "margin-bottom: 12px");

// ─── Header (spec lines 37-59) ───
// .site-header .inner is declared twice: the base rule (1440px) and the
// 601-1080px portrait media query (920px, deliberate for that viewport). The
// media query comes FIRST in file order, which is why rule() now resolves
// against media-stripped CSS — see stripMediaBlocks above. These three are
// the values Task 7 exists to pin, and they read the base rule.
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

// ─── Responsive (spec line 420 for the phone hero) ───
// Media-query bodies are not addressable by the rule() helper, so these
// assertions check the flattened file for the query and its contents.
assert.ok(flat.includes("@media (max-width: 640px)"), "missing the phone breakpoint");
const phoneStart = flat.indexOf("@media (max-width: 640px)");
// Bounded by brace-counting from the block's own opening "{" to the matching
// closing "}" — the same technique stripMediaBlocks uses above — rather than
// "up to the next @media". Task 7 relocated this block, which pushed the next
// @media roughly 350 lines further down the file; a "next @media" bound would
// sweep in the filter bar, pagination, job-detail and footer sections, and a
// needle could then match unrelated CSS there and pass this vacuously (this
// is exactly how the pre-existing "letter-spacing: -.02em" needle below would
// have started matching .job-detail-title instead of only the phone hero).
const phoneOpen = flat.indexOf("{", phoneStart);
let phoneDepth = 1;
let phoneEnd = phoneOpen + 1;
while (phoneEnd < flat.length && phoneDepth > 0) {
  if (flat[phoneEnd] === "{") phoneDepth += 1;
  else if (flat[phoneEnd] === "}") phoneDepth -= 1;
  phoneEnd += 1;
}
const phone = flat.slice(phoneStart, phoneEnd);
for (const needle of [
  "border-radius: 18px",     // hero on phone
  "padding: 18px",           // hero on phone
  "width: 220px",            // glow on phone
  "top: -70px",              // glow on phone
  "font-size: 18px",         // headline on phone
  "letter-spacing: -.02em",  // headline on phone
  "flex-wrap: nowrap",       // filter chip strip
  "overflow-x: auto",        // filter chip strip
  ".console-shell .filter-bar", // the strip must be scoped, not global
]) {
  assert.ok(phone.includes(needle), `phone breakpoint should carry "${needle}"`);
}

// Everything below asserts against a named rule's OWN body inside the phone
// slice, not a bare substring of it. A bare substring proves only that the
// text appears SOMEWHERE in the block, which for a shared value proves
// nothing: "grid-template-columns: minmax(0,1fr)" is also produced by
// .rs-body and .rs-keywords, and "min-height: 46px" is asserted twice below
// for two different controls.
//
// Anchored the same way rule() is, and for the same reason.
function phoneRule(selector) {
  const anchored = new RegExp(
    `(?:^|[{};,])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`
  );
  const match = anchored.exec(phone);
  assert.ok(match, `${selector} should have its own rule inside the phone breakpoint`);
  const start = match.index + match[0].length;
  return phone.slice(start, phone.indexOf("}", start));
}
function phoneDecl(selector, declaration) {
  assert.ok(
    phoneRule(selector).includes(declaration),
    `the phone breakpoint's ${selector} should declare "${declaration}"`
  );
}

// The hero's single CTA and the resume screen's `View matches` are both
// full-width 46px pills. Neither is a <button>: HomeHeroCta renders a <Link>
// while the demo layer is on, and an inline element ignores both of these
// declarations outright — getComputedStyle still reports them, which is how a
// 122px-wide, 43px-tall CTA passed this gate. Hence the display assertion.
phoneDecl(".home-hero .hh-cta-primary", "width: 100%");
phoneDecl(".home-hero .hh-cta-primary", "min-height: 46px");
decl(".home-hero .hh-cta button, .home-hero .hh-cta a", "display: inline-flex");
decl(".home-hero .hh-cta button, .home-hero .hh-cta a", "justify-content: center");
phoneDecl(".rs-view-matches", "min-height: 46px");
phoneDecl(".rs-view-matches", "width: 100%");

// The resume screen's four dimension bars go 2-up.
phoneDecl(".rs-parts", "grid-template-columns: 1fr 1fr");

// ─── Phone header search (spec line 419) ───
// The header form is the only free-text search on a phone, so the rules that
// make it reachable there are pinned the same way the phone hero is. Bounded
// at the next @media so a needle cannot match unrelated CSS further down.
assert.ok(flat.includes("@media (max-width: 767px)"), "missing the phone header breakpoint");
const headerStart = flat.indexOf("@media (max-width: 767px)");
const afterHeader = flat.indexOf("@media", headerStart + 10);
const phoneHeader = flat.slice(headerStart, afterHeader === -1 ? undefined : afterHeader);
assert.ok(
  !/\.header-search\s*\{[^}]*display:\s*none/.test(phoneHeader),
  "the header search must not be hidden on phones — it is the only free-text search there"
);
for (const needle of [
  "flex-wrap: wrap",  // the header takes a second row
  "height: 42px",     // the design's phone pill
  "padding: 0 14px",  // the design's phone pill
  "flex: 1 0 100%",   // full-width row of its own
  ".header-search .header-search-location",  // location field hidden, title kept
  ".header-search .header-search-submit",    // the text button goes, the magnifier stays
]) {
  assert.ok(phoneHeader.includes(needle), `phone header breakpoint should carry "${needle}"`);
}

// ─── Rules the redesign removes (they styled markup that no longer exists) ───
// `flat` is already comment-stripped (see the top of this file), so writing
// "removed the old .pagination block" in a comment no longer fails the suite —
// only a real selector does. The negative lookahead keeps ".pagination" from
// matching a longer name like ".pagination-range", while still catching every
// live form of the dead rule itself: ".pagination {", ".pagination a {",
// ".pagination.is-x {", and ".job-list .pagination {".
for (const dead of [".directory-hero", ".directory-content", ".results-header", ".results-count", ".pagination", ".page-btn"]) {
  const selector = new RegExp(`${dead.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
  assert.ok(!selector.test(flat), `dead rule still present: ${dead}`);
}

// ─── Resume scan (spec 195-252) ───
decl(".rs-title", "font-size: 22px");
decl(".rs-body", "grid-template-columns: minmax(250px,1fr) minmax(0,2.2fr)");
// Task 8 replaced the mock's rasterised, page-shaped .rs-preview (aspect-ratio
// 8.5/11 — a rendered PDF page) with ParsedTextView's .rs-parsed: rendering a
// PDF to an image isn't viable on serverless (spec deviations table). These
// three pin the properties that make that honest replacement work, not just
// exist: its own scroll container rather than stretching the page, the
// monospace type that backs "see it the way a parser reads it", and the
// flagged-line highlight that is the panel's whole point.
decl(".rs-parsed", "overflow: auto");
decl(".rs-parsed", "max-height: 420px");
decl(".rs-parsed-t", "font-family: var(--font-mono), monospace");
decl(".rs-parsed-line.is-bad", "background: var(--bad-bg)");
decl(".rs-score", "padding: 24px");
decl(".rs-score", "gap: 32px");
decl(".rs-donut", "width: 132px");
decl(".rs-donut-inner", "width: 106px");
decl(".rs-donut-score", "font-size: 38px");
decl(".rs-parts", "grid-template-columns: repeat(4,1fr)");
decl(".rs-track", "height: 5px");
decl(".rs-fix", "grid-template-columns: 18px 70px minmax(0,1fr) 44px");
decl(".rs-fix", "padding: 13px 18px");
decl(".rs-sev.high", "background: var(--bad-bg)");
decl(".rs-sev.medium", "background: var(--warn-bg)");
decl(".rs-sev.low", "background: var(--bg2)");
decl(".rs-keywords", "grid-template-columns: 1fr 1fr");
decl(".rs-chip.found", "background: var(--ok-bg)");
decl(".rs-chip.missing", "background: var(--bad-bg)");

console.log("home spec ok");
