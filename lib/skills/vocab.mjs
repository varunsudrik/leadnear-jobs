// lib/skills/vocab.mjs — the skill vocabulary and the alias index built from it.
//
// Pure apart from the one import of the generated vocabulary. The index is
// built once per process (getIndex) and shared by the batch extractor and the
// matches page.
import VOCAB from "./vocab-data.mjs";

// How an alias is matched in prose, decided by what it looks like:
//   short       — 1-2 characters ("Go", "R", "C"): exact case, plus the
//                 context rules in extract.mjs, because these are ordinary
//                 words and letters far more often than they are skills.
//   insensitive — distinctive enough that case never changes the meaning:
//                 has a digit or one of + # . / ("C++", "Node.js", "CI/CD"),
//                 or is 8+ characters ("Kubernetes").
//   sensitive   — every other alias, 3-7 letters ("Excel", "Spring", "SQL",
//                 "SAFe"): exact case, so "SAFe" never matches "safe" and
//                 "Spring" never matches "spring". The vocabulary keeps every
//                 casing postings actually use, so "sql" matches when postings
//                 write it that way.
export function aliasClass(alias) {
  if (alias.length <= 2) return "short";
  if (/[0-9+#./]/.test(alias) || alias.length >= 8) return "insensitive";
  return "sensitive";
}

// State, province and time-zone codes that location lines use ("Detroit, MI",
// "Bangalore, KA", "9am PT"). A two-letter skill name that is also one of these
// is never matched in prose. US, Canada and India — the corpus's main markets.
export const LOCATION_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND",
  "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
  "PR", "PT", "ET",
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
  "AP", "AS", "BR", "CG", "GJ", "HR", "HP", "JH", "KA", "KL", "MP", "MH", "ML", "MZ", "OD", "PB", "RJ",
  "TS", "TR", "UP", "UK", "WB", "DL",
]);

// Whether an alias may be matched in running text. A 1-2 character alias is
// kept only when it is the skill's own name and not a location code: "CA" is
// California far more often than Chartered Accountant, and "1+" is "1+ years".
// Aliases failing this still map a resume's discrete skill list (where "AI" is
// unambiguous) through canonicalByAlias; they are only left out of the regexes.
export function matchableInProse(alias, canonical) {
  if (alias.length > 2) return true;
  return alias === canonical && !LOCATION_CODES.has(alias.toUpperCase());
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
  for (const { canonical, aliases, proseAliases } of vocab?.skills ?? []) {
    const lookup = new Set([canonical, ...(aliases ?? [])]);
    // proseAliases, when present, is the subset that passed the build's
    // precision check (lib/skills/vocab-build.mjs selectProseAliases); only
    // those are matched in running text. Every alias still maps a resume.
    const prose = new Set(proseAliases ?? lookup);
    for (const raw of lookup) {
      const alias = String(raw ?? "").trim();
      if (!alias) continue;
      const key = alias.toLowerCase();
      const owner = canonicalByAlias.get(key);
      // An alias already claimed by an earlier (more frequent) skill stays there.
      if (owner !== undefined && owner !== canonical) continue;
      canonicalByAlias.set(key, canonical);
      if (!prose.has(raw) || !matchableInProse(alias, canonical)) continue;
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
