// lib/skills/vocab-build.mjs — pure pieces of the one-time vocabulary build
// (scripts/build-skill-vocab.mjs), plus the single LLM call it makes.
import { chat } from "../ai/openrouter.mjs";
import { matchAliases } from "./extract.mjs";
import { plainText } from "./sections.mjs";
import { aliasClass, buildIndex, matchableInProse } from "./vocab.mjs";

// A skill must appear in at least this many sampled jobs to enter the
// vocabulary, so a single misreading cannot.
export const MIN_SAMPLE_COUNT = 3;
export const MAX_SKILL_LENGTH = 120;

// Code-unit order, not localeCompare: the generated vocabulary must come out
// byte-identical on every machine regardless of its locale.
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Bump when SYSTEM or VOCAB_SCHEMA changes: cached model answers are keyed on
// it, so a changed prompt is never served stale results.
export const PROMPT_VERSION = 1;

// The model's per-job answers supervise which aliases may match prose: an
// alias is kept only if, across the sampled jobs, the model listed that text
// (or its skill) in at least this share of the texts the alias matches.
// Measured on v1 (agreed / matched): "Knowledge" -> Knowledge Management
// 6/686, "data" 7/476, "Software" 4/374, "agents" -> AI Agents 9/29; versus
// Python 152/160, Excel 164/185, Kubernetes 53/56. Generic words sat below
// 0.12, partial aliases around 0.30, real skills mostly above 0.4.
export const MIN_ALIAS_PRECISION = 0.35;
// Below this many matching sampled texts the estimate is too noisy to act on
// and the alias is kept; a generic word matches far more often than this.
export const MIN_ALIAS_SUPPORT = 5;

// The sample. Changing the salt changes which jobs are drawn, and so which are
// held out for scripts/eval-job-skills.mjs.
export const SAMPLE_SALT = "skill-vocab-v1";
export const SAMPLE_SIZE = 2000;
// Every live job with a description, in the deterministic order both the
// vocabulary build and the held-out evaluation draw from ($1 = salt).
export const LIVE_JOBS_IN_SAMPLE_ORDER_SQL = `
  SELECT apply_url_md5, source, description FROM jobs
  WHERE status = 'success' AND COALESCE(description, '') <> ''
  ORDER BY md5(apply_url_md5 || $1)`;

const MIN_TEXT_CHARS = 200;
const PLACEHOLDER = /%BUTTON_APPLY|%BREADCRUMB/;
// Placeholders and near-empty descriptions (breezy's page chrome, lever's
// truncated intros) have nothing to learn from or to evaluate against.
export function isUsableDescription(description) {
  return !PLACEHOLDER.test(String(description ?? "")) && plainText(description).length >= MIN_TEXT_CHARS;
}

// Soft skills the model is told to omit but may still return. Lower-cased.
export const SOFT_SKILLS = new Set([
  "communication", "communication skills", "leadership", "teamwork", "collaboration",
  "problem solving", "problem-solving", "critical thinking", "time management",
  "attention to detail", "organization", "organisational skills", "organizational skills",
  "interpersonal skills", "adaptability", "creativity", "work ethic", "self-motivated",
  "multitasking", "multi-tasking",
]);

export const VOCAB_SCHEMA = {
  name: "job_skills",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["skills"],
    properties: {
      skills: {
        type: "array",
        maxItems: 40,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "canonical"],
          properties: { name: { type: "string" }, canonical: { type: "string" } },
        },
      },
    },
  },
};

const SYSTEM = [
  "You read the requirements of one job posting and list the skills it asks for. You never invent.",
  "A skill is a concrete, nameable technology, tool, platform, programming language, framework,",
  "certification, licence, methodology or domain technique — for example Python, Salesforce,",
  "Epic EHR, CDL Class A, Phlebotomy, GAAP, Six Sigma, forklift operation, Tally.",
  "Exclude soft skills (communication, leadership), personality traits, years of experience,",
  "degrees, job titles, company names and locations.",
  "name: the skill exactly as written in the text, same spelling and case.",
  "canonical: its standard English name (K8s -> Kubernetes, Golang -> Go, Postgres -> PostgreSQL,",
  "MS Excel -> Excel).",
].join(" ");

