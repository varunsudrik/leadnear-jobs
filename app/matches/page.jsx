import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { latestScan, scanQuota } from "@/lib/resume/store.mjs";
import { rankJobs, bucketByOverlap, DEFAULT_LIMIT } from "@/lib/resume/match.mjs";
import MatchesList from "@/components/MatchesList";

// Signed-out and no-scan-yet stay honest empty states (nothing to rank
// without a resume). Signed-in-with-a-scan now does the real thing: rank
// live jobs against the scan's stored skill vector via lib/resume/match.mjs
// (design doc section 4) and render them Strong/Good/Low. This reads the
// session and the scan store the same way app/resume/page.jsx does, and
// picks the copy/behaviour that matches what the viewer has actually done.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your matches | LeadNear Jobs",
  description: "Open roles ranked against your resume.",
  // Nothing here is per-user or rankable yet, so it stays out of the index —
  // same reasoning as when this page showed demo content, different cause.
  robots: "noindex",
};

export default async function MatchesPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  // Signed out: no account means no scan means nothing to rank, and no
  // upload CTA either — that button hits an auth wall, not a scan. This is
  // the marketing case, so it says what matches will be and points at
  // sign-in, the same job ResumeSignedOut does on /resume.
  if (!userId) {
    return (
      <div className="console-shell">
        <h1 className="rs-title" style={{ marginBottom: 16 }}>Matches</h1>
        <div className="empty-box">
          <div className="em-icon">🎯</div>
          <p>No matches yet</p>
          <p style={{ color: "var(--text3)", marginTop: ".5rem", fontSize: ".9rem" }}>
            Matches come from your resume. Sign in to scan one and we&apos;ll
            rank open roles here once ranking is live.
          </p>
          <Link
            href={{ pathname: "/signin", query: { callbackUrl: "/resume" } }}
            className="ru-browse"
            style={{ marginTop: "1rem", display: "inline-block" }}
          >
            Sign in to scan
          </Link>
          <div className="ru-hint mono">3 free scans · no card</div>
        </div>
      </div>
    );
  }

  const [scan, quota] = await Promise.all([latestScan(userId), scanQuota(userId)]);

  // Signed in, no scan yet: this IS the "scan one to get matches" case, so
  // the original copy and its upload CTA are correct as they stand.
  if (!scan) {
    return (
      <div className="console-shell">
        <h1 className="rs-title" style={{ marginBottom: 16 }}>Matches</h1>
        <div className="empty-box">
          <div className="em-icon">🎯</div>
          <p>No matches yet</p>
          <p style={{ color: "var(--text3)", marginTop: ".5rem", fontSize: ".9rem" }}>
            Matches come from your resume. Scan one and we&apos;ll rank open roles
            here once ranking is live.
          </p>
          {/* .ru-browse and .ru-hint are ResumeUpload.jsx's own classes, reused
              verbatim here rather than adding new CSS for a second dark pill
              button and mono caption that look identical. No Strong/Good/Low
              preview grid and no roles-count claim (the mock's "128,431 live
              roles" figure) — both would preview a ranking that does not exist
              yet, the exact kind of forward-looking claim this task removes. */}
          <Link href="/resume" className="ru-browse" style={{ marginTop: "1rem", display: "inline-block" }}>
            Upload your resume
          </Link>
          <div className="ru-hint mono">PDF · max 2 MB · 3 free scans</div>
        </div>
      </div>
    );
  }

  // Signed in, already scanned: the real ranking. rankJobs sanitizes the
  // stored skill list itself and hands back that sanitized list alongside
  // the rows — bucketByOverlap's skillCount and MatchesList's reason lines
  // both have to divide by that same (post-sanitize) count, not scan.skills
  // itself, or a blank/duplicate skill entry would silently disagree with
  // what the ranking query actually matched against.
  const { rows, skills } = await rankJobs({ skills: scan.skills, limit: DEFAULT_LIMIT });
  const buckets = bucketByOverlap(rows, skills.length);
  return <MatchesList scan={scan} buckets={buckets} skills={skills} quota={quota} />;
}
