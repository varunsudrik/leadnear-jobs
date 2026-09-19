// Skips cleanly without a key so it can live in the normal test list, and
// reports rather than asserts a pass rate: this measures the model, not our
// code.
//
// The one thing here that IS asserted is the harness's own scoring logic.
// We cannot mutation-test against a live model in CI, but evaluateCase and
// hasInventedSkills are pure functions and every one of the checks below
// fails if the code under test is reverted to a naive version (see the
// comment on each block).
import assert from "node:assert/strict";
import { evaluateCase, hasInventedSkills, runEval, loadCases } from "../lib/resume/eval.mjs";

// Capture the real API key and fetch before sections 2–3 delete them, so we
// can restore them for section 4's live evaluation.
const REAL_KEY = process.env.OPENROUTER_API_KEY;
const NATIVE_FETCH = globalThis.fetch;

// --- 1. evaluateCase: the comparison logic, exercised with stubbed
//        extraction results. No network, no API key. -------------------

const noInvention = {
  name: "no-invention",
  expectSkills: ["Excel", "PowerPoint"],
  forbidSkills: ["Python", "SQL", "Tableau"],
};

// A clean extraction — every expected skill present, nothing forbidden —
// must pass. If evaluateCase ever starts comparing case-sensitively this
// fails, because the fixture's own casing wouldn't round-trip either.
const clean = evaluateCase(noInvention, { ok: true, skills: ["excel", "PowerPoint"], impact: [] });
assert.equal(clean.pass, true, "a clean extraction must pass");
assert.equal(clean.missing.length, 0);
assert.equal(clean.invented.length, 0);
assert.equal(hasInventedSkills([clean]), false, "a clean result must not trip the invented-skill gate");

// A model that reports a forbidden skill invented it — this is the failure
// mode the whole task exists to catch loudly. If evaluateCase stops
// filtering `forbidSkills` against the result (e.g. always returns
// invented: []), this fails.
const invented = evaluateCase(noInvention, { ok: true, skills: ["Excel", "PowerPoint", "Python"], impact: [] });
assert.equal(invented.pass, false, "a fabricated skill must fail the case");
assert.deepEqual(invented.invented, ["Python"]);
assert.equal(hasInventedSkills([invented]), true, "an invented skill must trip the gate");
assert.equal(
  hasInventedSkills([clean, invented]),
  true,
  "one invented case must flip the aggregate gate even alongside a passing case"
);

// Missing a real skill is a quality problem, not a fabrication problem: it
// must fail the fixture's own pass/fail but must NOT trip the
// hasInventedSkills gate. This is the distinction the brief calls out
// explicitly — a model that misses real skills is preferable to one that
// invents plausible ones — so if hasInventedSkills is ever implemented as
// `!pass` instead of checking `invented` specifically, this fails.
const missingOnly = evaluateCase(
  { name: "missing-only", expectSkills: ["Docker"], forbidSkills: ["Rust"] },
  { ok: true, skills: [], impact: [] }
);
assert.equal(missingOnly.pass, false, "a missing expected skill still fails the case");
assert.deepEqual(missingOnly.missing, ["Docker"]);
assert.equal(missingOnly.invented.length, 0);
assert.equal(hasInventedSkills([missingOnly]), false, "a merely missed skill must not fail the build");

// Impact detection: a vague bullet the model should have flagged, and a
// measured bullet it must not mistake for one.
const impactCase = { name: "impact-detection", expectImpactContains: "billing", forbidImpactContains: "32%" };
const impactGood = evaluateCase(impactCase, {
  ok: true, skills: [],
  impact: [{ bullet: "Responsible for the billing service", why: "no metric given" }],
});
assert.equal(impactGood.pass, true, "a correctly flagged vague bullet must pass");
const impactMissed = evaluateCase(impactCase, { ok: true, skills: [], impact: [] });
assert.equal(impactMissed.pass, false, "missing the vague bullet must fail the case");
assert.equal(impactMissed.impactMissing, true);
const impactFlaggedMeasured = evaluateCase(impactCase, {
  ok: true, skills: [],
  impact: [{ bullet: "Cut infra cost by 32% in one quarter", why: "flagged in error" }],
});
assert.equal(impactFlaggedMeasured.pass, false, "flagging an already-measured bullet must fail the case");
assert.equal(impactFlaggedMeasured.impactWrong, true);

