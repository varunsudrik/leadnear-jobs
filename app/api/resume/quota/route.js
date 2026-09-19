// AuthNav is a client component using useSession, so the header pips cannot
// read the derived quota directly. This is the smallest surface that lets them.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { scanQuota, QUOTA } from "@/lib/resume/store.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ used: 0, quota: QUOTA, remaining: QUOTA, exhausted: false, signedIn: false });
  }
  try {
    const quota = await scanQuota(session.user.id);
    return NextResponse.json({ ...quota, signedIn: true });
  } catch (error) {
    console.error("scanQuota failed", error);
    return NextResponse.json(
      { ok: false, reason: "storage", detail: "Could not check your scan quota.", quotaConsumed: false },
      { status: 503 }
    );
  }
}
