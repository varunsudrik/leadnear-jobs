"use client";
import { useState } from "react";
import Link from "next/link";
import InertButton from "@/components/InertButton";
import { fmtSalary } from "@/lib/format";

const QUEUE_NOT_LIVE = "Auto-apply isn't live yet";

// Initial rows per bucket, matching the mock.
const INITIAL = { strong: 4, good: 3, low: 2 };

const BUCKETS = [
  { key: "strong", label: "Strong", actions: true },
  { key: "good",   label: "Good",   actions: true },
  { key: "low",    label: "Low",    actions: false },
];

// attachLocations attaches location_slug values ("new-york"), not display
// text — the same shape components/JobCard.jsx receives and title-cases.
// components/JobPreview.jsx does NOT do this because getJob() gives it
// location_raw, which is already readable. Do not copy that component here.
//
// The fallback is not decorative: measured against this dataset, only about
// one job in five has a non-empty location slug, so without it four rows in
// five would show a bare company name — while the same job on the home page
// reads "Company · Remote". This mirrors JobCard's fallback exactly.
function toLocationLabel(job) {
  const locations = Array.isArray(job.locations) ? job.locations : [];
  if (locations.length) {
    return locations
      // Three, the same as JobCard. It was two, so a job listed in three
      // places read differently on /jobs and /matches — the cross-screen
      // disagreement this screen exists to avoid.
      .slice(0, 3)
      .map((item) => item.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
      .join(", ");
  }
  return job.remote ? "Remote" : "Location flexible";
}

function MatchRow({ row, tier, actions }) {
  const salary = fmtSalary(row);
  const location = toLocationLabel(row);
  return (
    <div className={`mb-card ${tier}`}>
      <Link href={`/${row.job_slug}`} className="mb-role">{row.title}</Link>
      <div className="mb-sub">{row.company} · {location}</div>
      <div className={`mb-why ${tier}`}>{row.why}</div>
      {actions ? (
        <div className="mb-foot">
          <span className="mb-salary">{salary ?? "—"}</span>
          <div className="mb-actions inert-note-row">
            <InertButton className="mb-queue" note={QUEUE_NOT_LIVE}>+ Queue</InertButton>
            {/* Expanding Strong and Good puts roughly 80 of these on the
                page, all pointing somewhere different. Without a label they
                all announce as "Apply" — components/JobCard.jsx names its
                own link the same way. */}
            <Link href={`/${row.job_slug}`} className="mb-apply" aria-label={`Apply to ${row.title}`}>Apply</Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function MatchBuckets({ buckets }) {
  const [expanded, setExpanded] = useState({});
  const [tab, setTab] = useState("strong");

  return (
    <>
      <div className="mb-tabs">
        {BUCKETS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            className={`mb-tab${tab === key ? " active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label} <span className="mono">{buckets[key].length}</span>
          </button>
        ))}
      </div>
      <div className="mb-grid">
        {BUCKETS.map(({ key, label, actions }) => {
          const rows = buckets[key];
          const shown = expanded[key] ? rows.length : Math.min(INITIAL[key], rows.length);
          const remaining = rows.length - shown;
          return (
            <section
              className={`mb-col${tab === key ? " active" : ""}`}
              key={key}
              aria-label={`${label} matches`}
            >
              <div className="mb-head inert-note-row">
                <span className={`mb-head-label ${key}`}>
                  <span className={`mb-dot ${key}`} aria-hidden="true" />
                  {label}
                  <span className="mono">{rows.length}</span>
                </span>
                {key === "strong" && rows.length > 0 ? (
                  <InertButton className="mb-queue-all" note={QUEUE_NOT_LIVE}>
                    Queue all {rows.length}
                  </InertButton>
                ) : null}
                {key === "low" ? <span className="mb-collapsed">collapsed</span> : null}
              </div>
              <div className="mb-list">
                {rows.slice(0, shown).map((row) => (
                  <MatchRow key={row.db_id} row={row} tier={key} actions={actions} />
                ))}
                {remaining > 0 ? (
                  <button type="button" className="mb-more" onClick={() => setExpanded((e) => ({ ...e, [key]: true }))}>
                    Show {remaining} more
                  </button>
                ) : null}
                {key === "low" ? (
                  <div className="mb-note">
                    Low-fit roles are excluded from auto-apply. Add a target title or close a missing keyword to move roles up.
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
