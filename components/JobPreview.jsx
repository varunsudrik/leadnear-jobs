"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatAtsLabel } from "@/lib/ats";
import { fmtSalary, fmtDate } from "@/lib/format.mjs";
import { decodeEntities, sanitiseHtml } from "@/lib/sanitize";
import { getPreviewBreakpointQuery } from "@/lib/previewBreakpoint";

const SAVE_NOT_LIVE = "Saved jobs aren't live yet";

// Split-pane preview (Task 5, spec lines 105-133). Only the "ready" state is
// in the design — loading/empty/error are ours (edge cases 17-19).
//
// Deliberate reductions vs. the mock, per the task brief:
//  - jobs.description is one unstructured TEXT blob with no reliable
//    delimiter, so it renders whole under one heading rather than split into
//    "What you will do" / "What we look for".
//  - The header's "Save" button (Task 6) renders but is inert: it needs a
//    subsystem that does not exist (no SavedJob model/API). It used to carry
//    aria-disabled and a `title` and no handler — an explanation a touch
//    device can never see, since `title` has no tooltip there. It now says
//    the same thing in an aria-live region beside it when activated, so
//    aria-disabled is gone (a control that answers you is not disabled) and
//    cursor: pointer is honest. `title` stays for pointer users; `disabled`
//    is still not used, because it would suppress the tooltip and drop it
//    out of the tab order.
//
// The violet ATS-fit banner and its "+ Auto-apply queue" button (Task 6) are
// retired now: both sourced their score and copy from the old fit-layer
// module's static fixtures, and there is still no real resume-scoring
// subsystem to replace them with — that is plan 2's job.
export default function JobPreview({ slug }) {
  const [state, setState] = useState({ status: "empty" });
  const [saveNote, setSaveNote] = useState("");
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
    setSaveNote("");
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
            <h2 className="jp-title">{job.title}</h2>
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
          <div className="jp-actions">
            {/* Saved jobs need a subsystem that does not exist — no model, no
                API, nowhere to put the record. The control is in the design,
                so it renders, inert, and says so when you press it. */}
            <button type="button" className="jp-save" title={SAVE_NOT_LIVE} onClick={() => setSaveNote(SAVE_NOT_LIVE)}>
              Save
            </button>
            {job.apply_url ? (
              <a href={job.apply_url} target="_blank" rel="noopener noreferrer" className="jp-apply">
                Apply ↗
              </a>
            ) : null}
            {/* Always rendered, never display:none, so the live region is in
                the accessibility tree before its text arrives. Empty it has no
                line box and no margin — idle layout is unchanged. */}
            <p className="jp-note" role="status" aria-live="polite">{saveNote}</p>
          </div>
        </div>
      </div>

      <section className="jp-section" aria-label="Job description">
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
