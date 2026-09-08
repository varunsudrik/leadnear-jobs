// app/search/page.jsx — Search results (Server Component)
import { Suspense } from "react";
import { searchJobs } from "@/lib/jobs";
import JobCard from "@/components/JobCard";
import Filters from "@/components/Filters";
import Pagination from "@/components/Pagination";
import SearchBox from "../SearchBox";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }) {
  const sp = (await searchParams) || {};
  const q = sp.q || "";
  return {
    title:       q ? `${q} Jobs | LeadNear Jobs` : "Search Jobs | LeadNear Jobs",
    description: q ? `Find ${q} jobs worldwide on LeadNear Jobs` : "Search thousands of jobs",
    robots:      "noindex",
    alternates: {
      canonical: "https://www.leadnear.com/jobs/search",
    },
  };
}

export default async function SearchPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const results = await searchJobs({
    q:          sp.q,
    location:   sp.location,
    remote:     sp.remote,
    type:       sp.type,
    salary_min: sp.salary_min,
    category:   sp.category,
    days:       sp.days,
    page:       sp.page || 1,
  }).catch(() => ({ jobs: [], total: 0, page: 1 }));

  const q = sp.q || "";
  const location = sp.location || "";
  const heading = q ? `${q} Jobs` : "Search Jobs";
  const subtitle = [q && `matching “${q}”`, location && `in ${location}`]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="container" style={{ paddingTop: "1.5rem", paddingBottom: "3rem" }}>
      <h1 className="listing-page-title">🔎 {heading}</h1>
      <h1 className={`listing-count-heading${subtitle ? " has-subtitle" : ""}`}>
        {results.total.toLocaleString()} {results.total === 1 ? "listing" : "listings"}
      </h1>
      {subtitle && <p className="listing-subtitle">{subtitle}</p>}

      {/* Search bar */}
      <div style={{ marginBottom: "1.25rem" }}>
        <SearchBox initialQuery={q} initialLocation={location} />
      </div>

      {/* Filters */}
      <Suspense>
        <Filters />
      </Suspense>

      {results.jobs.length === 0 ? (
        <div className="empty-box">
          <div className="em-icon">🔍</div>
          <p>No jobs found{q ? ` for "${q}"` : ""}</p>
          <p style={{ color: "var(--text3)", marginTop: ".5rem", fontSize: ".9rem" }}>Try different keywords or clear some filters</p>
        </div>
      ) : (
        <>
          <div className="job-list">
            {results.jobs.map((job) => <JobCard key={job.db_id} job={job} />)}
          </div>
          <Suspense>
            <Pagination total={results.total} pageSize={20} />
          </Suspense>
        </>
      )}
    </div>
  );
}
