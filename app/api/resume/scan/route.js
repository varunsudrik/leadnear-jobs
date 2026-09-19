// Orchestrates the scan. The ordering here is the spec's "never half-score"
// rule made concrete: parse, extract, assemble, and only then write. Any
// failure returns before the write, so the user is never charged for a scan
// they did not receive.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { parseResume, LIMITS } from "@/lib/resume/parse.mjs";
import { formatChecks } from "@/lib/resume/format-checks.mjs";
import { extractResume } from "@/lib/resume/extract.mjs";
import { buildScan } from "@/lib/resume/score.mjs";
import { saveScan, scanQuota } from "@/lib/resume/store.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The AI call dominates and runs 10-20s. The platform default would cut it off.
export const maxDuration = 60;

const fail = (status, reason, detail) =>
  NextResponse.json({ ok: false, reason, detail, quotaConsumed: false }, { status });

// Client-supplied, stored in an unbounded column and rendered in the UI. No
// traversal or XSS risk today (never used as a path; React escapes it), but
// clamped anyway before it reaches parseResume/buildScan.
const sanitizeFilename = (name) => String(name || "").replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200);

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return fail(401, "signed-out", "Sign in to scan a resume.");

  let quota;
  try {
    quota = await scanQuota(userId);
  } catch (error) {
    console.error("scanQuota failed", error);
    return fail(503, "storage", "Could not check your scan quota.");
  }
  // Reused below: the same 402 body covers both the cheap early rejection
  // (before paying for an AI call the user cannot use) and the authoritative
  // rejection from inside saveScan's transaction (Finding 1).
  const quotaExceeded = () => fail(402, "quota", `${quota.used} of ${quota.quota} free scans used`);
  if (quota.exhausted) return quotaExceeded();

  let file;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return fail(400, "bad-request", "Expected a multipart upload.");
  }
  if (!file || typeof file.arrayBuffer !== "function") {
    return fail(400, "bad-request", "No file was uploaded.");
  }
  // `.size` is available without reading the body. Checking it before
  // arrayBuffer() stops a signed-in user forcing arbitrary memory use per
  // request; parseResume's own size check stays as the real guard for
  // direct callers.
  if (typeof file.size === "number" && file.size > LIMITS.maxBytes) {
    return fail(422, "too-large", `${(file.size / 1e6).toFixed(1)} MB`);
  }

  const filename = sanitizeFilename(file.name) || "resume.pdf";
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseResume(buffer, filename);
  if (!parsed.ok) {
    // Every parseResume reason is a finding about the file the client sent,
    // not a fault on our side — including "unreadable" (a corrupt/unsupported
    // PDF), so all of them are 422, never 500. "unreadable" carries the raw
    // parser exception message in `detail`; log that server-side and return a
    // generic message instead of putting library internals on the wire.
    if (parsed.reason === "unreadable") {
      console.error("parseResume unreadable", parsed.detail);
      return fail(422, "unreadable", "The file could not be read.");
    }
    return fail(422, parsed.reason, parsed.detail);
  }

  const extracted = await extractResume(parsed.text);
  if (!extracted.ok) {
    // Same treatment as "unreadable" above: "network" carries a bare fetch
    // exception message. Every other extract reason (unconfigured/http/
    // invalid) already carries a safe, specific detail worth keeping.
    if (extracted.reason === "network") {
      console.error("extractResume network failure", extracted.detail);
      return fail(502, "scanner", "Could not reach the scanner service.");
    }
    return fail(extracted.reason === "unconfigured" ? 503 : 502, "scanner", extracted.detail || extracted.reason);
  }

  const checks = formatChecks(parsed);
  const built = buildScan({ parsed, checks, extracted, filename });

  // The write is the last thing that happens, and it is what consumes quota.
  let saved;
  try {
    saved = await saveScan(userId, built);
  } catch (error) {
    // P2034: the Serializable transaction in saveScan was aborted because a
    // concurrent request from the same user raced it — the correct response
    // is the same 402 as an ordinary quota rejection, not a 500.
    if (error?.code === "P2034") return quotaExceeded();
    console.error("saveScan failed", error);
    return fail(503, "storage", "Could not save the scan.");
  }
  if (saved.overQuota) return quotaExceeded();

  return NextResponse.json({ ok: true, scan: { ...built, id: saved.id } });
}
