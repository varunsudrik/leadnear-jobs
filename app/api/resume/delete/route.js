// Honours the deletion the UI promises. POST, not GET: it is destructive and
// must not be triggerable by a prefetch or a link crawler.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { deleteScans } from "@/lib/resume/store.mjs";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ ok: false, reason: "signed-out" }, { status: 401 });

  // Scoped to the caller's own rows by userId. Cascades to ResumeScanTarget.
  const { count } = await deleteScans(userId);
  return NextResponse.json({ ok: true, deleted: count });
}