export async function extractSkillsWithLlm(text, { signal, model } = {}) {
  const result = await chat({
    system: SYSTEM,
    user: String(text ?? "").slice(0, 8000),
    schema: VOCAB_SCHEMA,
    // 800 tokens truncated the JSON mid-list (finish_reason "length") on
    // detailed postings even with thinking off; 40 items fit well within 2500.
    maxTokens: 2500,
    reasoningEffort: "none",
    signal,
    ...(model ? { model } : {}),
  });
  if (!result.ok) return result;
  let payload;
  try {
    payload = JSON.parse(result.text);
  } catch {
    return { ok: false, reason: "invalid", detail: "response was not JSON" };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.skills)) {
    return { ok: false, reason: "invalid", detail: "response did not match the schema" };
  }
  const skills = payload.skills
    .filter((s) => s && typeof s === "object")
    .map((s) => ({ name: String(s.name ?? "").trim(), canonical: String(s.canonical ?? "").trim() }))
    .filter((s) => s.name && s.canonical);
  return { ok: true, skills };
}

// Keeps only skills whose `name` literally occurs in the text the model read.
// Drops paraphrases and inventions, and guarantees every alias in the
// vocabulary is something postings really write.
export function groundedSkills(skills, text) {
  const haystack = String(text ?? "").toLowerCase();
  return (Array.isArray(skills) ? skills : []).filter((s) => haystack.includes(s.name.toLowerCase()));
}

