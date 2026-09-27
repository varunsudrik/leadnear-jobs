// lib/skills/extract.mjs — deterministic skill extraction against the vocabulary.
//
// Pure: text and an index (lib/skills/vocab.mjs) in, canonical skill names out.
import { bodyTextOfLines, requirementsSectionOfLines, toLines } from "./sections.mjs";

// A 1-2 character alias ("Go", "R", "C") is accepted mid-sentence. At the start
// of a line or sentence it must be followed by a list context ("Go, Rust",
// "Go or Rust", "Go (Golang)"), which rejects "Go above and beyond".
const LINE_START = /(?:^|[\n.!?:;•*–·-])\s*$/;
const LIST_AFTER = /^\s*(?:[,/(]|\s(?:or|and)\s+[A-Z])/;

function shortAliasInContext(text, start, end) {
  // "R.J." and similar: a following period must end the sentence.
  if (text[end] === "." && end + 1 < text.length && !/\s/.test(text[end + 1])) return false;
  if (LINE_START.test(text.slice(Math.max(0, start - 4), start))) {
    return LIST_AFTER.test(text.slice(end, end + 12));
  }
  return true;
}

// What a matched span is overwritten with before the next pass. Not a space:
// blanking "Java" to spaces made the "Go" in "Java Go Rust" look as if it
// started a line (four spaces before it), and the line-start rule for short
// aliases then dropped it. A control character is neither whitespace nor a
// word character, so word boundaries still hold on both sides.
const BLANK = "\u0001";

// Every alias occurrence the index accepts, as [{ text, canonical, pass }].
// Three passes — insensitive, sensitive, short — each blanking what it matched
// so a later pass cannot re-match inside it ("React Native" leaves no "React").
// extractJobSkills reduces this to canonical names; the vocabulary build uses
// it to credit each alias only for text it actually wins.
export function matchAliases(text, index) {
  let work = String(text ?? "");
  const matches = [];
  for (const pass of ["insensitive", "sensitive", "short"]) {
    const re = index[pass];
    if (!re) continue;
    const spans = [];
    for (const match of work.matchAll(re)) {
      const start = match.index;
      const end = start + match[0].length;
      if (pass === "short" && !shortAliasInContext(work, start, end)) continue;
      const canonical = index.canonicalByAlias.get(match[0].toLowerCase());
      if (canonical === undefined) continue;
      spans.push([start, end]);
      matches.push({ text: match[0], canonical, pass });
    }
    if (spans.length) {
      let blanked = "";
      let last = 0;
      for (const [start, end] of spans) {
        blanked += work.slice(last, start) + BLANK.repeat(end - start);
        last = end;
      }
      work = blanked + work.slice(last);
    }
  }
  return matches;
}

export function extractJobSkills(text, index) {
  const found = [];
  const seen = new Set();
  for (const { canonical } of matchAliases(text, index)) {
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    found.push(canonical);
  }
  return found;
}

// The skills of one job, and which tier of the description they came from.
// A requirements section containing no vocabulary skills at all (degrees and
// soft skills only) falls back to the whole description, recorded as "body".
// The description is split into lines once and shared by both passes.
export function skillsForDescription(description, index) {
  const lines = toLines(description);
  const section = requirementsSectionOfLines(lines);
  const skills = extractJobSkills(section.text, index);
  if (skills.length || section.source === "body") return { skills, source: section.source };
  return { skills: extractJobSkills(bodyTextOfLines(lines), index), source: "body" };
}

// Column arrays for the batch extractor's unnest() inserts.
export function toSkillRows(jobs, index) {
  const skillRows = { jobMd5: [], skill: [], source: [] };
  const scanRows = { jobMd5: [], source: [], skillCount: [], descriptionMd5: [] };
  for (const job of jobs) {
    const { skills, source } = skillsForDescription(job.description, index);
    for (const skill of skills) {
      skillRows.jobMd5.push(job.apply_url_md5);
      skillRows.skill.push(skill);
      skillRows.source.push(source);
    }
    scanRows.jobMd5.push(job.apply_url_md5);
    scanRows.source.push(source);
    scanRows.skillCount.push(skills.length);
    scanRows.descriptionMd5.push(job.description_md5 ?? null);
  }
  return { skillRows, scanRows };
}
