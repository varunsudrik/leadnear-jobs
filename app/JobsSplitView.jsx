"use client";
import { Suspense, useEffect, useState } from "react";
import JobCard from "@/components/JobCard";
import JobPreview from "@/components/JobPreview";
import Pagination from "@/components/Pagination";

// Extracted from app/page.jsx (Task 5, spec lines 87-133) so the selection
// state driving the preview pane — which JobCard already supports via its
// `selected`/`onSelect` props (Task 3) — can live in a client component
// while app/page.jsx stays a server component doing the SSR data fetch.

// Below this width the split pane is CSS-hidden (app/globals.css,
// ".jobs-layout"/".job-preview" at max-width:900px, Task 8) and the design
// reverts to a single scrolling card list (spec's "C Mobile" screen has no
// inline preview at all). That CSS rule alone isn't enough here: JobCard's
// onClick calls preventDefault() whenever it's given an onSelect (see
// JobCard.jsx), which is what lets a click update `selectedSlug` instead of
// following the link — so on a narrow viewport, passing onSelect
// unconditionally would silently swallow the tap (no navigation, and no
// visible change since the pane is hidden). Gating onSelect on the same
// breakpoint restores plain navigation to the job's own page below 900px,
// matching the design intent. Keep this value in sync with the CSS
// breakpoint below.
const PREVIEW_BREAKPOINT = "(max-width: 900px)";

export default function JobsSplitView({ jobs, total }) {
  const [selectedSlug, setSelectedSlug] = useState(jobs[0]?.job_slug ?? null);
  // Defaults to the desktop behaviour so the very first client render
  // matches the server-rendered markup (no window/matchMedia during SSR);
  // the effect below corrects it immediately after mount, before any click
  // is possible.
  const [showPreview, setShowPreview] = useState(true);

  // app/page.jsx no longer remounts this component on every searchParams
  // change (that was coarser than the bug it fixed — an unrelated param, or
  // even a sort-order change that leaves the selected job in the new page,
  // forced a full remount and a needless preview refetch/loading flash).
  // Instead, validate the current selection against the incoming `jobs` on
  // every render: keep it if the job is still present, otherwise fall back
  // to the new first row (or null when there are no results).
  useEffect(() => {
    if (!jobs.some((j) => j.job_slug === selectedSlug)) {
      setSelectedSlug(jobs[0]?.job_slug ?? null);
    }
  }, [jobs, selectedSlug]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(PREVIEW_BREAKPOINT);
    const updatePreviewVisibility = () => setShowPreview(!mediaQuery.matches);

    updatePreviewVisibility();
    mediaQuery.addEventListener("change", updatePreviewVisibility);

    return () => mediaQuery.removeEventListener("change", updatePreviewVisibility);
  }, []);

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
                  selected={showPreview && job.job_slug === selectedSlug}
                  onSelect={showPreview ? (selected) => setSelectedSlug(selected.job_slug) : null}
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
      {showPreview && <JobPreview slug={selectedSlug} />}
    </div>
  );
}
