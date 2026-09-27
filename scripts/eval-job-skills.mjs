// Measures extraction quality (spec §10) and checks the tier thresholds (§8).
//
//   npm run job-skills:eval                    precision/recall vs the model on 200 held-out jobs (~$0.05)
//   npm run job-skills:eval -- --calibrate     coverage distribution for test@test.com's latest scan
//   npm run job-skills:eval -- --calibrate --email=someone@example.com
//
// Held-out jobs come from the same salted order the vocabulary build drew
// from, skipping every sampled job (scripts/fixtures/skill-vocab-sample.json),
// so the vocabulary never saw them. The reference is the model reading the same
// text our extractor used — i.e. the per-job LLM extraction this replaces —
// mapped onto canonical names through the same index. It is an agreement
// measure, not ground truth: disagreements go to .cache/skill-eval/ to be
// adjudicated. Read-only against staging.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig } from "../lib/pg-config.mjs";
import { MODEL } from "../lib/resume/model.mjs";
import { DEFAULT_LIMIT, GOOD_COVERAGE, MIN_JOB_SKILLS, STRONG_COVERAGE, bucketByCoverage, rankJobs } from "../lib/resume/match.mjs";
import { skillsForDescription } from "../lib/skills/extract.mjs";
import { plainText, requirementsSection } from "../lib/skills/sections.mjs";
import { getIndex, vocabVersion } from "../lib/skills/vocab.mjs";
import {
  LIVE_JOBS_IN_SAMPLE_ORDER_SQL,
  PROMPT_VERSION,
  extractSkillsWithLlm,
  groundedSkills,
  isUsableDescription,
} from "../lib/skills/vocab-build.mjs";

loadEnvFile(".env.local");

const HELD_OUT = 200;
// Raw agreement with the model is a regression floor, not a precision target:
// the model's own lists are incomplete. Adjudicating a random 60 of vocabulary
// v4's 199 extractions the model did not list found 48 real skills it had
// omitted (KYC, ITIL, VPN, Food Safety…) and 12 errors, putting precision at
// ~95% while agreement read 72.8% (spec §10).
const AGREEMENT_FLOOR = 0.7;
const CONCURRENCY = 16;
// Strong should be a selective slice of everything the resume touches.
const MAX_STRONG_SHARE = 0.15;

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  })
);
const index = getIndex();
const version = vocabVersion();

async function readOnly(work) {
  const pool = new pg.Pool(buildPgConfig({ max: 1 }));
  const client = await pool.connect();
  try {
    await client.query("SET default_transaction_read_only = on");
    return await work(client);
  } finally {
    client.release();
    await pool.end();
  }
}

const pct = (n) => `${(100 * n).toFixed(1)}%`;
const topCounts = (map, n = 12) =>
  [...map].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(([k, v]) => `${k} (${v})`).join(", ");

