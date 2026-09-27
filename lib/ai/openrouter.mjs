// lib/ai/openrouter.mjs — OpenRouter chat client. The default model, seed and
// reasoning effort come from lib/resume/model.mjs (gemini-2.5-flash-lite).
//
// Returns a result object and never throws. Callers are user-facing features
// (resume scanning, fit explanations, cover letters) where an AI outage must
// degrade to a clear message rather than a 500 — and must never degrade to
// invented output, because users act on these results.

import { MODEL, SEED, REASONING_EFFORT } from "../resume/model.mjs";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export function isAiConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export async function chat(args) {
  const {
    system, user, model = MODEL, maxTokens = 1024, signal,
    schema = null, temperature = 0, seed = SEED,
    reasoningEffort = REASONING_EFFORT,
  } = args ?? {};
  if (!isAiConfigured()) return { ok: false, reason: "unconfigured" };

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

  const body = {
    model, messages, max_tokens: maxTokens,
    temperature, seed,
    // "none" switches thinking off explicitly rather than leaving it to the
    // provider's default. Extraction calls need no reasoning, and on
    // gemini-2.5-flash-lite "low" spent ~350 of an 800-token budget before
    // writing any output (measured 2026-09-26).
    reasoning: reasoningEffort === "none" ? { enabled: false } : { effort: reasoningEffort },
    // The payload is CV text. Deny provider-side collection explicitly
    // rather than relying on a default we do not control.
    provider: { data_collection: "deny" },
  };
  // Only attach when asked: an empty response_format is rejected outright.
  if (schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: schema.name, strict: true, schema: schema.schema },
    };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // OpenRouter attributes usage with these; harmless when unset.
        "HTTP-Referer": process.env.PUBLIC_BASE_URL || "http://localhost:4100/jobs",
        "X-Title": "LeadNear Jobs",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("OpenRouter HTTP", response.status, detail.slice(0, 200));
      return { ok: false, reason: "http", detail: String(response.status) };
    }

    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content ?? "";
    return { ok: true, text };
  } catch (error) {
    console.error("OpenRouter request failed", error);
    return { ok: false, reason: "network", detail: error.message };
  }
}
