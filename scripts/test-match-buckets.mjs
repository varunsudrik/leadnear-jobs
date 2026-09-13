import assert from "node:assert/strict";
import { bucketJobs } from "../lib/match-buckets.js";
import { fitFor } from "../lib/demo-fit.js";

// Enough slugs that all three tiers appear; fitFor spreads ~20/20/60.
const jobs = Array.from({ length: 120 }, (_, i) => ({
  db_id: i,
  job_slug: `job-${i}`,
  title: `Role ${i}`,
  company: `Company ${i}`,
}));

const b = bucketJobs(jobs);

// Every job lands in exactly one bucket, and nothing is invented or dropped.
assert.equal(b.strong.length + b.good.length + b.low.length, jobs.length);
assert.equal(b.counts.total, jobs.length);
assert.equal(b.counts.strong, b.strong.length);
assert.equal(b.counts.good, b.good.length);
assert.equal(b.counts.low, b.low.length);
assert.ok(b.counts.strong > 0 && b.counts.good > 0 && b.counts.low > 0, "all three tiers should be represented");

// Placement agrees with fitFor — the same hash the job card uses, so a job
// badged "Strong fit" on the home page cannot appear under Good here.
for (const row of b.strong) assert.equal(fitFor(row.job_slug), "strong");
for (const row of b.good)   assert.equal(fitFor(row.job_slug), "good");
for (const row of b.low)    assert.equal(fitFor(row.job_slug), "low");

// Each row carries its tier and its explanation, so the view does no lookup.
for (const row of [...b.strong, ...b.good, ...b.low]) {
  assert.ok(["strong", "good", "low"].includes(row.tier));
  assert.equal(typeof row.why, "string");
  assert.ok(row.why.length > 0);
}

// Order within a bucket follows the input order, so "newest first" survives.
const strongSlugs = b.strong.map((r) => r.job_slug);
assert.deepEqual(strongSlugs, [...strongSlugs].sort(
  (a, x) => jobs.findIndex((j) => j.job_slug === a) - jobs.findIndex((j) => j.job_slug === x)
));

// An empty cohort buckets cleanly rather than throwing — /matches renders an
// empty state from these zeros.
const empty = bucketJobs([]);
assert.deepEqual(empty.counts, { strong: 0, good: 0, low: 0, total: 0 });
assert.deepEqual(empty.strong, []);

// A job with no slug cannot be tiered; it must be dropped, not defaulted into
// Low, which would read as a judgement of the job.
const unslugged = bucketJobs([{ db_id: 1, job_slug: "" }]);
assert.equal(unslugged.counts.total, 0);

console.log("match-buckets ok");
