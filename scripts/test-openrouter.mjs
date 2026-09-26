import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

delete process.env.OPENROUTER_API_KEY;
const { isAiConfigured, chat } = await import("../lib/ai/openrouter.mjs");

// Unkeyed must degrade explicitly, never throw and never invent an answer.
assert.equal(isAiConfigured(), false);
const off = await chat({ system: "s", user: "u" });
assert.deepEqual(off, { ok: false, reason: "unconfigured" });

// Regression: chat(null) must not throw, even though null is not undefined.
const nullArg = await chat(null);
assert.deepEqual(nullArg, { ok: false, reason: "unconfigured" });

// Regression: chat() with no arguments must not throw.
const noArg = await chat();
assert.deepEqual(noArg, { ok: false, reason: "unconfigured" });

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
assert.equal(JSON.parse(seen.init.body).model, "google/gemini-2.5-flash-lite");

// A non-2xx response is reported, not thrown. The stub deliberately has no
// .json() method, so an implementation that reads the body before checking
// response.ok would throw here instead of reporting "http".
globalThis.fetch = async () => ({ ok: false, status: 429, text: async () => "rate limited" });
const mod2 = await import(`../lib/ai/openrouter.mjs?v=${Date.now()}b`);
const err = await mod2.chat({ system: "s", user: "u" });
assert.equal(err.ok, false);
assert.equal(err.reason, "http");

// A rejected fetch (DNS failure, connection refused, offline) must also be
// caught and reported, never left to bubble up as an uncaught rejection.
// This is the third leg of the ok:false contract ("network") and, unlike the
// two cases above, nothing else in this file exercises it — without this
// case an implementation missing its try/catch entirely would still pass.
globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
const mod3 = await import(`../lib/ai/openrouter.mjs?v=${Date.now()}c`);
const netErr = await mod3.chat({ system: "s", user: "u" });
assert.equal(netErr.ok, false);
assert.equal(netErr.reason, "network");

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

// reasoningEffort "none" turns thinking off explicitly; the default above stays "low".
sent = null;
const m4b = await import(`../lib/ai/openrouter.mjs?v=${Date.now()}f`);
await m4b.chat({ system: "s", user: "u", reasoningEffort: "none" });
assert.deepEqual(sent.reasoning, { enabled: false });

// Without a schema there must be no response_format key at all: an empty
// object is sent as {} and rejected by the API.
sent = null;
const m5 = await import(`../lib/ai/openrouter.mjs?v=${Date.now()}e`);
await m5.chat({ system: "s", user: "u" });
assert.equal("response_format" in sent, false);

// RESUME_MODEL is read at import time, so `?v=` cache-busting cannot reach it:
// openrouter.mjs imports model.mjs with a bare specifier that always resolves
// to the cached instance. A child process starts with an empty module cache,
// which is the only way to observe the override.
const overridden = execFileSync(
  process.execPath,
  ["--input-type=module", "-e", "import('./lib/resume/model.mjs').then(m => console.log(m.MODEL))"],
  { env: { ...process.env, RESUME_MODEL: "test/override-model" }, encoding: "utf8" }
).trim();
assert.equal(overridden, "test/override-model");

// And with the variable absent it must fall back to the real default, so this
// pair fails if the `||` is dropped in either direction.
const fallbackEnv = { ...process.env };
delete fallbackEnv.RESUME_MODEL;
const fallback = execFileSync(
  process.execPath,
  ["--input-type=module", "-e", "import('./lib/resume/model.mjs').then(m => console.log(m.MODEL))"],
  { env: fallbackEnv, encoding: "utf8" }
).trim();
assert.equal(fallback, "google/gemini-2.5-flash-lite");

console.log("openrouter ok");