// Deterministic, proportional sample. `jobs` is [{ id, source }] already in the
// order to draw from; each source gets a share of `size` proportional to its
// share of `jobs` (largest remainder, so shares sum to exactly `size`).
export function stratifiedSample(jobs, size) {
  const list = Array.isArray(jobs) ? jobs : [];
  if (size >= list.length) return list.map((j) => j.id);
  const bySource = new Map();
  for (const job of list) {
    if (!bySource.has(job.source)) bySource.set(job.source, []);
    bySource.get(job.source).push(job.id);
  }
  const shares = [...bySource].map(([source, ids]) => {
    const exact = (size * ids.length) / list.length;
    return { source, ids, take: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = size - shares.reduce((sum, s) => sum + s.take, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || byCodeUnit(a.source, b.source))) {
    if (left <= 0) break;
    share.take += 1;
    left -= 1;
  }
  return shares
    .sort((a, b) => byCodeUnit(a.source, b.source))
    .flatMap((share) => share.ids.slice(0, share.take));
}

export const canonicalKey = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// Per-job grounded results -> vocabulary entries.
// `results` is [{ skills: [{ name, canonical }] }], one entry per sampled job.
export function aggregateVocab(results, { minSampleCount = MIN_SAMPLE_COUNT } = {}) {
  const entries = new Map(); // lower-cased canonical -> { casings, jobs, aliases }
  for (const { skills } of Array.isArray(results) ? results : []) {
    const inThisJob = new Set();
    for (const skill of Array.isArray(skills) ? skills : []) {
      const canonical = tidy(skill.canonical);
      const alias = tidy(skill.name);
      if (!canonical || !alias || canonical.length > MAX_SKILL_LENGTH || alias.length > MAX_SKILL_LENGTH) continue;
      const key = canonical.toLowerCase();
      if (SOFT_SKILLS.has(key)) continue;
      let entry = entries.get(key);
      if (!entry) entries.set(key, (entry = { casings: new Map(), jobs: 0, aliases: new Map() }));
      entry.casings.set(canonical, (entry.casings.get(canonical) ?? 0) + 1);
      entry.aliases.set(alias, (entry.aliases.get(alias) ?? 0) + 1);
      if (!inThisJob.has(key)) {
        inThisJob.add(key);
        entry.jobs += 1;
      }
    }
  }
  const kept = [...entries].filter(([, e]) => e.jobs >= minSampleCount);
  // An alias claimed by several skills goes to the one it was seen with most.
  const owner = new Map();
  for (const [key, entry] of kept) {
    for (const [alias, count] of entry.aliases) {
      const aliasKey = alias.toLowerCase();
      const current = owner.get(aliasKey);
      if (!current || count > current.count || (count === current.count && key < current.key)) {
        owner.set(aliasKey, { key, count });
      }
    }
  }
  const byCount = (a, b) => b[1] - a[1] || byCodeUnit(a[0], b[0]);
  return kept
    .map(([key, entry]) => ({
      canonical: [...entry.casings].sort(byCount)[0][0],
      aliases: [...entry.aliases].filter(([alias]) => owner.get(alias.toLowerCase())?.key === key).sort(byCount).map(([alias]) => alias),
      sampleCount: entry.jobs,
    }))
    .sort((a, b) => b.sampleCount - a.sampleCount || byCodeUnit(a.canonical, b.canonical));
}

// Stats are kept per alias as the matcher sees it: case-folded for
// case-insensitive aliases, exact for the rest ("Excel" and "excel" differ).
const statKey = (alias, pass) => (pass === "insensitive" ? `i:${alias.toLowerCase()}` : `e:${alias}`);

// Adds `proseAliases` to each skill: the aliases (canonical included) that
// passed the precision check above. `samples` is one entry per sampled job:
// { text: what the model read, canonicals: Set, names: Set } — canonical keys
// and surface names the model listed, lower-cased. Agreement counts either,
// because the model often files the same text under a longer canonical
// ("Azure" as Microsoft Azure).
//
// All candidate aliases compete in one index, exactly as extraction runs, so an
// alias is credited only for text it wins: "Office" is not credited for "MS
// Office", which the longer alias takes first — only for what "Office" alone
// catches ("Cash Office", "Home Office Stipend").
export function selectProseAliases(skills, samples, { minPrecision = MIN_ALIAS_PRECISION, minSupport = MIN_ALIAS_SUPPORT } = {}) {
  const skillList = Array.isArray(skills) ? skills : [];
  const index = buildIndex({ skills: skillList.map(({ canonical, aliases }) => ({ canonical, aliases })) });
  const stats = new Map();
  for (const sample of Array.isArray(samples) ? samples : []) {
    const counted = new Set();
    for (const match of matchAliases(sample.text, index)) {
      const key = statKey(match.text, match.pass);
      if (counted.has(key)) continue; // texts, not occurrences
      counted.add(key);
      const entry = stats.get(key) ?? { matched: 0, agreed: 0 };
      entry.matched += 1;
      if (sample.canonicals.has(canonicalKey(match.canonical)) || sample.names.has(canonicalKey(match.text))) entry.agreed += 1;
      stats.set(key, entry);
    }
  }
  return skillList.map((skill) => {
    const proseAliases = [];
    for (const alias of new Set([skill.canonical, ...(skill.aliases ?? [])])) {
      if (!matchableInProse(alias, skill.canonical)) continue;
      const { matched = 0, agreed = 0 } = stats.get(statKey(alias, aliasClass(alias))) ?? {};
      if (matched < minSupport || agreed / matched >= minPrecision) proseAliases.push(alias);
    }
    return { ...skill, proseAliases };
  });
}

export function renderVocabModule(vocab) {
  return [
    "// Generated by scripts/build-skill-vocab.mjs — do not edit by hand.",
    "// Rebuild with `npm run skills:vocab` and review the diff like any code change.",
    `const vocab = ${JSON.stringify(vocab, null, 2)};`,
    "export default vocab;",
    "",
  ].join("\n");
}
