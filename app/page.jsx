import { Suspense } from "react";
import Link from "next/link";
import { searchJobs } from "@/lib/jobs";
import Filters from "@/components/Filters";
import SearchBox from "./SearchBox";
import JobsSplitView from "./JobsSplitView";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Search Jobs by Company, Location & Title | LeadNear Jobs",
  description: "Search jobs from companies worldwide. Filter by role, location, salary, category, and remote work.",
  alternates: { canonical: "https://www.leadnear.com/jobs" },
};

export default async function JobsPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const results = await searchJobs({
    q: sp.q,
    location: sp.location,
    remote: sp.remote,
    type: sp.type,
    salary_min: sp.salary_min,
    category: sp.category,
    days: sp.days,
    sort: sp.sort,
    page: sp.page || 1,
  }).catch(() => ({ jobs: [], total: 0, page: 1, pageSize: 20 }));

  return (
    <div>
      <section className="directory-hero">
        <div className="container">
          <span className="eyebrow">LeadNear Jobs</span>
          <h1>Find your next opportunity</h1>
          <p>Search current openings by role, company, location, salary, and work style.</p>
          <SearchBox initialQuery={sp.q || ""} initialLocation={sp.location || ""} />
        </div>
      </section>
      <div className="container directory-content">
        <Suspense>
          <Filters initialCount={Number(results.total)} />
        </Suspense>
        <div className="results-header">
          <h1 className="results-count">{results.total.toLocaleString()} jobs available</h1>
          <Link href="/remote" className="section-action-btn">Browse remote jobs</Link>
        </div>
        {/* key forces a remount (and a fresh "select the first result"
            default) whenever the query changes — pagination, a filter, or a
            new search all produce a new `results.jobs` array from the same
            client-component instance, and without a key React would keep the
            old `selectedSlug` state, leaving no card visually selected and
            the preview pinned to a job that may no longer be in the list. */}
        <JobsSplitView key={JSON.stringify(sp)} jobs={results.jobs} total={results.total} />
      </div>
    </div>
  );
}
