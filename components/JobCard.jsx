"use client";
import Link from "next/link";
import { fmtSalary, fmtDate, initials } from "@/lib/format";
import { FIT_LABEL, fitFor } from "@/lib/demo-fit";

export default function JobCard({ job, selected = false, onSelect = null }) {
  const href = `/${job.job_slug}`;
  const salary = fmtSalary(job);
  const locations = Array.isArray(job.locations) ? job.locations.slice(0, 3) : [];
  const location = locations.length
    ? locations.map((item) => item.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())).join(", ")
    : job.remote ? "Remote" : "Location flexible";

  // job.fit is what a real scoring subsystem will set. Until one exists it is
  // always undefined, and the demo layer supplies a deterministic stand-in
  // (lib/demo-fit.js). With NEXT_PUBLIC_DEMO_FIT=false, fitFor returns null
  // and no badge renders at all — never a fabricated "Low fit", which would
  // read as a judgement of the job.
  const fit = job.fit ?? fitFor(job.job_slug);

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
      className={`job-card${selected ? " selected" : ""}${fit === "strong" ? " strong" : ""}`}
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
        {fit ? <span className={`fit-badge ${fit}`}>{FIT_LABEL[fit]}</span> : null}
      </div>
    </Link>
  );
}
