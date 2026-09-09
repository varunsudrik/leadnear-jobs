"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatAtsLabel } from "@/lib/ats";
import { fmtSalary, fmtDate } from "@/lib/format";
import { decodeEntities, sanitiseHtml } from "@/lib/sanitize";
import { getPreviewBreakpointQuery } from "@/lib/previewBreakpoint";

// Split-pane preview (Task 5, spec lines 105-133). Only the "ready" state is
// in the design — loading/empty/error are ours (edge cases 17-19).
//
// Deliberate reductions vs. the mock, per the task brief:
//  - jobs.description is one unstructured TEXT blob with no reliable
//    delimiter, so it renders whole under one heading rather than split into
//    "What you will do" / "What we look for".
//  - The violet ATS-fit banner (score + matched/missing skills + auto-apply)
//    needs a resume-scoring subsystem that does not exist yet, so it is
//    omitted entirely rather than stubbed with fabricated numbers.
//  - The header's "Save" button needs a saved-jobs subsystem that also does
//    not exist (no SavedJob model/API anywhere in this repo) — omitted for
//    the same reason as the fit banner, rather than shipping a dead button.
export default function JobPreview({ slug }) {
  const [state, setState] = useState({ status: "empty" });
  const paneRef = useRef(null);

  useEffect(() => {
    // Fix round 1 (task-7-8 review, Finding 1): this component can still
    // mount momentarily on a narrow viewport — JobsSplitView.jsx defaults
    // showPreview to true so the very first client render matches the
    // server-rendered markup, then corrects it via a layout effect. But
    // React still fires this passive effect's "create" once this fiber has
    // committed at all, even though a synchronous, layout-effect-triggered
    // re-render unmounts it again moments later — verified empirically
    // (against both `next dev` and a production build) that gating only in
    // the parent does NOT stop this effect from running. So this effect
    // checks the live viewport itself, independent of any prop/state handed
    // down from the parent: if we're currently at or below the breakpoint
    // where the split pane is hidden (app/globals.css's
    // --preview-breakpoint, read via the same helper JobsSplitView.jsx
    // uses), there's nobody who can see this pane, so skip the fetch
    // entirely rather than firing a request against a hidden pane.
    if (typeof window !== "undefined" && window.matchMedia(getPreviewBreakpointQuery()).matches) {
      return;
    }
    if (!slug) { setState({ status: "empty" }); return; }
    let live = true;
    setState({ status: "loading" });
    fetch(`/jobs/api/jobs/preview?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setState({ status: "ready", job: d.job }))
      .catch(() => live && setState({ status: "error" }));
    return () => { live = false; };
  }, [slug]);

  // Reset scroll to the top of the pane whenever a *new* job finishes
  // loading — otherwise switching rows while scrolled mid-description leaves
  // the next job's content starting off-screen.
  const readySlug = state.status === "ready" ? state.job?.job_slug : null;
  useEffect(() => {
    if (readySlug && paneRef.current) paneRef.current.scrollTop = 0;
  }, [readySlug]);

  if (state.status === "empty")
    return <aside className="job-preview is-empty"><p>Select a role to preview it here.</p></aside>;
  if (state.status === "loading")
    return <aside className="job-preview is-loading" aria-busy="true"><div className="skeleton" /></aside>;
  if (state.status === "error")
    return <aside className="job-preview is-error"><p>Could not load this role. Open the full page instead.</p></aside>;

  const { job } = state;
  const locations = Array.isArray(job.locations) ? job.locations.filter(Boolean).slice(0, 3) : [];
  // job.locations here comes from getJob()'s jl.location_raw — already
  // human-readable text, unlike the location_slug array searchJobs() attaches
  // for JobCard. No slug-to-title-case transform needed (or wanted).
  const locationLabel = locations.length ? locations.join(", ") : job.remote ? "Remote" : "Location flexible";
  const salary = fmtSalary(job) ?? "—";

  const rawDesc = job.description || "";
  const decodedDesc = decodeEntities(rawDesc);
  const isHtml = /<[a-z][\s\S]*>/i.test(decodedDesc);
  const cleanDesc = sanitiseHtml(decodedDesc); // same rules as app/[slug]/page.jsx, via lib/sanitize.js

  return (
    <aside className="job-preview" ref={paneRef}>
      <div className="jp-body">
        <div className="jp-head-row">
          <div className="jp-head-main">
            <h1 className="jp-title">{job.title}</h1>
            <div className="jp-sub">
              <Link href={`/company/${job.company_slug}`} className="jp-company-link">{job.company}</Link>
              {job.department ? <> · {job.department}</> : null}
              {locationLabel ? <> · {locationLabel}</> : null}
            </div>
            <div className="jp-pills">
              {job.employment_type ? (
                <span className="jp-pill">{job.employment_type.replace(/[-_]/g, " ")}</span>
              ) : null}
              <span className="jp-pill mono">{salary}</span>
              {job.posted_at ? (
                <time className="jp-pill" dateTime={String(job.posted_at)}>Posted {fmtDate(job.posted_at)}</time>
              ) : null}
              {job.source ? <span className="jp-pill source">{formatAtsLabel(job.source)}</span> : null}
            </div>
          </div>
          {job.apply_url ? (
            <a href={job.apply_url} target="_blank" rel="noopener noreferrer" className="jp-apply">
              Apply ↗
            </a>
          ) : null}
        </div>
      </div>

      <section className="jp-section" aria-label="Job description">
        <h2 className="jp-section-title">About this role</h2>
        {cleanDesc.trim() ? (
          isHtml ? (
            <div className="jp-description" dangerouslySetInnerHTML={{ __html: cleanDesc }} />
          ) : (
            <div className="jp-description" style={{ whiteSpace: "pre-wrap" }}>{cleanDesc}</div>
          )
        ) : (
          <p className="jp-description">Full job description is available on {job.company}&apos;s careers page.</p>
        )}
      </section>

      <footer className="jp-footer">
        <span>
          {job.source
            ? `You will be redirected to ${job.company} on ${formatAtsLabel(job.source)}.`
            : `You will be redirected to ${job.company} to apply.`}
        </span>
        <Link href={`/${job.job_slug}`}>Open full page →</Link>
      </footer>
    </aside>
  );
}
