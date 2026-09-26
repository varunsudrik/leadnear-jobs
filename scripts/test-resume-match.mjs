import assert from "node:assert/strict";
import {
  STRONG_COVERAGE,
  GOOD_COVERAGE,
  MIN_JOB_SKILLS,
  sanitizeSkills,
  tierFor,
  bucketByCoverage,
  matchReason,
} from "../lib/resume/match.mjs";

// ─── sanitizeSkills ─────────────────────────────────────────────────────────
assert.deepEqual(sanitizeSkills(["React", " Node.js ", "", "  ", "React", "node.js"]), ["React", "Node.js"]);
assert.deepEqual(sanitizeSkills(["TypeScript", "typescript", "TYPESCRIPT"]), ["TypeScript"]);
assert.deepEqual(sanitizeSkills(null), []);
assert.deepEqual(sanitizeSkills("not an array"), []);

// ─── tierFor ────────────────────────────────────────────────────────────────
// Boundaries are >=, so a coverage exactly on a threshold gets that tier.
assert.equal(tierFor(STRONG_COVERAGE, MIN_JOB_SKILLS), "strong");
assert.equal(tierFor(STRONG_COVERAGE - 0.0001, MIN_JOB_SKILLS), "good");
assert.equal(tierFor(GOOD_COVERAGE, 10), "good");
assert.equal(tierFor(GOOD_COVERAGE - 0.0001, 10), "low");
// Thin-job guard: full coverage of a 2-skill job is Good, never Strong.
assert.equal(tierFor(1, MIN_JOB_SKILLS - 1), "good");
assert.equal(tierFor(0, 0), "low");
assert.ok(GOOD_COVERAGE < STRONG_COVERAGE, "GOOD_COVERAGE must be the lower threshold");
assert.equal(MIN_JOB_SKILLS, 3);

// ─── bucketByCoverage ───────────────────────────────────────────────────────
{
  const buckets = bucketByCoverage([
    { db_id: 1, coverage: 0.9, jobSkillCount: 5 },
    { db_id: 2, coverage: 1, jobSkillCount: 2 }, // thin: Good
    { db_id: 3, coverage: 0.5, jobSkillCount: 8 },
    { db_id: 4, coverage: 0.1, jobSkillCount: 4 },
    { db_id: 5 }, // no coverage at all: Low, not a crash
  ]);
  assert.deepEqual(buckets.strong.map((r) => r.db_id), [1]);
  assert.deepEqual(buckets.good.map((r) => r.db_id), [2, 3]); // ranked order kept
  assert.deepEqual(buckets.low.map((r) => r.db_id), [4, 5]);
  assert.deepEqual(buckets.strong[0], { db_id: 1, coverage: 0.9, jobSkillCount: 5, fit: "strong" });
  assert.equal(buckets.low[1].coverage, 0);
}
assert.deepEqual(bucketByCoverage([]), { strong: [], good: [], low: [] });
assert.deepEqual(bucketByCoverage(undefined), { strong: [], good: [], low: [] });

// ─── matchReason ────────────────────────────────────────────────────────────
// Missing skills arrive highest-IDF first from the query; the line names the
// first two — the gaps that cost the candidate the most.
assert.equal(
  matchReason({ matched: ["Go", "PostgreSQL", "Docker", "gRPC", "Linux"], missing: ["Terraform", "Kafka", "Jira"] }),
  "Covers 5 of 8 requirements · missing Terraform, Kafka"
);
assert.equal(matchReason({ matched: ["Go", "Docker"], missing: [] }), "Covers all 2 requirements");
assert.equal(matchReason({ matched: ["Go"], missing: [] }), "Covers its 1 listed requirement");
assert.equal(matchReason({ matched: [], missing: ["Go"] }), "Covers none of 1 requirement");
assert.equal(matchReason({}), "No listed requirements to compare");
assert.equal(matchReason(undefined), "No listed requirements to compare");
// A readout, never a percentage.
assert.doesNotMatch(matchReason({ matched: ["Go"], missing: ["Rust"] }), /%/);

console.log("resume-match ok");
