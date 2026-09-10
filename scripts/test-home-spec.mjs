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
