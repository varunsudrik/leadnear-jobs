"use client";
import { Suspense, useState } from "react";
import JobCard from "@/components/JobCard";
import JobPreview from "@/components/JobPreview";
import Pagination from "@/components/Pagination";

// Extracted from app/page.jsx (Task 5, spec lines 87-133) so the selection
// state driving the preview pane — which JobCard already supports via its
// `selected`/`onSelect` props (Task 3) — can live in a client component
// while app/page.jsx stays a server component doing the SSR data fetch.
export default function JobsSplitView({ jobs, total }) {
  const [selectedSlug, setSelectedSlug] = useState(jobs[0]?.job_slug ?? null);

  return (
    <div className="jobs-layout">
      <div className="job-list-col">
        {jobs.length ? (
          <>
            <div className="job-list">
              {jobs.map((job) => (
                <JobCard
                  key={job.db_id}
                  job={job}
                  selected={job.job_slug === selectedSlug}
                  onSelect={(selected) => setSelectedSlug(selected.job_slug)}
                />
              ))}
            </div>
            <Suspense>
              <Pagination total={total} pageSize={20} />
            </Suspense>
          </>
        ) : (
          <div className="empty-box">
            <div className="em-icon">⌕</div>
            <p>No jobs found. Try changing your search or filters.</p>
          </div>
        )}
      </div>
      <JobPreview slug={selectedSlug} />
    </div>
  );
}
