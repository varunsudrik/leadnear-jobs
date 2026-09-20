import assert from "node:assert/strict";
import {
  STRONG_OVERLAP,
  GOOD_OVERLAP,
  sanitizeSkills,
  tierFor,
  bucketByOverlap,
  matchReason,
} from "../lib/resume/match.mjs";

// ─── sanitizeSkills ─────────────────────────────────────────────────────────
// Free text (AI-extracted skills), not a guaranteed-clean array: blanks,
// surrounding whitespace and case-insensitive duplicates all show up in
// practice and would otherwise inflate/deflate the overlap denominator every
// other function here divides by.
assert.deepEqual(sanitizeSkills(["React", " Node.js ", "", "  ", "React", "node.js"]), ["React", "Node.js"]);
assert.deepEqual(sanitizeSkills([]), []);
assert.deepEqual(sanitizeSkills(null), []);
assert.deepEqual(sanitizeSkills(undefined), []);
assert.deepEqual(sanitizeSkills("not an array"), []);
// First occurrence wins on a case-insensitive dupe — keeps the resume's own
// original casing (e.g. "TypeScript") rather than a later, differently-cased
// repeat silently overwriting it.
assert.deepEqual(sanitizeSkills(["TypeScript", "typescript", "TYPESCRIPT"]), ["TypeScript"]);

// ─── tierFor ────────────────────────────────────────────────────────────────
// Boundaries are >=, not >, so a ratio sitting exactly on a threshold counts
// for the tier it names, not the one below it.
assert.equal(tierFor(STRONG_OVERLAP), "strong");
assert.equal(tierFor(STRONG_OVERLAP - 0.0001), "good");
assert.equal(tierFor(GOOD_OVERLAP), "good");
assert.equal(tierFor(GOOD_OVERLAP - 0.0001), "low");
assert.equal(tierFor(0), "low");
assert.equal(tierFor(1), "strong");
// The two constants must actually be ordered the way the tier ladder assumes,
// or every boundary assertion above would be checking a ladder that isn't
// there — this is the one assertion that fails if someone "tunes" GOOD_OVERLAP
// above STRONG_OVERLAP without noticing the tier logic silently inverts.
assert.ok(GOOD_OVERLAP < STRONG_OVERLAP, "GOOD_OVERLAP must be the lower threshold");

// ─── bucketByOverlap ────────────────────────────────────────────────────────
const SKILL_COUNT = 10;
const rows = [
  { db_id: 1, matchedSkills: ["a", "b", "c", "d", "e"] },   // 5/10 = 0.5  -> strong
  { db_id: 2, matchedSkills: ["a", "b", "c"] },              // 3/10 = 0.3  -> strong (>= 0.25)
  { db_id: 3, matchedSkills: ["a", "b"] },                   // 2/10 = 0.2  -> good
  { db_id: 4, matchedSkills: ["a"] },                        // 1/10 = 0.1  -> good (>= 0.1 boundary)
  { db_id: 5, matchedSkills: [] },                           // 0/10 = 0    -> low
  { db_id: 6 },                                              // no matchedSkills at all -> low, not a crash
];
const buckets = bucketByOverlap(rows, SKILL_COUNT);
assert.deepEqual(buckets.strong.map((r) => r.db_id), [1, 2]);
assert.deepEqual(buckets.good.map((r) => r.db_id), [3, 4]);
assert.deepEqual(buckets.low.map((r) => r.db_id), [5, 6]);
// Every bucketed row carries the annotation, and nothing from the source row
// was dropped in the process.
assert.deepEqual(
  buckets.strong[0],
  { db_id: 1, matchedSkills: ["a", "b", "c", "d", "e"], matchCount: 5, overlapRatio: 0.5, fit: "strong" }
);
assert.equal(buckets.low[1].matchCount, 0);
assert.equal(buckets.low[1].overlapRatio, 0);

// A resume that (somehow) contributed zero sanitized skills must not divide
// by zero and crash the page — every row falls to "low" instead of NaN
// propagating into a tier nothing recognizes.
const zeroSkillBuckets = bucketByOverlap([{ db_id: 9, matchedSkills: [] }], 0);
assert.equal(zeroSkillBuckets.low[0].overlapRatio, 0);
assert.equal(zeroSkillBuckets.low.length, 1);

// bucketByOverlap must tolerate the inputs rankJobs()'s own early return
// produces (empty rows), not just well-formed ones.
assert.deepEqual(bucketByOverlap([], 10), { strong: [], good: [], low: [] });
assert.deepEqual(bucketByOverlap(undefined, 10), { strong: [], good: [], low: [] });

// ─── matchReason ────────────────────────────────────────────────────────────
const skills = ["Node.js", "TypeScript", "React", "Docker"];
assert.equal(
  matchReason({ matchedSkills: ["Node.js", "TypeScript", "React", "Docker"] }, skills),
  "Matches all 4 of your skills"
);
assert.equal(
  matchReason({ matchedSkills: [] }, skills),
  "No overlap with your listed skills"
);
// The "missing" skill named is the first one from the ORIGINAL skills order
// the posting doesn't have — not the first alphabetically, not the last
// checked — because resumes list stronger/more prominent skills first, so
// that's the most useful one to call out as absent.
assert.equal(
  matchReason({ matchedSkills: ["Node.js", "React"] }, skills),
  "Matches 2 of 4 skills · missing TypeScript"
);
assert.equal(
  matchReason({ matchedSkills: ["TypeScript"] }, skills),
  "Matches 1 of 4 skills · missing Node.js"
);
// No skills at all to compare against (never happens via rankJobs in
// practice, since it early-returns before calling this, but a caller could
// still reach it directly) must not read past the end of an empty array.
assert.equal(matchReason({ matchedSkills: [] }, []), "No skills to match against");
// A row with no matchedSkills key at all (not just an empty array) must not
// throw on `.size` of a Set built from `undefined`.
assert.equal(matchReason({}, skills), "No overlap with your listed skills");

// The reason line is a factual readout, never a fabricated percentage or
// AI-sounding sentence — this is the assertion that would catch someone
// "improving" the copy into e.g. "Matches 50% of your skills".
assert.doesNotMatch(matchReason({ matchedSkills: ["Node.js", "React"] }, skills), /%/);

console.log("resume-match ok");
