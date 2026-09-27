// lib/skills/sections.mjs — locate the requirements block of a job description.
//
// Pure: a description string in, { text, source } out. No DB, no network.
//
// Works on normalised text lines rather than HTML tags because the corpus is
// three formats at once (measured on staging 2026-09-26): real HTML
// (smartrecruiters, workday), entity-escaped HTML (greenhouse stores
// `&lt;h2&gt;`), and plain text with `•` bullets (lever).
//
// source: "jsonld"  — the <h2>Qualifications</h2> block the scrapers weld in
//                     from JSON-LD `qualifications` (mostly smartrecruiters)
//         "section" — text under any other requirements-style heading
//         "body"    — no requirements heading at all; the whole description

const HEADING_MARK = "\u0001";
const BOLD_OPEN = "\u0002";
const BOLD_CLOSE = "\u0003";

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", hellip: "…",
};

export function decodeEntities(input) {
  return String(input ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

// Greenhouse stores its HTML entity-escaped. Unescape once, and only when the
// description has escaped tags but no real ones, so real HTML that merely
// mentions "&lt;" in prose is left alone.
function unescapeStoredHtml(description) {
  const s = String(description ?? "");
  if (!/<[a-z]/i.test(s) && /&lt;[a-z/]/i.test(s)) return decodeEntities(s);
  return s;
}

const BARE_BULLET = /^[•\-*–·▪◦●]$/;
const BOLD_ONLY = new RegExp(`^${BOLD_OPEN}([^${BOLD_OPEN}${BOLD_CLOSE}]+)${BOLD_CLOSE}\\s*:?$`);
const MARKERS = /[\u0001\u0002\u0003]/g;

// Description -> [{ text, marked }]. `marked` is "h" when the line came from
// an <h1>-<h6>, "b" when the whole line was bold, otherwise null.
export function toLines(description) {
  const html = unescapeStoredHtml(description)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<h[1-6]\b[^>]*>/gi, `\n${HEADING_MARK}`)
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<(strong|b)\b[^>]*>/gi, BOLD_OPEN)
    .replace(/<\/(strong|b)>/gi, BOLD_CLOSE)
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|ul|ol|li|tr|table|section|article|header|footer)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  // Decoded twice: greenhouse double-escapes some entities (`&amp;nbsp;`).
  const text = decodeEntities(decodeEntities(html)).replace(/ /g, " ");
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/[ \t\f\v]+/g, " ").trim();
    let marked = null;
    if (line.startsWith(HEADING_MARK)) {
      marked = "h";
      line = line.slice(1);
    } else if (BOLD_ONLY.test(line)) {
      marked = "b";
    }
    line = line.replace(MARKERS, "").replace(/\s+/g, " ").trim();
    // Workday puts the bullet and its text on separate lines.
    if (!line || BARE_BULLET.test(line)) continue;
    lines.push({ text: line, marked });
  }
  return lines;
}

export function plainText(description) {
  return toLines(description).map((line) => line.text).join("\n");
}

