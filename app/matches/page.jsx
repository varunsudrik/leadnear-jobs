import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { latestScan, scanQuota } from "@/lib/resume/store.mjs";
import { rankJobs, bucketByCoverage, dedupePostings, DEFAULT_LIMIT } from "@/lib/resume/match.mjs";
import { vocabVersion } from "@/lib/skills/vocab.mjs";
import MatchesList from "@/components/MatchesList";

// A scan's skills never change, so its ranking is cached rather than re-run on
// every visit: at production scale one common skill makes tens of thousands of
// candidate jobs to aggregate. Keyed by scan and vocabulary version (the
// function's arguments are part of the key); ten minutes so new and expired
// jobs still show up. Dates come back as ISO strings, which fmtDate accepts.
const rankScan = unstable_cache(
  async (scanId, skills) => rankJobs({ skills, limit: DEFAULT_LIMIT }),
  ["matches-rank", `vocab-${vocabVersion()}`],
  { revalidate: 600 }
);

// Signed-out and no-scan-yet stay honest empty states (nothing to rank
// without a resume). Signed-in with a scan ranks live jobs against the
// scan's skills using each job's extracted skill list (lib/resume/match.mjs,
// docs/superpowers/specs/2026-09-20-job-skill-extraction-design.md §8) and
// renders them Strong/Good/Low. This reads the session and the scan store the
// same way app/resume/page.jsx does.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your matches | LeadNear Jobs",
  description: "Open roles ranked against your resume.",
  // Per-user content: never indexed.
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
            rank open roles against it.
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
            against it.
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

  // Signed in, already scanned: the real ranking. rankJobs maps the stored
  // skills onto the skill vocabulary and returns that mapped list alongside the
  // rows; MatchesList's copy counts from it, not from scan.skills.
  const ranking = await rankScan(scan.id, scan.skills);
  // One card per role: the same role posted per location merges (spec §8.1).
  const buckets = bucketByCoverage(dedupePostings(ranking.rows));
  return (
    <MatchesList
      scan={scan}
      buckets={buckets}
      skills={ranking.skills}
      unknownSkills={ranking.unknown}
      available={ranking.available}
      candidateTotal={ranking.candidateTotal}
      capped={ranking.candidateTotal > ranking.rows.length}
      quota={quota}
    />
  );
}