async function evaluate() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set — the reference extraction needs the model.");
    process.exit(1);
  }
  const sample = JSON.parse(readFileSync("scripts/fixtures/skill-vocab-sample.json", "utf8"));
  if (sample.version !== version) {
    console.error(`vocabulary is v${version} but the sample file is v${sample.version}; rebuild first.`);
    process.exit(1);
  }
  const sampled = new Set(sample.sampleIds);
  const jobs = await readOnly(async (c) => (await c.query(LIVE_JOBS_IN_SAMPLE_ORDER_SQL, [sample.sampleSalt])).rows);
  // Distinct postings only: the same posting listed per location would count
  // its every agreement and disagreement several times over.
  const seenText = new Set();
  const heldOut = jobs
    .filter((j) => !sampled.has(j.apply_url_md5) && isUsableDescription(j.description))
    .filter((j) => {
      const text = plainText(j.description);
      if (seenText.has(text)) return false;
      seenText.add(text);
      return true;
    })
    .slice(0, HELD_OUT);
  console.log(`vocabulary v${version}; ${heldOut.length} distinct held-out jobs (none seen by the build)`);

  // The model's answers are cached per job and per text it read, so re-running
  // after a matching change costs nothing.
  mkdirSync(".cache/skill-eval", { recursive: true });
  const answersPath = `.cache/skill-eval/answers-p${PROMPT_VERSION}-${MODEL.replace(/[^a-z0-9]+/gi, "_")}.jsonl`;
  const answers = new Map();
  if (existsSync(answersPath)) {
    for (const line of readFileSync(answersPath, "utf8").split("\n")) {
      if (line.trim()) {
        const entry = JSON.parse(line);
        answers.set(entry.key, entry.skills);
      }
    }
  }

  const canonicalOf = (s) =>
    index.canonicalByAlias.get(s.name.toLowerCase()) ?? index.canonicalByAlias.get(s.canonical.toLowerCase()) ?? null;
  const results = [];
  let failed = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < heldOut.length) {
        const job = heldOut[next++];
        const ours = skillsForDescription(job.description, index);
        const text = ours.source === "body" ? plainText(job.description) : requirementsSection(job.description).text;
        const key = `${job.apply_url_md5}:${ours.source}`;
        if (!answers.has(key)) {
          const reply = await extractSkillsWithLlm(text, { signal: AbortSignal.timeout(30000) });
          if (!reply.ok) {
            failed += 1;
            continue;
          }
          answers.set(key, reply.skills);
          appendFileSync(answersPath, `${JSON.stringify({ key, skills: reply.skills })}\n`);
        }
        const grounded = groundedSkills(answers.get(key), text);
        results.push({
          id: job.apply_url_md5,
          source: job.source,
          tier: ours.source,
          ours: ours.skills,
          referenceKnown: [...new Set(grounded.map(canonicalOf).filter(Boolean))],
          referenceUnknown: [...new Set(grounded.filter((s) => !canonicalOf(s)).map((s) => s.canonical))],
        });
      }
    })
  );

  let truePositives = 0;
  let falsePositives = 0;
  let missedKnown = 0;
  let missedUnknown = 0;
  const falsePositiveSkills = new Map();
  const missedKnownSkills = new Map();
  for (const r of results) {
    const reference = new Set(r.referenceKnown);
    const ours = new Set(r.ours);
    for (const s of r.ours) {
      if (reference.has(s)) truePositives += 1;
      else {
        falsePositives += 1;
        falsePositiveSkills.set(s, (falsePositiveSkills.get(s) ?? 0) + 1);
      }
    }
    for (const s of r.referenceKnown) {
      if (!ours.has(s)) {
        missedKnown += 1;
        missedKnownSkills.set(s, (missedKnownSkills.get(s) ?? 0) + 1);
      }
    }
    missedUnknown += r.referenceUnknown.length;
  }
  const precision = truePositives / Math.max(truePositives + falsePositives, 1);
  const recall = truePositives / Math.max(truePositives + missedKnown + missedUnknown, 1);
  const inVocabularyRecall = truePositives / Math.max(truePositives + missedKnown, 1);

  const outPath = `.cache/skill-eval/v${version}.json`;
  writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`);

  console.log(`\nresults over ${results.length} jobs (${failed} model failures):`);
  console.log(`  agreement            ${pct(precision)}   (${truePositives} agreed / ${truePositives + falsePositives} we extracted; a precision lower bound)`);
  console.log(`  recall               ${pct(recall)}   (of everything the model found)`);
  console.log(`  in-vocabulary recall ${pct(inVocabularyRecall)}   (of what the model found that the vocabulary knows)`);
  console.log(`  ours-only skills  : ${topCounts(falsePositiveSkills)}`);
  console.log(`  missed (in vocab) : ${topCounts(missedKnownSkills)}`);
  console.log(`  per-job detail    : ${outPath}`);
  if (precision < AGREEMENT_FLOOR) {
    console.error(`\nFAIL: agreement ${pct(precision)} fell below the ${pct(AGREEMENT_FLOOR)} regression floor.`);
    process.exitCode = 1;
  } else {
    console.log(`\nok: agreement is above the ${pct(AGREEMENT_FLOOR)} regression floor; adjudicate "ours-only" to estimate precision`);
  }
}

async function calibrate() {
  const email = typeof args.email === "string" ? args.email : "test@test.com";
  const scan = await readOnly(async (c) => {
    const { rows: [user] } = await c.query(`SELECT id FROM "User" WHERE email = $1`, [email]);
    if (!user) return null;
    const { rows: [latest] } = await c.query(
      `SELECT skills FROM "ResumeScan" WHERE "userId" = $1 AND result IS NOT NULL ORDER BY "createdAt" DESC LIMIT 1`,
      [user.id]
    );
    return latest ?? null;
  });
  if (!scan) {
    console.error(`no scan found for ${email}`);
    process.exit(1);
  }
  try {
    const all = await rankJobs({ skills: scan.skills, limit: 100000 });
    const coverages = all.rows.map((r) => Number(r.coverage)).sort((a, b) => b - a);
    const at = (p) => (coverages.length ? coverages[Math.min(coverages.length - 1, Math.floor(p * coverages.length))].toFixed(2) : "-");
    const everything = bucketByCoverage(all.rows);
    const top = bucketByCoverage(all.rows.slice(0, DEFAULT_LIMIT));
    const strongShare = everything.strong.length / Math.max(all.rows.length, 1);
    console.log(`${email}: ${scan.skills.length} resume skills, ${all.skills.length} in the vocabulary (${all.unknown.length} not: ${all.unknown.slice(0, 8).join(", ")}${all.unknown.length > 8 ? ", …" : ""})`);
    console.log(`candidates (jobs sharing ≥1 skill): ${all.rows.length}`);
    console.log(`coverage top 1%=${at(0.01)} 5%=${at(0.05)} 10%=${at(0.1)} 25%=${at(0.25)} 50%=${at(0.5)}`);
    console.log(`thresholds STRONG=${STRONG_COVERAGE} GOOD=${GOOD_COVERAGE} MIN_JOB_SKILLS=${MIN_JOB_SKILLS}`);
    console.log(`  all candidates: strong ${everything.strong.length} (${pct(strongShare)}), good ${everything.good.length}, low ${everything.low.length}`);
    console.log(`  top ${DEFAULT_LIMIT} shown   : strong ${top.strong.length}, good ${top.good.length}, low ${top.low.length}`);
    if (!everything.strong.length || strongShare > MAX_STRONG_SHARE) {
      console.log(`ADJUST: Strong should be non-empty and at most ${pct(MAX_STRONG_SHARE)} of candidates.`);
      process.exitCode = 1;
    } else {
      console.log("ok: thresholds leave Strong a selective, non-empty slice");
    }
  } finally {
    await globalThis._postgresPool?.end();
  }
}

if (args.calibrate) await calibrate();
else await evaluate();
