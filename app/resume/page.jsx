import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { latestScan, scanQuota } from "@/lib/resume/store.mjs";
import ResumeSignedOut from "@/components/ResumeSignedOut";
import ResumeUpload from "@/components/ResumeUpload";
import ResumeScan from "@/components/ResumeScan";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Resume scan | LeadNear Jobs",
  description: "See your resume the way an ATS sees it.",
  // Personal, per-user output. Never indexed, and deliberately absent from
  // app/sitemap.js for the same reason.
  robots: "noindex",
};

export default async function ResumePage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return <ResumeSignedOut />;

  const [scan, quota] = await Promise.all([latestScan(userId), scanQuota(userId)]);
  if (!scan) return <ResumeUpload quota={quota} />;
  return <ResumeScan data={scan.result} quota={quota} />;
}
