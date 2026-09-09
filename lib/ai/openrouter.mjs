// lib/ai/openrouter.mjs — OpenRouter chat client (DeepSeek by default).
//
// Returns a result object and never throws. Callers are user-facing features
// (resume scanning, fit explanations, cover letters) where an AI outage must
// degrade to a clear message rather than a 500 — and must never degrade to
// invented output, because users act on these results.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "deepseek/deepseek-chat";

export function isAiConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export async function chat({ system, user, model = DEFAULT_MODEL, maxTokens = 1024, signal } = {}) {
  if (!isAiConfigured()) return { ok: false, reason: "unconfigured" };

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

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
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
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
