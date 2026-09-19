// The only module that knows what a PDF is. Everything downstream sees text
// and numbered lines.
//
// Never throws: callers are user-facing and must distinguish "your file is a
// picture" (a real finding about the resume) from "our parser broke" (our
// problem, and not chargeable to the user's quota).
import { extractText, getDocumentProxy } from "unpdf";

export const LIMITS = { maxBytes: 2000000, maxPages: 10 };

export async function parseResume(buffer, filename = "") {
  if (!buffer || buffer.length === 0) {
    // A zero-byte or missing upload is a client error, not a server fault:
    // it genuinely is not a PDF, so it stays within the five contractual
    // reason values and maps to the same 422 as the other client-side
    // rejections instead of a 500.
    return { ok: false, reason: "not-pdf", detail: "empty file" };
  }
  if (buffer.length > LIMITS.maxBytes) {
    return { ok: false, reason: "too-large", detail: `${(buffer.length / 1e6).toFixed(1)} MB` };
  }
  // Sniff the magic bytes. The extension is caller-controlled, so a renamed
  // .docx must not reach the parser.
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { ok: false, reason: "not-pdf", detail: filename.split(".").pop() || "unknown" };
  }

  let pages, text;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    pages = pdf.numPages;
    if (pages > LIMITS.maxPages) {
      return { ok: false, reason: "too-many-pages", detail: `${pages} pages` };
    }
    ({ text } = await extractText(pdf, { mergePages: true }));
  } catch (error) {
    return { ok: false, reason: "unreadable", detail: error.message };
  }

  const cleaned = String(text || "").replace(/\r/g, "");
  // An image-only PDF yields whitespace. That is a finding, not a failure:
  // every ATS receiving it reads nothing either.
  if (cleaned.trim().length < 40) {
    return { ok: false, reason: "no-text", detail: `0 characters extracted from ${pages} pages` };
  }

  const lines = cleaned.split("\n").map((t, i) => ({ n: i + 1, text: t.replace(/\s+$/, "") }));
  return { ok: true, text: cleaned, pages, lines };
}
