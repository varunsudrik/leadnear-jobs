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

// A response missing `headline` must be caught on its own, independent of
// the {} case above — otherwise a validator that only special-cases an
// empty object would let this through with headline === undefined.
const MISSING_HEADLINE = JSON.stringify({
  skills: ["Go"],
  impact: [],
  subline: "Keyword coverage is the drag.",
});
globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: MISSING_HEADLINE } }] }) });
const m3b = await import(`../lib/resume/extract.mjs?v=${Date.now()}c2`);
const missingHeadline = await m3b.extractResume("x");
assert.equal(missingHeadline.ok, false);
assert.equal(missingHeadline.reason, "invalid");

// A response where `skills` is a string instead of an array must also be
// caught on its own — a validator that only checks truthiness/presence of
// each field (rather than its type) would wrongly accept this.
const SKILLS_AS_STRING = JSON.stringify({
  skills: "Go, PostgreSQL, gRPC",
  impact: [],
  headline: "Passes most ATS filters.",
  subline: "Keyword coverage is the drag.",
});
globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: SKILLS_AS_STRING } }] }) });
const m3c = await import(`../lib/resume/extract.mjs?v=${Date.now()}c3`);
const skillsAsString = await m3c.extractResume("x");
assert.equal(skillsAsString.ok, false);
assert.equal(skillsAsString.reason, "invalid");

// `null` is valid JSON but not an object: JSON.parse succeeds and then
// `payload.skills` must not be allowed to throw. The other non-object JSON
// values (array, number, boolean) already fall through to "invalid" by
// accident of `typeof`/`Array.isArray`; pin all four so a future refactor
// cannot silently turn one back into an uncaught crash.
for (const content of ["null", "[]", "42", "true"]) {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
  const mod = await import(`../lib/resume/extract.mjs?v=${Date.now()}-nonobj-${content}`);
  const result = await mod.extractResume("x");
  assert.equal(result.ok, false, `content ${content} should be ok:false`);
  assert.equal(result.reason, "invalid", `content ${content} should be reason "invalid"`);
}

// impact entries missing `why` must not survive into an ok:true result — the
// documented contract is Array<{bullet, why}> by exact field name, and a
// later task reads `why` unconditionally.
const MIXED_IMPACT = JSON.stringify({
  skills: ["Go"],
  impact: [
    { bullet: "Reduced errors", why: "no baseline given" },
    { bullet: "Owned the migration" }, // missing `why`
  ],
  headline: "Passes most ATS filters.",
  subline: "Keyword coverage is the drag.",
});
globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: MIXED_IMPACT } }] }) });
const m6 = await import(`../lib/resume/extract.mjs?v=${Date.now()}f`);
const mixed = await m6.extractResume("x");
assert.equal(mixed.ok, true);
assert.equal(mixed.impact.length, 1);
assert.equal(mixed.impact[0].bullet, "Reduced errors");
assert.equal(mixed.impact[0].why, "no baseline given");

// `bullet`/`why` are coerced to strings, matching how `skills` is already
// coerced via String(s).trim() — a numeric bullet must not reach the caller
// as a number.
const NUMERIC_BULLET = JSON.stringify({
  skills: ["Go"],
  impact: [{ bullet: 12345, why: "no outcome stated" }],
  headline: "Passes most ATS filters.",
  subline: "Keyword coverage is the drag.",
});
globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: NUMERIC_BULLET } }] }) });
const m7 = await import(`../lib/resume/extract.mjs?v=${Date.now()}g`);
const numericBullet = await m7.extractResume("x");
assert.equal(numericBullet.ok, true);
assert.equal(numericBullet.impact.length, 1);
assert.equal(numericBullet.impact[0].bullet, "12345");
assert.equal(typeof numericBullet.impact[0].bullet, "string");

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
// A deliberately fake id, so this stays distinguishable from whatever the
// real default happens to be. Naming a real model here coupled the test to
// the current default and broke the moment the default changed.
await m5.extractResume("x", { model: "test/override-model" });
assert.equal(usedModel, "test/override-model");
// ...and omitting it must fall through to the configured default, not
// undefined. Compared against MODEL rather than a literal, so a future
// model change does not require editing this assertion.
const { MODEL } = await import("../lib/resume/model.mjs");
await m5.extractResume("x");
assert.equal(usedModel, MODEL, `expected the configured default, got ${usedModel}`);

console.log("resume-extract ok");
