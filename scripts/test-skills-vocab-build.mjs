import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MIN_SAMPLE_COUNT,
  SOFT_SKILLS,
  aggregateVocab,
  extractSkillsWithLlm,
  groundedSkills,
  isUsableDescription,
  renderVocabModule,
  selectProseAliases,
  stratifiedSample,
} from "../lib/skills/vocab-build.mjs";

// ─── stratifiedSample ───────────────────────────────────────────────────────
// 6 / 3 / 1 jobs from sources a / b / c, sample of 5: exact shares are
// 3 / 1.5 / 0.5. Floors give 3 / 1 / 0, one slot is left, b and c tie on a
// remainder of 0.5, and ties break on source name, so b gets it.
{
  const jobs = [
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ id: `a${i}`, source: "a" })),
    ...[0, 1, 2].map((i) => ({ id: `b${i}`, source: "b" })),
    { id: "c0", source: "c" },
  ];
  assert.deepEqual(stratifiedSample(jobs, 5), ["a0", "a1", "a2", "b0", "b1"]);
  // Each source's picks come from the front of its own list, in given order.
  assert.deepEqual(stratifiedSample(jobs, 20), jobs.map((j) => j.id));
  assert.deepEqual(stratifiedSample([], 3), []);
  assert.deepEqual(stratifiedSample(undefined, 3), []);
}

// ─── isUsableDescription ────────────────────────────────────────────────────
{
  const fixture = (md5) =>
    readFileSync(new URL(`./fixtures/job-descriptions/${md5}.html`, import.meta.url), "utf8");
  assert.equal(isUsableDescription(fixture("0215b108f224ed5ac1c4121c410dd754")), true); // lever
  assert.equal(isUsableDescription(fixture("01f40505eac208b71053b00e99eeb619")), false); // breezy placeholders
  assert.equal(isUsableDescription("<p>Too short to learn from.</p>"), false);
  assert.equal(isUsableDescription(null), false);
}

// ─── groundedSkills ─────────────────────────────────────────────────────────
// Only names the posting literally contains survive (case-insensitively).
assert.deepEqual(
  groundedSkills(
    [{ name: "SQL", canonical: "SQL" }, { name: "Tableau", canonical: "Tableau" }],
    "Strong sql skills"
  ),
  [{ name: "SQL", canonical: "SQL" }]
);
assert.deepEqual(groundedSkills(undefined, "x"), []);

// ─── aggregateVocab ─────────────────────────────────────────────────────────
const job = (...pairs) => ({ skills: pairs.map(([name, canonical]) => ({ name, canonical })) });
{
  const vocab = aggregateVocab([
    job(["K8s", "Kubernetes"], ["Excel", "Excel"]),
    job(["Kubernetes", "Kubernetes"], ["excel", "Excel"]),
    job(["kubernetes", "kubernetes"], ["Communication", "Communication"]),
    job(["Excel", "Excel"], ["Go", "Go"]),
    job(["Go", "Go"]),
    job(["Golang", "Go"], ["Go", "Go"]),
  ]);
  assert.deepEqual(vocab, [
    // Counted once per job, not per mention: "Go" appears twice in the last job.
    { canonical: "Excel", aliases: ["Excel", "excel"], sampleCount: 3 },
    { canonical: "Go", aliases: ["Go", "Golang"], sampleCount: 3 },
    // Canonical casing is the most frequent one; alias ties break in code-unit
    // order so the generated file is identical on every machine.
    { canonical: "Kubernetes", aliases: ["K8s", "Kubernetes", "kubernetes"], sampleCount: 3 },
  ]);
  // "Communication" is a soft skill and is dropped whatever its count.
  assert.ok(!vocab.some((s) => s.canonical === "Communication"));
}
assert.equal(MIN_SAMPLE_COUNT, 3);
assert.deepEqual(aggregateVocab([job(["Rust", "Rust"]), job(["Rust", "Rust"])]), []);
assert.equal(aggregateVocab([job(["Rust", "Rust"]), job(["Rust", "Rust"])], { minSampleCount: 2 })[0].sampleCount, 2);
// An alias two skills both claim goes to the one it was seen with most often.
{
  const vocab = aggregateVocab(
    [job(["Postgres", "PostgreSQL"]), job(["Postgres", "PostgreSQL"]), job(["Postgres", "Postgres DB"])],
    { minSampleCount: 1 }
  );
  assert.deepEqual(vocab.find((s) => s.canonical === "PostgreSQL").aliases, ["Postgres"]);
  assert.deepEqual(vocab.find((s) => s.canonical === "Postgres DB").aliases, []);
}
assert.ok(SOFT_SKILLS.has("problem solving"));
assert.deepEqual(aggregateVocab(undefined), []);

