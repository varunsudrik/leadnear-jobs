// Honours the deletion the UI promises. POST, not GET: it is destructive and
// must not be triggerable by a prefetch or a link crawler.
//
// This redacts rather than deletes (lib/resume/store.mjs's redactScans):
// quota is COUNT(*) over ResumeScan rows (spec D8), so a hard delete would
// let a signed-in user reset their free scans for free by deleting and
// re-scanning — the exact spend the sign-in requirement (spec D1) exists to
// prevent. Route name and response shape are unchanged; only which rows
// survive is different.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { redactScans } from "@/lib/resume/store.mjs";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ ok: false, reason: "signed-out" }, { status: 401 });

  // Scoped to the caller's own rows by userId.
  try {
    const { count } = await redactScans(userId);
    return NextResponse.json({ ok: true, deleted: count });
  } catch (error) {
    console.error("redactScans failed", error);
    return NextResponse.json(
      { ok: false, reason: "storage", detail: "Could not delete your scans.", quotaConsumed: false },
      { status: 503 }
    );
  }
}