// A failed extraction must surface as a failing case with a note, never
// throw and never silently count as a pass.
const extractFailed = evaluateCase(noInvention, { ok: false, reason: "network" });
assert.equal(extractFailed.pass, false);
assert.match(extractFailed.note, /extract failed: network/);

console.log("evaluateCase logic ok");

// --- 2. runEval's own orchestration, still with no network reachable: with
//        no OPENROUTER_API_KEY configured, extractResume's chat() call
//        short-circuits before ever calling fetch (isAiConfigured() is
//        false), so every case comes back ok:false deterministically. This
//        exercises runEval's aggregation (cases/passed/failed) without
//        stubbing fetch at all. --------------------------------------

delete process.env.OPENROUTER_API_KEY;
const fixtureCount = loadCases().length;
const unconfigured = await runEval({});
assert.equal(unconfigured.cases, fixtureCount);
assert.equal(unconfigured.passed, 0, "every case must fail when extraction is unconfigured");
assert.equal(unconfigured.failed, fixtureCount);
assert.ok(
  unconfigured.details.every((d) => !d.pass && /extract failed: unconfigured/.test(d.note)),
  "every detail must carry the unconfigured reason, not a silent pass"
);
assert.equal(hasInventedSkills(unconfigured.details), false, "an unconfigured run must never look like invention");

console.log("runEval offline aggregation ok");

// --- 3. runEval must actually thread `model` down to the wire. Without
//        this, the eval harness would silently report on the default model
//        no matter what it was asked to test — the entire point of Task 10.
//        Mock fetch rather than hit the network. -----------------------

process.env.OPENROUTER_API_KEY = "test-key";
const VALID = JSON.stringify({
  skills: ["Go"],
  impact: [{ bullet: "Worked on the pipeline", why: "no outcome stated" }],
  headline: "Passes most ATS filters.",
  subline: "Keyword coverage is the drag.",
});
const sentModels = [];
globalThis.fetch = async (_url, init) => {
  sentModels.push(JSON.parse(init.body).model);
  return { ok: true, json: async () => ({ choices: [{ message: { content: VALID } }] }) };
};
const evalMod = await import(`../lib/resume/eval.mjs?v=${Date.now()}-wire`);
const wireOut = await evalMod.runEval({ model: "openai/gpt-5-mini" });
assert.equal(sentModels.length, fixtureCount, "runEval must call extraction once per fixture case");
assert.ok(
  sentModels.every((m) => m === "openai/gpt-5-mini"),
  `every request must use the override model, got ${JSON.stringify(sentModels)}`
);
assert.equal(wireOut.model, "openai/gpt-5-mini");
delete process.env.OPENROUTER_API_KEY;
delete globalThis.fetch;

console.log("runEval model threading ok");

// --- 4. The real thing: skip cleanly with no key, otherwise run a live
//        report and fail the build on invention. -----------------------

// Restore the real API key and fetch if they were present at startup, so the
// live evaluation can run. (Sections 2–3 delete them to test the unconfigured
// and mocked paths.)
if (REAL_KEY) {
  process.env.OPENROUTER_API_KEY = REAL_KEY;
} else {
  delete process.env.OPENROUTER_API_KEY;
}
if (NATIVE_FETCH) {
  globalThis.fetch = NATIVE_FETCH;
}

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
if (hasInventedSkills(out.details)) {
  console.error("\nModel invented skills that are not in the resume. Do not ship this model.");
  process.exit(1);
}
console.log("resume-eval ok");
