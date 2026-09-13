import Link from "next/link";
import { getMatchCohort } from "@/lib/jobs";
import { bucketJobs } from "@/lib/match-buckets";
import { DEMO_FIT } from "@/lib/demo-fit";
import { matchesSubtitle } from "@/lib/demo-resume";
import MatchBuckets from "@/components/MatchBuckets";
import DemoOffPanel from "@/components/DemoOffPanel";
import DemoDisclosure from "@/components/DemoDisclosure";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your matches | LeadNear Jobs",
  description: "Open roles ranked against your resume.",
  // Bucketing is demo content, so this page must never be indexed. It is
  // deliberately absent from app/sitemap.js for the same reason.
  robots: "noindex",
};

const HIDE_APPLIED_WHY = "Available once applications are tracked";

export default async function MatchesPage({ searchParams }) {
  if (!DEMO_FIT) return <DemoOffPanel what="Match ranking" />;

  const sp = (await searchParams) || {};
  const remote = sp.remote === "1";
  const salaryListed = sp.salary === "1";

  // Filters re-query rather than filtering in the browser: the header total
  // and the per-bucket counts must agree with the rows on screen.
  const jobs = await getMatchCohort({ remote, salaryListed }).catch((error) => {
    console.error("Unable to load the match cohort", error);
    return null;
  });

  if (jobs === null) {
    return (
      <div className="console-shell">
        <div className="empty-box"><p>Could not load matches. Try again shortly.</p></div>
      </div>
    );
  }

  const buckets = bucketJobs(jobs);
  const href = (next) => {
    const params = new URLSearchParams();
    if (next.remote) params.set("remote", "1");
    if (next.salary) params.set("salary", "1");
    const qs = params.toString();
    return qs ? `/matches?${qs}` : "/matches";
  };

  return (
    <div className="console-shell">
      <DemoDisclosure />
      <div className="mb-page-head">
        <div className="mb-page-title">
          <h1 className="rs-title"><span className="mono">{buckets.counts.total}</span> matches</h1>
          {/* Assembled in lib/demo-resume.js, not here: the filename and the
              title are that module's fixtures, and inlining them made this a
              silent second copy of both. */}
          <span className="rs-meta">{matchesSubtitle()}</span>
        </div>
        <div className="mb-filters">
          {/* Links, not buttons: the filter state belongs in the URL so it is
              shareable and works without JavaScript. aria-pressed is a button
              attribute and is invalid here — aria-current marks the active
              item in a set, which is what an engaged filter is. */}
          <Link href={href({ remote: !remote, salary: salaryListed })}
                className="filter-toggle" aria-current={remote ? "true" : undefined}>Remote</Link>
          <Link href={href({ remote, salary: !salaryListed })}
                className="filter-toggle" aria-current={salaryListed ? "true" : undefined}>Salary listed</Link>
          {/* Needs application state that does not exist. A real disabled
              attribute, unlike the placeholder buttons — there is nothing to
              explain on press, the control is simply unavailable. */}
          <button type="button" className="filter-toggle" disabled title={HIDE_APPLIED_WHY}>Hide applied</button>
        </div>
      </div>

      {buckets.counts.total === 0 ? (
        <div className="empty-box"><p>No matches with these filters. Try clearing one.</p></div>
      ) : (
        <MatchBuckets buckets={buckets} />
      )}
    </div>
  );
}
