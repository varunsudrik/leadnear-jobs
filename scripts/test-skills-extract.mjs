import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aliasClass, buildIndex, canonicalizeSkills, getIndex, vocabVersion } from "../lib/skills/vocab.mjs";
import { extractJobSkills, skillsForDescription, toSkillRows } from "../lib/skills/extract.mjs";

const fixture = (md5) =>
  readFileSync(new URL(`./fixtures/job-descriptions/${md5}.html`, import.meta.url), "utf8");

// A small hand-written vocabulary, independent of the generated one, so these
// tests pin the matching rules rather than whatever the last build produced.
const index = buildIndex({
  skills: [
    { canonical: "Go", aliases: ["Go", "Golang"] },
    { canonical: "R", aliases: ["R"] },
    { canonical: "C", aliases: ["C"] },
    { canonical: "C++", aliases: ["C++"] },
    { canonical: "Java", aliases: ["Java"] },
    { canonical: "JavaScript", aliases: ["JavaScript", "JS"] },
    { canonical: "React", aliases: ["React", "React.js"] },
    { canonical: "React Native", aliases: ["React Native"] },
    { canonical: "Spring", aliases: ["Spring"] },
    { canonical: "Kubernetes", aliases: ["Kubernetes", "K8s"] },
    { canonical: "SQL", aliases: ["SQL"] },
    { canonical: "MySQL", aliases: ["MySQL"] },
    { canonical: "Node.js", aliases: ["Node.js", "NodeJS"] },
    { canonical: "HubSpot", aliases: ["HubSpot"] },
    { canonical: "Excel", aliases: ["Excel", "excel"] },
    { canonical: "Home Loans", aliases: ["home loans"] },
  ],
});
const x = (text) => extractJobSkills(text, index);

// ─── aliasClass ─────────────────────────────────────────────────────────────
assert.equal(aliasClass("Go"), "short");
assert.equal(aliasClass("Spring"), "sensitive");
assert.equal(aliasClass("Excel"), "sensitive");
assert.equal(aliasClass("Kubernetes"), "insensitive"); // 8+ characters
assert.equal(aliasClass("AWS"), "insensitive"); // two or more capitals
assert.equal(aliasClass("Node.js"), "insensitive"); // punctuation

// ─── Short aliases: ordinary words far more often than skills ───────────────
assert.deepEqual(x("Python, Go, and Java"), ["Java", "Go"]);
assert.deepEqual(x("Strong Go experience"), ["Go"]);
assert.deepEqual(x("Go above and beyond. Go is optional"), []);
assert.deepEqual(x("Go, Rust or Python"), ["Go"]);
assert.deepEqual(x("Languages: Go or Rust"), ["Go"]);
assert.deepEqual(x("• Go (Golang) experience"), ["Go"]);
assert.deepEqual(x("Google Cloud, go-to-market"), []);
assert.deepEqual(x("Experience with R and SQL"), ["SQL", "R"]);
assert.deepEqual(x("R&D budget"), []);
assert.deepEqual(x("R.J. Smith"), []);
assert.deepEqual(x("C/C++ firmware"), ["C++", "C"]);
assert.deepEqual(x("C-suite stakeholders"), []);

// ─── Boundaries and longest match ───────────────────────────────────────────
assert.deepEqual(x("JavaScript not Java"), ["JavaScript", "Java"]);
assert.deepEqual(x("MySQL only"), ["MySQL"]); // no "SQL" inside "MySQL"
assert.deepEqual(x("React Native apps"), ["React Native"]); // no second "React"
assert.deepEqual(x("Spring Boot"), ["Spring"]);

// ─── Case ───────────────────────────────────────────────────────────────────
assert.deepEqual(x("kubernetes and k8s"), ["Kubernetes"]); // insensitive, deduped
assert.deepEqual(x("node.js services"), ["Node.js"]);
assert.deepEqual(x("spring 2025 intake"), []); // sensitive: the season is not the framework
// Every casing the vocabulary lists is matched, and only those.
assert.deepEqual(x("advanced excel reports"), ["Excel"]);
assert.deepEqual(x("EXCEL"), []);
assert.deepEqual(x(""), []);
assert.deepEqual(x(null), []);

// ─── Index ──────────────────────────────────────────────────────────────────
// An alias claimed by an earlier skill is not reassigned by a later one.
{
  const clash = buildIndex({ skills: [
    { canonical: "PostgreSQL", aliases: ["Postgres"] },
    { canonical: "Postgres DB", aliases: ["Postgres"] },
  ] });
  assert.equal(clash.canonicalByAlias.get("postgres"), "PostgreSQL");
}
assert.equal(buildIndex({ skills: [] }).insensitive, null);
assert.deepEqual(extractJobSkills("anything", buildIndex(undefined)), []);

// ─── canonicalizeSkills (resume side) ───────────────────────────────────────
assert.deepEqual(
  canonicalizeSkills(["golang", " Kubernetes ", "k8s", "Rust", "", null], index),
  { known: ["Go", "Kubernetes"], unknown: ["Rust"] }
);
assert.deepEqual(canonicalizeSkills(undefined, index), { known: [], unknown: [] });

// ─── skillsForDescription ───────────────────────────────────────────────────
// Skills come from the requirements section when it has any.
assert.deepEqual(
  skillsForDescription(fixture("0215b108f224ed5ac1c4121c410dd754"), index),
  { skills: ["HubSpot"], source: "section" }
);
// A section with no vocabulary skills in it (degrees only) falls back to the
// whole description, recorded as the weaker "body" tier.
assert.deepEqual(
  skillsForDescription(fixture("013dac763cb5ca903933eb6402de879f"), index),
  { skills: ["Home Loans"], source: "body" }
);
assert.deepEqual(skillsForDescription(null, index), { skills: [], source: "body" });

// ─── toSkillRows ────────────────────────────────────────────────────────────
{
  const rows = toSkillRows(
    [
      { apply_url_md5: "a", description: fixture("0215b108f224ed5ac1c4121c410dd754") },
      { apply_url_md5: "b", description: "<p>nothing here</p>" },
    ],
    index
  );
  assert.deepEqual(rows.skillRows, { jobMd5: ["a"], skill: ["HubSpot"], source: ["section"] });
  // Every job gets a scan row, including one with no skills, so an incremental
  // run does not keep re-reading it.
  assert.deepEqual(rows.scanRows, { jobMd5: ["a", "b"], source: ["section", "body"], skillCount: [1, 0] });
}

// ─── The generated vocabulary loads ─────────────────────────────────────────
assert.ok(Number.isInteger(vocabVersion()));
assert.ok(getIndex().canonicalByAlias instanceof Map);
assert.equal(getIndex(), getIndex()); // built once

console.log("skills-extract ok");
