"use client";
import Link from "next/link";
import { fmtSalary, fmtDate, initials } from "@/lib/format";

// Fit requires a scored resume (a subsystem that doesn't exist yet). When it
// does, job.fit will be one of these keys — never invent a "low fit" for a
// job that simply hasn't been scored (see the null-render below).
const FIT_LABEL = { strong: "Strong fit", good: "Good fit", low: "Low fit" };

export default function JobCard({ job, selected = false, onSelect = null }) {
  const href = `/${job.job_slug}`;
  const salary = fmtSalary(job);
  const locations = Array.isArray(job.locations) ? job.locations.slice(0, 3) : [];
  const location = locations.length
    ? locations.map((item) => item.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())).join(", ")
    : job.remote ? "Remote" : "Location flexible";

  // Standalone (no onSelect passed): a normal navigable link, same as before.
  // Split-pane (Task 5 passes onSelect): intercept the click and hand
  // selection to the caller instead of navigating away.
  const handleClick = (event) => {
    if (onSelect) {
      event.preventDefault();
      onSelect(job);
    }
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      aria-label={`${job.title} at ${job.company}`}
      className={`job-card${selected ? " selected" : ""}${job.fit === "strong" ? " strong" : ""}`}
    >
      <div className="jc-row">
        <div className="jc-main">
          <span className="jc-avatar" aria-hidden="true">{initials(job.company)}</span>
          <div className="jc-info">
            <div className="jc-name">{job.title}</div>
            <div className="jc-sub">{job.company} · {location}</div>
          </div>
        </div>
        {job.posted_at && (
          <time className="jc-posted" dateTime={String(job.posted_at)}>{fmtDate(job.posted_at)}</time>
        )}
      </div>
      <div className="jc-foot">
        <span className="jc-salary">{salary ?? "—"}</span>
        {/* No resume scored yet -> no fit is known. Render nothing rather than a
            misleading "Low fit", which would read as a judgement of the job. */}
        {job.fit ? <span className={`fit-badge ${job.fit}`}>{FIT_LABEL[job.fit]}</span> : null}
      </div>
    </Link>
  );
}
