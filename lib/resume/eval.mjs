// Runs the fixture cases against any model id and reports per-case results.
// Not a unit test: it needs a real API key and costs a fraction of a cent.
//
// The comparison logic (evaluateCase/hasInventedSkills) is split out from the
// fetching (runEval) on purpose: this harness cannot be mutation-tested
// against a live model, but its own scoring logic can and must be — a
// harness whose scoring is untested is not worth much. See
// scripts/test-resume-eval.mjs for the network-free tests against these.
import { readFileSync } from "node:fs";
import { extractResume } from "./extract.mjs";

const CASES_URL = new URL("../../scripts/fixtures/eval-cases.json", import.meta.url);

export function loadCases() {
  return JSON.parse(readFileSync(CASES_URL, "utf8"));
}

// Pure: given one fixture case and the extraction result for its text,
// decide pass/fail. No network, no fetching — safe to call directly with a
// stubbed `got` in tests.
export function evaluateCase(c, got) {
  if (!got.ok) return { name: c.name, pass: false, note: `extract failed: ${got.reason}` };

  const skills = got.skills.map((s) => s.toLowerCase());
  // `expectSkills` misses cost a fixture point but never the build: a model
  // that under-reports is disappointing, not dangerous.
  const missing = (c.expectSkills || []).filter((s) => !skills.includes(s.toLowerCase()));
  // `forbidSkills` is the important half: a skill here that shows up in the
  // result was never in the resume text, so the model invented it.
  const invented = (c.forbidSkills || []).filter((s) => skills.includes(s.toLowerCase()));
  const impact = (got.impact || []).map((i) => i.bullet.toLowerCase()).join(" ");
  const impactMissing = Boolean(c.expectImpactContains && !impact.includes(c.expectImpactContains.toLowerCase()));
  const impactWrong = Boolean(c.forbidImpactContains && impact.includes(c.forbidImpactContains.toLowerCase()));

  const pass = !missing.length && !invented.length && !impactMissing && !impactWrong;
  return { name: c.name, pass, missing, invented, impactMissing, impactWrong };
}

// The one failure mode that must break the build (spec D7): a user cannot
// tell a fabricated skill from a real one, so any invented skill anywhere in
// the run fails it, independent of the overall pass rate.
export function hasInventedSkills(details) {
  return details.some((d) => d.invented && d.invented.length > 0);
}

export async function runEval({ model } = {}) {
  const cases = loadCases();
  const details = [];

  for (const c of cases) {
    // `model` is threaded straight through to extractResume, which threads
    // it straight through to chat() — this is the whole point of the
    // harness: switching the model under test is passing a different string
    // here, not editing extract.mjs.
    const got = await extractResume(c.text, { model });
    details.push(evaluateCase(c, got));
  }

  return {
    model: model || "default",
    cases: cases.length,
    passed: details.filter((d) => d.pass).length,
    failed: details.filter((d) => !d.pass).length,
    details,
  };
}
