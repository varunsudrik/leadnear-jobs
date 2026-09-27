"use client";
import Link from "next/link";
import { fmtSalary, fmtDate, initials } from "@/lib/format";

// The only consumer of this label set, now that the old fit-layer module is
// gone — moved here rather than deleted outright because job.fit still uses these
// three tiers, and will keep using them once a real scoring subsystem sets
// job.fit (plan 2).
const FIT_LABEL = { strong: "Strong fit", good: "Good fit", low: "Low fit" };

export default function JobCard({ job, selected = false, onSelect = null, reason = null }) {
  const href = `/${job.job_slug}`;
  const salary = fmtSalary(job);
  const locations = Array.isArray(job.locations) ? job.locations.slice(0, 3) : [];
  const location = locations.length
    ? locations.map((item) => item.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())).join(", ")
    : job.remote ? "Remote" : "Location flexible";

  // job.fit is set by the scoring subsystem for signed-in users who have
  // scanned. Nothing else sets it, and nothing fabricates one: a job with no
  // computed fit renders no badge at all, never a guessed "Low fit", which
  // would read as a judgement of the job.
  const fit = job.fit ?? null;

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
      {/* /matches is the only caller today (lib/resume/match.mjs cardReason):
          a factual readout of the job's own requirements — "Covers 4 of 5
          requirements · missing X, Y · 3 postings" — never AI prose and never
          a percentage. */}
      {reason ? <div className="jc-reason">{reason}</div> : null}
    </Link>
  );
}