// ─── selectProseAliases ─────────────────────────────────────────────────────
{
  const sample = (text, ...listed) => ({
    text,
    canonicals: new Set(listed.map(([, canonical]) => canonical.toLowerCase())),
    names: new Set(listed.map(([name]) => name.toLowerCase())),
  });
  const samples = [
    // "Knowledge" appears in six texts; the model named a skill for it in one.
    sample("Knowledge of Python", ["Python", "Python"], ["Knowledge", "Knowledge Management"]),
    sample("Knowledge of Python", ["Python", "Python"]),
    sample("Knowledge of Python", ["Python", "Python"]),
    sample("Knowledge of Python", ["Python", "Python"]),
    sample("Knowledge of Python", ["Python", "Python"]),
    sample("Knowledge of accounts"),
    // "Azure" is filed under canonical "Azure", not "Microsoft Azure": still
    // agreement, because the surface name matches.
    ...[1, 2, 3, 4, 5].map(() => sample("Azure pipelines", ["Azure", "Azure"])),
  ];
  const selected = selectProseAliases(
    [
      { canonical: "Python", aliases: ["Python"], sampleCount: 5 },
      { canonical: "Knowledge Management", aliases: ["Knowledge"], sampleCount: 3 },
      { canonical: "Microsoft Azure", aliases: ["Azure"], sampleCount: 5 },
    ],
    samples
  );
  assert.deepEqual(selected.map((s) => s.proseAliases), [
    ["Python"], // 5 of 5
    ["Knowledge Management"], // canonical never matched (support 0) so kept; "Knowledge" 1 of 6: dropped
    ["Microsoft Azure", "Azure"],
  ]);
  // Everything else about the skill is carried through untouched.
  assert.deepEqual(selected[1].aliases, ["Knowledge"]);
  assert.deepEqual(selectProseAliases(undefined, samples), []);
}

// Aliases compete as they do in extraction: "Office" earns no credit for "MS
// Office" texts (the longer alias wins them) and is judged only on what it
// catches alone.
{
  const sample = (text, ...listed) => ({
    text,
    canonicals: new Set(listed.map(([, canonical]) => canonical.toLowerCase())),
    names: new Set(listed.map(([name]) => name.toLowerCase())),
  });
  const samples = [
    ...[1, 2, 3, 4, 5].map(() => sample("MS Office skills", ["MS Office", "Microsoft Office"])),
    ...[1, 2, 3, 4, 5].map(() => sample("Home Office stipend")),
  ];
  const [office] = selectProseAliases(
    [{ canonical: "Microsoft Office", aliases: ["MS Office", "Office"], sampleCount: 5 }],
    samples
  );
  assert.deepEqual(office.proseAliases, ["Microsoft Office", "MS Office"]);
}
// Aliases that may never match prose are left out of proseAliases entirely.
assert.deepEqual(
  selectProseAliases([{ canonical: "Chartered Accountant", aliases: ["CA"], sampleCount: 3 }], [])[0].proseAliases,
  ["Chartered Accountant"]
);

// ─── renderVocabModule ──────────────────────────────────────────────────────
{
  const source = renderVocabModule({ version: 1, skills: [{ canonical: "Go", aliases: ["Go"], sampleCount: 3 }] });
  assert.match(source, /^\/\/ Generated by scripts\/build-skill-vocab\.mjs/);
  const loaded = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  assert.deepEqual(loaded.default, { version: 1, skills: [{ canonical: "Go", aliases: ["Go"], sampleCount: 3 }] });
}

// ─── extractSkillsWithLlm without a key degrades, never throws ──────────────
{
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    assert.deepEqual(await extractSkillsWithLlm("Python"), { ok: false, reason: "unconfigured" });
  } finally {
    // Restore it: the resume eval harness once ran "offline" forever because a
    // test deleted this key and never put it back.
    if (saved !== undefined) process.env.OPENROUTER_API_KEY = saved;
  }
}

console.log("skills-vocab-build ok");
