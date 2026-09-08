"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtSalary, fmtDate, initials } from "@/lib/format";

const STORAGE_KEY = "leadnear:saved-jobs:v1";

export default function JobCard({ job, highlightSalary = false }) {
  const [saved, setSaved] = useState(false);
  const id = String(job.job_slug || job.db_id);
  const href = `/${job.job_slug}`;
  const salary = fmtSalary(job);
  const locations = Array.isArray(job.locations) ? job.locations.slice(0, 3) : [];
  const location = locations.length ? locations.map((item) => item.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())).join(", ") : job.remote ? "Remote" : "Location flexible";

  useEffect(() => {
    try {
      const values = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      setSaved(Array.isArray(values) && values.map(String).includes(id));
    } catch {}
  }, [id]);

  const toggleSaved = () => {
    let values = [];
    try { values = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch {}
    if (!Array.isArray(values)) values = [];
    values = values.map(String);
    const next = values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaved(next.includes(id));
  };

  return (
    <article className={`job-card-inner${highlightSalary ? " high-pay" : ""}`}>
      <div className="jc-header">
        <div className="jc-avatar" aria-hidden="true">{initials(job.company)}</div>
        <div className="jc-title-col">
          <Link href={href} className="jc-title">{job.title}</Link>
          <div className="jc-company">{job.company}</div>
        </div>
      </div>
      <div className="jc-meta">
        <div className="jc-pills">
          {job.remote ? <span className="jc-pill jcp-remote">Remote</span> : null}
          {job.employment_type ? <span className="jc-pill jcp-type">{job.employment_type.replace(/[-_]/g, " ")}</span> : null}
          {salary ? <span className={`jc-pill ${highlightSalary ? "jcp-hipay" : "jcp-salary"}`}>{salary}</span> : null}
        </div>
        <div className="jc-footer">
          <span className="jc-loc">⌖ {location}</span>
          {job.posted_at && <time className="jc-date" dateTime={String(job.posted_at)}>Posted {fmtDate(job.posted_at)}</time>}
        </div>
      </div>
      <div className="jc-actions">
        <button type="button" className={`jc-save${saved ? " saved" : ""}`} onClick={toggleSaved} aria-pressed={saved} aria-label={saved ? `Remove ${job.title} from saved jobs` : `Save ${job.title}`}>
          <span aria-hidden="true">{saved ? "★" : "☆"}</span>
          <span>{saved ? "Saved" : "Save"}</span>
        </button>
        <Link href={href} className="jc-apply-badge">
          <span>View &amp; Apply</span><span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
