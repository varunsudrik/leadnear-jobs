import Link from "next/link";

// Real ranking needs corpus comparison against a parsed resume — plan 2's
// job. Task 9 retired the hash-based fit layer (the old fit-tier module, its
// job-bucketing helper, and the resume-fixture module it shared) that used
// to bucket a cohort of jobs here into Strong/Good/Low: a fabricated ranking attached to real,
// named employers and their real postings is worse than none, because a
// visitor cannot tell it's fake. Until plan 2 ships, this route is a fixed
// "no matches yet" empty state pointing at the real (Task 2-8) resume scan.
export const metadata = {
  title: "Your matches | LeadNear Jobs",
  description: "Open roles ranked against your resume.",
  // Nothing here is per-user or rankable yet, so it stays out of the index —
  // same reasoning as when this page showed demo content, different cause.
  robots: "noindex",
};

export default function MatchesPage() {
  return (
    <div className="console-shell">
      <h1 className="rs-title" style={{ marginBottom: 16 }}>Matches</h1>
      <div className="empty-box">
        <div className="em-icon">🎯</div>
        <p>No matches yet</p>
        <p style={{ color: "var(--text3)", marginTop: ".5rem", fontSize: ".9rem" }}>
          Matches come from your resume. <Link href="/resume">Scan one</Link> and
          we&apos;ll rank open roles here once ranking is live.
        </p>
      </div>
    </div>
  );
}
