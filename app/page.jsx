import { Suspense } from "react";
import { searchJobs } from "@/lib/jobs";
import Filters from "@/components/Filters";
import HomeHero from "@/components/HomeHero";
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
    <div className="home-shell">
      <HomeHero />
      <Suspense>
        <Filters initialCount={Number(results.total)} />
      </Suspense>
      {/* JobsSplitView validates `selectedSlug` against the incoming `jobs`
          itself (falling back to the first row when the previous selection
          isn't in the new result set) — see the effect there. No `key` here:
          keying on the raw searchParams would remount on any unrelated
          param and would also discard a still-valid selection whenever the
          new jobs array happens to contain it (e.g. a sort-order change),
          forcing a needless preview refetch and loading flash. */}
      <JobsSplitView jobs={results.jobs} total={results.total} />
    </div>
  );
}
