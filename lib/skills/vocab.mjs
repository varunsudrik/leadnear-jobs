// lib/skills/vocab.mjs — the skill vocabulary and the alias index built from it.
//
// Pure apart from the one import of the generated vocabulary. The index is
// built once per process (getIndex) and shared by the batch extractor and the
// matches page.
import VOCAB from "./vocab-data.mjs";

// How an alias is matched, decided by what it looks like:
//   short       — 1-2 characters ("Go", "R", "C"): exact case, plus the
//                 context rules in extract.mjs, because these are ordinary
//                 words and letters far more often than they are skills.
//   insensitive — distinctive enough that case never changes the meaning:
//                 has a digit or one of + # . /, two or more capitals
//                 ("PostgreSQL", "AWS"), or is 8+ characters ("Kubernetes").
//   sensitive   — everything else ("Spring", "Swift", "Excel"): exact case.
//                 The vocabulary keeps every casing actually seen in
//                 postings, so "excel" matches only if postings write it so.
export function aliasClass(alias) {
  if (alias.length <= 2) return "short";
  const capitals = (alias.match(/[A-Z]/g) || []).length;
  if (/[0-9+#./]/.test(alias) || capitals >= 2 || alias.length >= 8) return "insensitive";
  return "sensitive";
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORDISH = "A-Za-z0-9_+#";

// Longest alias first, so "React Native" wins over "React" at the same position.
function compileAlternation(aliases, flags, notBefore, notAfter) {
  if (!aliases.length) return null;
  const alternation = [...aliases]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
    .map(escapeRegExp)
    .join("|");
  return new RegExp(`(?<![${notBefore}])(?:${alternation})(?![${notAfter}])`, flags);
}

export function buildIndex(vocab) {
  const canonicalByAlias = new Map();
  const buckets = { insensitive: [], sensitive: [], short: [] };
  const compiled = new Set();
  for (const { canonical, aliases } of vocab?.skills ?? []) {
    for (const raw of new Set([canonical, ...(aliases ?? [])])) {
      const alias = String(raw ?? "").trim();
      if (!alias) continue;
      const key = alias.toLowerCase();
      const owner = canonicalByAlias.get(key);
      // An alias already claimed by an earlier (more frequent) skill stays there.
      if (owner !== undefined && owner !== canonical) continue;
      canonicalByAlias.set(key, canonical);
      const cls = aliasClass(alias);
      // Every casing is compiled for exact-case classes; one per spelling otherwise.
      const compiledKey = cls === "insensitive" ? `i:${key}` : `${cls}:${alias}`;
      if (compiled.has(compiledKey)) continue;
      compiled.add(compiledKey);
      buckets[cls].push(alias);
    }
  }
  return {
    canonicalByAlias,
    insensitive: compileAlternation(buckets.insensitive, "gi", WORDISH, WORDISH),
    sensitive: compileAlternation(buckets.sensitive, "g", WORDISH, WORDISH),
    short: compileAlternation(buckets.short, "g", `${WORDISH}.\\-&`, `${WORDISH}\\-&`),
  };
}

let cachedIndex = null;
export function getIndex() {
  cachedIndex ??= buildIndex(VOCAB);
  return cachedIndex;
}

export function vocabVersion() {
  return Number(VOCAB?.version ?? 0);
}

// Maps free-text skills (a resume's AI-extracted list) onto the vocabulary's
// canonical names. Case-insensitive exact alias lookup: each entry is already a
// discrete skill, so the context rules that guard prose matching do not apply.
export function canonicalizeSkills(skills, index) {
  const known = [];
  const unknown = [];
  const seen = new Set();
  for (const raw of Array.isArray(skills) ? skills : []) {
    const skill = String(raw ?? "").trim();
    if (!skill) continue;
    const canonical = index.canonicalByAlias.get(skill.toLowerCase());
    if (canonical === undefined) {
      unknown.push(skill);
      continue;
    }
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    known.push(canonical);
  }
  return { known, unknown };
}
