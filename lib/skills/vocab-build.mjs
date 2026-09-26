// lib/skills/vocab-build.mjs — pure pieces of the one-time vocabulary build
// (scripts/build-skill-vocab.mjs), plus the single LLM call it makes.
import { chat } from "../ai/openrouter.mjs";
import { plainText } from "./sections.mjs";

// A skill must appear in at least this many sampled jobs to enter the
// vocabulary, so a single misreading cannot.
export const MIN_SAMPLE_COUNT = 3;
export const MAX_SKILL_LENGTH = 120;

// Code-unit order, not localeCompare: the generated vocabulary must come out
// byte-identical on every machine regardless of its locale.
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

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
    maxTokens: 800,
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

export function renderVocabModule(vocab) {
  return [
    "// Generated by scripts/build-skill-vocab.mjs — do not edit by hand.",
    "// Rebuild with `npm run skills:vocab` and review the diff like any code change.",
    `const vocab = ${JSON.stringify(vocab, null, 2)};`,
    "export default vocab;",
    "",
  ].join("\n");
}
