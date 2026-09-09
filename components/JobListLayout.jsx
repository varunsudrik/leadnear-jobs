// Shared list page layout — used by title/category/country/salary/remote
import { Suspense } from "react";
import Link from "next/link";
import JobCard from "@/components/JobCard";
import Filters from "@/components/Filters";
import Pagination from "@/components/Pagination";

export default function JobListLayout({
  heading, prefix = "📋", subtitle, jobs = [], total = 0, mode,
}) {
  return (
    <div className="container" style={{ paddingTop: "1.5rem", paddingBottom: "3rem" }}>
      <nav style={{ fontSize: ".82rem", color: "var(--text3)", marginBottom: "1rem" }}>
        <Link href="/">Home</Link>
        <span style={{ margin: "0 .4rem" }}>/</span>
        <span>{heading}</span>
      </nav>

      <h1 className="listing-page-title">
        {prefix} {heading}
      </h1>
      <h1 className={`listing-count-heading${subtitle ? " has-subtitle" : ""}`}>
        {total.toLocaleString()} {total === 1 ? "listing" : "listings"}
      </h1>
      {subtitle && (
        <p className="listing-subtitle">
          {subtitle}
        </p>
      )}

      {mode === "remote" && (
        <Suspense><Filters initialCount={Number(total)} /></Suspense>
      )}

      {jobs.length === 0 ? (
        <div className="empty-box">
          <div className="em-icon">🔍</div>
          <p>No jobs found</p>
        </div>
      ) : (
        <>
          <div className="job-list">
            {jobs.map((job) => <JobCard key={job.db_id} job={job} />)}
          </div>
          <Suspense>
            <Pagination total={total} pageSize={20} />
          </Suspense>
        </>
      )}
    </div>
  );
}
