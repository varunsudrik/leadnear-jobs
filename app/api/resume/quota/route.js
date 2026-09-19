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
  return NextResponse.json({ ...(await scanQuota(session.user.id)), signedIn: true });
}
