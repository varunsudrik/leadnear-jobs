// One-time (re-runnable) build of lib/skills/vocab-data.mjs — spec §4.
//
//   npm run skills:vocab
//
// Samples ~2,000 live jobs from the staging database (DATABASE_URL, itself a
// sample of production; production is never read here), sends each job's
// requirements section to the model once, keeps only skill names the text
// literally contains, and aggregates them into a vocabulary. Per-job model
// results are cached in .cache/skill-vocab/ so an interrupted run resumes
// without paying twice. Costs roughly $0.20-0.40 in OpenRouter credit.
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig } from "../lib/pg-config.mjs";
import { MODEL } from "../lib/resume/model.mjs";
import { requirementsSection } from "../lib/skills/sections.mjs";
import { vocabVersion } from "../lib/skills/vocab.mjs";
import {
  LIVE_JOBS_IN_SAMPLE_ORDER_SQL,
  MIN_ALIAS_PRECISION,
  MIN_SAMPLE_COUNT,
  PROMPT_VERSION,
  SAMPLE_SALT,
  SAMPLE_SIZE,
  aggregateVocab,
  canonicalKey,
  extractSkillsWithLlm,
  groundedSkills,
  isUsableDescription,
  renderVocabModule,
  selectProseAliases,
  stratifiedSample,
} from "../lib/skills/vocab-build.mjs";

loadEnvFile(".env.local");

// ~50 jobs/minute at 8 in flight (measured); override with SKILL_VOCAB_CONCURRENCY.
const CONCURRENCY = Number(process.env.SKILL_VOCAB_CONCURRENCY || 24);
const TIMEOUT_MS = 30000;
const MAX_FAILURE_RATE = 0.05;
if (!process.env.OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY is not set — the vocabulary build needs the model.");
  process.exit(1);
}

const version = vocabVersion() + 1;
const cacheDir = ".cache/skill-vocab";
// Keyed on what determines the answers, not the vocabulary version, so a
// rebuild that only changes aggregation reuses them for free.
const cachePath = `${cacheDir}/${SAMPLE_SALT}-p${PROMPT_VERSION}-${MODEL.replace(/[^a-z0-9]+/gi, "_")}.jsonl`;
mkdirSync(cacheDir, { recursive: true });

const pool = new pg.Pool(buildPgConfig({ max: 1 }));
let jobs;
try {
  const client = await pool.connect();
  try {
    await client.query("SET default_transaction_read_only = on");
    ({ rows: jobs } = await client.query(LIVE_JOBS_IN_SAMPLE_ORDER_SQL, [SAMPLE_SALT]));
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

const usable = jobs.filter((j) => isUsableDescription(j.description));
const sampleIds = stratifiedSample(usable.map((j) => ({ id: j.apply_url_md5, source: j.source })), SAMPLE_SIZE);
const byId = new Map(usable.map((j) => [j.apply_url_md5, j]));
console.log(`${jobs.length} live jobs, ${usable.length} usable, sampling ${sampleIds.length} (salt "${SAMPLE_SALT}")`);

const cached = new Map();
if (existsSync(cachePath)) {
  for (const line of readFileSync(cachePath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    cached.set(entry.id, entry.skills);
  }
  console.log(`resuming: ${cached.size} results already cached in ${cachePath}`);
}

let done = 0;
let failed = 0;
async function processJob(id) {
  if (cached.has(id)) return;
  const text = requirementsSection(byId.get(id).description).text;
  let result;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    result = await extractSkillsWithLlm(text, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (result.ok) break;
  }
  if (!result.ok) {
    failed += 1;
    return;
  }
  const skills = groundedSkills(result.skills, text);
  cached.set(id, skills);
  appendFileSync(cachePath, `${JSON.stringify({ id, skills })}\n`);
  done += 1;
  if (done % 100 === 0) console.log(`  ${done} jobs read by the model (${failed} failed)`);
}

let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < sampleIds.length) await processJob(sampleIds[next++]);
  })
);

if (failed / sampleIds.length > MAX_FAILURE_RATE) {
  console.error(`${failed} of ${sampleIds.length} jobs failed (> ${MAX_FAILURE_RATE * 100}%). Vocabulary NOT written; re-run to retry the failures.`);
  process.exit(1);
}

const answered = sampleIds.filter((id) => cached.has(id));
const results = answered.map((id) => ({ skills: cached.get(id) }));
const samples = answered.map((id) => ({
  text: requirementsSection(byId.get(id).description).text,
  canonicals: new Set(cached.get(id).map((s) => canonicalKey(s.canonical))),
  names: new Set(cached.get(id).map((s) => canonicalKey(s.name))),
}));
const skills = selectProseAliases(aggregateVocab(results), samples);
const vocab = {
  version,
  builtAt: new Date().toISOString().slice(0, 10),
  model: MODEL,
  sampleSalt: SAMPLE_SALT,
  sampleSize: results.length,
  minSampleCount: MIN_SAMPLE_COUNT,
  minAliasPrecision: MIN_ALIAS_PRECISION,
  skills,
};
writeFileSync("lib/skills/vocab-data.mjs", renderVocabModule(vocab));
writeFileSync(
  "scripts/fixtures/skill-vocab-sample.json",
  `${JSON.stringify({ version, sampleSalt: SAMPLE_SALT, sampleIds }, null, 2)}\n`
);

const aliasCount = skills.reduce((n, s) => n + s.aliases.length, 0);
const proseCount = skills.reduce((n, s) => n + s.proseAliases.length, 0);
const unmatchable = skills.filter((s) => !s.proseAliases.length).length;
console.log(`prose matching: ${proseCount} aliases kept of ${aliasCount + skills.length} candidates; ${unmatchable} skills match resumes only`);
console.log(`\nvocabulary v${version}: ${skills.length} skills, ${aliasCount} aliases, from ${results.length} jobs (${failed} failed)`);
console.log("top 25:", skills.slice(0, 25).map((s) => `${s.canonical} (${s.sampleCount})`).join(", "));
console.log("wrote lib/skills/vocab-data.mjs and scripts/fixtures/skill-vocab-sample.json");
