// The single AI call over the resume. The only module that knows the prompt.
//
// Returns ok:false rather than a partial result on every failure path,
// including a well-formed response of the wrong shape: a scan built on {} is
// worse than no scan, because the user acts on it.
import { chat } from "../ai/openrouter.mjs";

export const EXTRACT_SCHEMA = {
  name: "resume_extract",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["skills", "impact", "headline", "subline"],
    properties: {
      skills: { type: "array", items: { type: "string" }, maxItems: 40 },
      impact: {
        type: "array", maxItems: 12,
        items: {
          type: "object", additionalProperties: false,
          required: ["bullet", "why"],
          properties: { bullet: { type: "string" }, why: { type: "string" } },
        },
      },
      headline: { type: "string" },
      subline: { type: "string" },
    },
  },
};

const SYSTEM = [
  "You read one resume and report what is in it. You never invent facts.",
  "skills: concrete technologies, tools and named methodologies the resume",
  "actually mentions. Normalise to a canonical form (K8s -> Kubernetes,",
  "Golang -> Go, Postgres -> PostgreSQL). Do not add skills that are merely",
  "implied. Do not include job titles, soft skills or company names.",
  "impact: bullets that describe responsibility without a measurable outcome.",
  "headline: one sentence on the resume's overall ATS readiness.",
  "subline: one sentence on the single biggest thing to fix.",
].join(" ");

export async function extractResume(text, { signal, model } = {}) {
  // The static rubric goes in `system` so it sits at the head of the prompt
  // and benefits from the provider's 10x cheaper cached-input reads.
  //
  // `model` is normally undefined, which lets chat() apply MODEL. Task 10's
  // harness passes it to evaluate an alternative; without threading it here
  // the harness would report on the default model whatever it was asked for.
  const result = await chat({
    system: SYSTEM,
    user: String(text || "").slice(0, 24000),
    schema: EXTRACT_SCHEMA,
    maxTokens: 1500,
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
  // strict:true should guarantee the shape, but a provider that silently
  // ignores the schema must not reach the scorer. `typeof null === "object"`,
  // so the null/array checks must come first: without them a content body of
  // the literal string "null" parses cleanly and then crashes on
  // `payload.skills` below instead of degrading to ok:false like every other
  // non-object JSON value (numbers, strings, booleans, arrays) already does.
  if (
    !payload || typeof payload !== "object" || Array.isArray(payload) ||
    !Array.isArray(payload.skills) ||
    !Array.isArray(payload.impact) ||
    typeof payload.headline !== "string" || !payload.headline ||
    typeof payload.subline !== "string" || !payload.subline
  ) {
    return { ok: false, reason: "invalid", detail: "response did not match the schema" };
  }

  return {
    ok: true,
    skills: payload.skills.map((s) => String(s).trim()).filter(Boolean),
    // Both fields are required by the documented contract
    // (Array<{bullet, why}>), so coerce each to a trimmed string — matching
    // the treatment `skills` already gets — and drop any entry left with
    // either field empty (e.g. `why` missing, or `bullet` blank).
    impact: payload.impact
      .map((i) => (i && typeof i === "object"
        ? { bullet: String(i.bullet ?? "").trim(), why: String(i.why ?? "").trim() }
        : null))
      .filter((i) => i && i.bullet && i.why),
    headline: payload.headline,
    subline: payload.subline,
  };
}
