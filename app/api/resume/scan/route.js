// Orchestrates the scan. The ordering here is the spec's "never half-score"
// rule made concrete: parse, extract, assemble, and only then write. Any
// failure returns before the write, so the user is never charged for a scan
// they did not receive.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { parseResume } from "@/lib/resume/parse.mjs";
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

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return fail(401, "signed-out", "Sign in to scan a resume.");

  const quota = await scanQuota(userId);
  if (quota.exhausted) return fail(402, "quota", `${quota.used} of ${quota.quota} free scans used`);

  let file;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return fail(400, "bad-request", "Expected a multipart upload.");
  }
  if (!file || typeof file.arrayBuffer !== "function") {
    return fail(400, "bad-request", "No file was uploaded.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseResume(buffer, file.name || "resume.pdf");
  if (!parsed.ok) {
    // "no-text" is a finding about the resume, not a server error, so it is a
    // 200-adjacent 422 rather than a 500 — and it still costs no quota.
    return fail(parsed.reason === "unreadable" ? 500 : 422, parsed.reason, parsed.detail);
  }

  const extracted = await extractResume(parsed.text);
  if (!extracted.ok) {
    return fail(extracted.reason === "unconfigured" ? 503 : 502, "scanner", extracted.detail || extracted.reason);
  }

  const checks = formatChecks(parsed);
  const built = buildScan({ parsed, checks, extracted, filename: file.name || "resume.pdf" });

  // The write is the last thing that happens, and it is what consumes quota.
  const saved = await saveScan(userId, built);
  return NextResponse.json({ ok: true, scan: { ...built, id: saved.id } });
}
