import assert from "node:assert/strict";
import {
  STRONG_COVERAGE,
  GOOD_COVERAGE,
  MIN_JOB_SKILLS,
  sanitizeSkills,
  tierFor,
  bucketByCoverage,
  matchReason,
  postingKey,
  dedupePostings,
  cardReason,
  rankJobs,
} from "../lib/resume/match.mjs";
import { buildIndex } from "../lib/skills/vocab.mjs";

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

// ─── postingKey / dedupePostings ────────────────────────────────────────────
assert.equal(postingKey({ company_slug: "dialpad", title: "Sr. Software Engineer, Applied AI" }), "dialpad|sr software engineer applied ai");
assert.equal(postingKey({ company_slug: "", company: "Acme Corp", title: "Data Engineer" }), "acme corp|data engineer");
assert.equal(postingKey({ company_slug: "", company: "", title: "Data Engineer" }), null);
assert.equal(postingKey({ company_slug: "beta", title: "सॉफ्टवेयर इंजीनियर" }), null);
{
  const rows = [
    { db_id: 1, company_slug: "dialpad", title: "Sr. Software Engineer, Applied AI", locations: ["denver"] },
    { db_id: 2, company_slug: "acme", title: "Data Engineer", locations: [] },
    { db_id: 3, company_slug: "dialpad", title: "sr software engineer applied ai", locations: ["austin", "denver"] },
    { db_id: 4, company_slug: "", company: "", title: "Data Engineer", locations: [] },
    { db_id: 5, company_slug: "", company: "", title: "Data Engineer", locations: [] },
    { db_id: 6, company_slug: "beta", title: "सॉफ्टवेयर इंजीनियर", locations: [] },
    { db_id: 7, company_slug: "beta", title: "सॉफ्टवेयर इंजीनियर", locations: [] },
  ];
  const deduped = dedupePostings(rows);
  // Punctuation and case differences merge; rows with no usable key never do.
  assert.deepEqual(deduped.map((r) => r.db_id), [1, 2, 4, 5, 6, 7]);
  // The first (highest-ranked) row represents the group; locations union in order.
  assert.deepEqual(deduped[0].locations, ["denver", "austin"]);
  assert.equal(deduped[0].postingCount, 2);
  assert.equal(deduped[1].postingCount, 1);
  // The input is not mutated.
  assert.deepEqual(rows[0].locations, ["denver"]);
  assert.equal("postingCount" in rows[0], false);
}
assert.deepEqual(dedupePostings(undefined), []);

// ─── cardReason ─────────────────────────────────────────────────────────────
assert.equal(cardReason({ matched: ["Go"], missing: ["Rust"], postingCount: 3 }), "Covers 1 of 2 requirements · missing Rust · 3 postings");
assert.equal(cardReason({ matched: ["Go"], missing: ["Rust"], postingCount: 1 }), "Covers 1 of 2 requirements · missing Rust");

// ─── rankJobs availability (no database: a stand-in pool) ───────────────────
// rankJobs takes the app's shared pool from globalThis (lib/pg-pool.mjs), so a
// stand-in there answers its queries. Three states the page must tell apart.
{
  const index = buildIndex({ skills: [{ canonical: "Python", aliases: ["Python"] }] });
  const standIn = (answer) => {
    globalThis._postgresPool = { query: async (sql) => answer(sql) };
  };
  // Tables exist, extraction ran, nothing shares the skills: available, empty.
  standIn((sql) => ({ rows: sql.includes("AS scanned") ? [{ scanned: true }] : [] }));
  let result = await rankJobs({ skills: ["Python", "Cobol"], index });
  assert.deepEqual(result, { rows: [], skills: ["Python"], unknown: ["Cobol"], available: true, candidateTotal: 0 });
  // Tables migrated but never extracted (mid-rollout): unavailable, not "no matches".
  standIn((sql) => ({ rows: sql.includes("AS scanned") ? [{ scanned: false }] : [] }));
  result = await rankJobs({ skills: ["Python"], index });
  assert.equal(result.available, false);
  // Tables not migrated at all: Postgres undefined_table (42P01) -> unavailable.
  standIn(() => { throw Object.assign(new Error('relation "job_skills" does not exist'), { code: "42P01" }); });
  result = await rankJobs({ skills: ["Python"], index });
  assert.equal(result.available, false);
  // Any other database error still surfaces.
  standIn(() => { throw Object.assign(new Error("connection reset"), { code: "08006" }); });
  await assert.rejects(rankJobs({ skills: ["Python"], index }), /connection reset/);
  // Rows come back with the candidate count computed before the LIMIT.
  standIn(() => ({ rows: [{ db_id: 1, candidateTotal: 1291 }, { db_id: 2, candidateTotal: 1291 }] }));
  result = await rankJobs({ skills: ["Python"], index });
  assert.equal(result.candidateTotal, 1291);
  assert.equal(result.rows.length, 2);
  // No recognised skills never touches the database.
  standIn(() => { throw new Error("must not query"); });
  result = await rankJobs({ skills: ["Cobol"], index });
  assert.deepEqual(result, { rows: [], skills: [], unknown: ["Cobol"], available: true, candidateTotal: 0 });
  delete globalThis._postgresPool;
}

console.log("resume-match ok");
