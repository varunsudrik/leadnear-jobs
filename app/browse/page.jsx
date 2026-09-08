// The search-and-listing landing page that previously served /jobs.
// /jobs now serves the marketing homepage (LeadNearJobsHome), matching the
// role leadnear.com's root plays; this keeps the full listing experience
// reachable and indexable rather than dropping it.
import { Suspense } from "react";
import Link from "next/link";
import { searchJobs } from "@/lib/jobs";
import JobCard from "@/components/JobCard";
import Filters from "@/components/Filters";
import Pagination from "@/components/Pagination";
import SearchBox from "../SearchBox";
import LiveJobCount from "../LiveJobCount";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Search Jobs by Company, Location & Title | LeadNear Jobs",
  description: "Search jobs from companies worldwide. Filter by role, location, salary, category, and remote work.",
  alternates: { canonical: "https://www.leadnear.com/jobs/browse" },
};

export default async function BrowseJobsPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const results = await searchJobs({ q: sp.q, location: sp.location, remote: sp.remote, type: sp.type, salary_min: sp.salary_min, category: sp.category, days: sp.days, page: sp.page || 1 }).catch(() => ({ jobs: [], total: 0, page: 1, pageSize: 20 }));
  return <div><section className="directory-hero"><div className="container"><span className="eyebrow">LeadNear Jobs</span><h1>Find your next opportunity</h1><p>Search current openings by role, company, location, salary, and work style.</p><SearchBox initialQuery={sp.q || ""} initialLocation={sp.location || ""} /></div></section><div className="container directory-content"><Suspense><Filters /></Suspense><div className="results-header"><h1 className="results-count"><LiveJobCount initialCount={Number(results.total)} /> jobs available</h1><Link href="/remote" className="section-action-btn">Browse remote jobs</Link></div>{results.jobs.length ? <><div className="job-list">{results.jobs.map((job) => <JobCard key={job.db_id} job={job} />)}</div><Suspense><Pagination total={results.total} pageSize={20} /></Suspense></> : <div className="empty-box"><div className="em-icon">⌕</div><p>No jobs found. Try changing your search or filters.</p></div>}</div></div>;
}
