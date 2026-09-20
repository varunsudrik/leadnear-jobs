import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { latestScan, scanQuota } from "@/lib/resume/store.mjs";

// Real ranking needs corpus comparison against a parsed resume — plan 2's
// job. Task 9 retired the hash-based fit layer (the old fit-tier module, its
// job-bucketing helper, and the resume-fixture module it shared) that used
// to bucket a cohort of jobs here into Strong/Good/Low: a fabricated ranking attached to real,
// named employers and their real postings is worse than none, because a
// visitor cannot tell it's fake. Until plan 2 ships, this route is a "no
// matches yet" empty state — but WHICH empty state depends on the viewer:
// nobody gets a ranking today, but "come back after you scan" is false for
// someone who already has (and reads as "you get to burn another of your 3
// free scans for nothing"), so this reads the session and the scan store
// the same way app/resume/page.jsx does, and picks the honest copy.
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

  // Signed in, already scanned: the broken case this task exists to fix.
  // Nobody gets a ranking yet, but this viewer already did the one thing the
  // old copy told them to do — so it says so by name, sends them to the
  // result they already have instead of a second upload button, and does
  // not put a date on ranking (we don't have one).
  return (
    <div className="console-shell">
      <h1 className="rs-title" style={{ marginBottom: 16 }}>Matches</h1>
      <div className="empty-box">
        <div className="em-icon">🎯</div>
        <p>No matches yet</p>
        <p style={{ color: "var(--text3)", marginTop: ".5rem", fontSize: ".9rem" }}>
          Your resume — {scan.filename} — is already scanned. Ranking it against
          live postings isn&apos;t available yet, so there&apos;s nothing new to
          upload here.
        </p>
        <Link href="/resume" className="ru-browse" style={{ marginTop: "1rem", display: "inline-block" }}>
          View your scan
        </Link>
        {quota.remaining > 0 && (
          <div className="ru-hint mono">{quota.remaining} of {quota.quota} free scans left</div>
        )}
      </div>
    </div>
  );
}
