import { resumeScan } from "@/lib/demo-resume";
import { DEMO_SCANS_USED, DEMO_QUOTA } from "@/lib/demo-fit";
import ResumeScan from "@/components/ResumeScan";
import DemoOffPanel from "@/components/DemoOffPanel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Resume scan | LeadNear Jobs",
  description: "ATS score and fixes for your resume.",
  // Every value on this page is demo content. It must never be indexed, and it
  // is deliberately absent from app/sitemap.js for the same reason.
  robots: "noindex",
};

export default function ResumePage() {
  const data = resumeScan();
  if (!data) return <DemoOffPanel what="Resume scoring" />;
  return <ResumeScan data={data} scansUsed={DEMO_SCANS_USED} quota={DEMO_QUOTA} />;
}