export const REQUIREMENT_HEADING = /\b(?:qualifications?|requirements?|what you(?:'|’)?(?:ll)? ?(?:bring|need|have)|what we(?:'|’)?re looking for|who you are|about you|skills|experience|must.haves?|nice.to.haves?|bonus points|preferred|minimum|you have|you bring|ideal candidate|competenc(?:y|ies)|(?:to be )?successful|to succeed|great fit|good fit|what makes you|looking for|desirable|you(?:'|’)?ll (?:need|have|bring)|profile?|qui vous (?:êtes|etes)|anforderungen|qualifikationen|was (?:du|sie) mitbring(?:st|en)|requisitos|perfil)\b/i;

export const OTHER_HEADING = /\b(?:about (?:us|the (?:role|company|team|job|position|opportunity))|responsibilities|what you(?:'|’)?ll do|what you will do|what will you do|what you(?:'|’)?ll be doing|the role|role overview|job (?:description|summary)|overview|benefits|perks|compensation|salary|pay range|why (?:join|work)|who we are|our (?:company|mission|values|team|culture|story)|equal (?:opportunity|employment)|eeo|how to apply|what we offer|location|the team|day.to.day|your (?:role|mission|impact)|duties|why you(?:'|’)?ll love|why us|what(?:'|’)?s in it for you|what we (?:offer|provide)|a few things|a quick note|our offer|next steps|interview process)\b/i;

// Sections that are not about the job at all: the company, perks, pay, EEO,
// how to apply. Responsibilities are deliberately not here — tools are often
// named there — so this is narrower than OTHER_HEADING.
export const NON_JOB_HEADING = /\b(?:about (?:us|the (?:company|team))|who we are|our (?:company|mission|values|team|culture|story)|benefits|perks|compensation|salary|pay range|why (?:join|work)|why you(?:'|’)?ll love|why us|what(?:'|’)?s in it for you|what we (?:offer|provide)|our offer|equal (?:opportunity|employment)|eeo|how to apply|next steps|interview process|a few things|a quick note|location)\b/i;

const BULLET = /^(?:[•\-*–·▪◦●]|\d{1,2}[.)])\s/;

// "h" — hard heading: sets the requirements state outright, on or off.
// "b" — soft heading: turns requirements on, or off only when it is clearly
//       another section. A neutral soft heading keeps the current state, so a
//       bold sub-heading inside a Qualifications block does not end it.
// null — not a heading.
export function headingLevel({ text, marked }) {
  if (text.length > 120) return null;
  const words = text.split(" ").length;
  const letters = text.replace(/[^\p{L}]/gu, "");
  // An ALL-CAPS line is a hard heading ("QUI VOUS ÊTES", "WHAT WE OFFER"), but
  // not a list of acronyms ("SQL, AWS, GCP"): it needs a 4+ letter word and no
  // list punctuation.
  const allCaps = words >= 2 && words <= 8 && letters.length >= 6 && letters === letters.toUpperCase()
    && /\p{L}{4}/u.test(text) && !/[,/+#&]/.test(text);
  if (marked === "h") return "h";
  if (allCaps && !BULLET.test(text)) return "h";
  if (marked === "b") return "b";
  if (BULLET.test(text) || words > 8 || text.length > 70 || /[.!]$/.test(text)) return null;
  if (text.endsWith(":") || REQUIREMENT_HEADING.test(text) || OTHER_HEADING.test(text)) return "b";
  return null;
}

const INLINE_HEADING = /^([^:]{3,40}):\s+(.{3,})$/;
// Inside another section (About us, Benefits…) only these open requirements
// inline: "Experience: 20 years serving retail clients" in a company blurb is
// prose, while "Requirements: Python, SQL" is still a heading wherever it is.
const STRONG_INLINE = /^(?:requirements?|qualifications?|(?:required|technical|key|core) skills?|skills?|must.haves?|nice.to.haves?)$/i;
// The block the scrapers weld in from JSON-LD `qualifications`: a heading that
// reads exactly "Qualifications".
const JSONLD_HEADING = /^qualifications$/i;

export function requirementsSection(description) {
  const lines = toLines(description);
  const picked = [];
  let inRequirements = false;
  // Under a clearly non-requirements heading (About us, Benefits, …).
  let inOther = false;
  // Whether the open requirements block is the JSON-LD Qualifications block,
  // and whether any picked line came from one: the tier is decided by where
  // the lines actually came from, not by the heading existing somewhere (an
  // empty trailing Qualifications heading is common on smartrecruiters).
  let fromJsonld = false;
  let sawJsonld = false;
  const pick = (text) => {
    picked.push(text);
    if (fromJsonld) sawJsonld = true;
  };
  const isOther = (text) => OTHER_HEADING.test(text) || NON_JOB_HEADING.test(text);
  for (const line of lines) {
    // "Requirements: Python, SQL" — a heading and its content on one line,
    // sometimes inside the heading element itself.
    const inline = INLINE_HEADING.exec(line.text);
    const prefix = inline?.[1].trim();
    if (inline && prefix.split(" ").length <= 5 && REQUIREMENT_HEADING.test(prefix)) {
      if (!inOther || STRONG_INLINE.test(prefix)) {
        if (!inRequirements) fromJsonld = false;
        inRequirements = true;
        inOther = false;
        pick(inline[2]);
      }
      // Otherwise it is prose inside another section; it must not reach the
      // keyword-heading path below either, which would open requirements.
      continue;
    }
    const level = headingLevel(line);
    if (level === "h") {
      inRequirements = REQUIREMENT_HEADING.test(line.text);
      inOther = !inRequirements && isOther(line.text);
      fromJsonld = inRequirements && JSONLD_HEADING.test(line.text);
      continue;
    }
    if (level === "b") {
      if (REQUIREMENT_HEADING.test(line.text)) {
        // A requirements sub-heading inside the JSON-LD block stays part of it.
        if (!(inRequirements && fromJsonld)) fromJsonld = false;
        inRequirements = true;
        inOther = false;
      } else if (OTHER_HEADING.test(line.text)) {
        inRequirements = false;
        inOther = true;
        fromJsonld = false;
      }
      // An unmarked, colon-less keyword line ("SQL and Python experience")
      // may be a requirement rather than a heading, so its text is kept.
      if (inRequirements && !line.marked && !line.text.endsWith(":")) pick(line.text);
      continue;
    }
    if (inRequirements) pick(line.text);
  }
  if (picked.length) {
    return { text: picked.join("\n"), source: sawJsonld ? "jsonld" : "section" };
  }
  return { text: bodyText(description), source: "body" };
}

// The description minus lines under non-job sections (NON_JOB_HEADING), for
// when there is no requirements section to target. Measured on the held-out
// evaluation, whole-description extraction ran at 60% precision against 74-79%
// for targeted sections, largely from company blurbs, perks and location lines
// ("Home Office Stipend", "Datadog values people from all walks of life").
export function bodyText(description) {
  const kept = [];
  let inNonJob = false;
  for (const line of toLines(description)) {
    const level = headingLevel(line);
    if (level) {
      if (NON_JOB_HEADING.test(line.text) && !REQUIREMENT_HEADING.test(line.text)) inNonJob = true;
      else if (level === "h" || REQUIREMENT_HEADING.test(line.text) || OTHER_HEADING.test(line.text)) inNonJob = false;
    }
    if (!inNonJob) kept.push(line.text);
  }
  return kept.join("\n");
}
