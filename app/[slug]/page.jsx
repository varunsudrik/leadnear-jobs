// app/[slug]/page.jsx — Individual Job Post (SEO-rich)
// JSON-LD JobPosting + FAQPage structured data
// All data is real — zero AI-generated text

import Link from "next/link";
import Script from "next/script";
import { getJobCached, getRelatedJobs } from "@/lib/jobs";
import { fmtSalary, fmtDate, initials } from "@/lib/format";
import { decodeEntities, sanitiseHtml as sanitise } from "@/lib/sanitize";
import { buildJobPostingJsonLd } from "@/lib/job-jsonld";
import { formatAtsLabel } from "@/lib/ats";
import { notFound, redirect } from "next/navigation";
import JobCard from "@/components/JobCard";

export const revalidate = false;
export const dynamicParams = true;

const JOBS_BASE_URL = (
  process.env.PUBLIC_BASE_URL || "https://www.leadnear.com/jobs"
).replace(/\/$/, "");

const TITLE_ALIASES = new Set(["software-engineer", "product-manager", "data-scientist", "account-executive", "marketing-manager", "operations-manager"]);

// Generate no historical jobs during next build. Unknown slugs are rendered and
// added to the route cache when the nightly publisher requests them.
export async function generateStaticParams() {
  return [];
}

function primaryCity(job) {
  const location = (job.locations || [])[0]?.replace(/\s+/g, " ").trim();
  if (!location) return job.remote ? "Remote" : "";
  if (/^(remote|anywhere|worldwide)\b/i.test(location)) return "Remote";
  return location.split(/[;,]/, 1)[0].trim();
}

function isActiveJob(job) {
  return job?.status === "success";
}

function jobUrl(job) {
  return `${JOBS_BASE_URL}/${job.job_slug}`;
}

// ─── Metadata ────────────────────────────────────────────────────────────────
export async function generateMetadata({ params }) {
  const { slug } = await params;
  if (TITLE_ALIASES.has(slug)) return { title: "Jobs | LeadNear Jobs", robots: "noindex" };
  const job = await getJobCached(slug).catch(() => null);
  if (!job) return { title: "Job Not Found | LeadNear Jobs", robots: "noindex" };

  const locs   = (job.locations || []).join(", ") || (job.remote ? "Remote" : "");
  const city   = primaryCity(job);
  const salary = fmtSalary(job);
  const canonical = jobUrl(job);
  const active = isActiveJob(job);

  return {
    title:       city === "Remote"
      ? `${job.title} Remote Job | ${job.company}`
      : `${job.title} Job${city ? ` in ${city}` : ""} | ${job.company}`,
    description: [
      `${job.title} at ${job.company}.`,
      job.employment_type ? `${job.employment_type.replace(/[-_]/g," ")} role.` : "",
      locs ? `Location: ${locs}.` : "",
      salary ? `Salary: ${salary}.` : "",
      job.department ? `Department: ${job.department}.` : "",
    ].filter(Boolean).join(" ").slice(0, 160),
    robots: {
      index: active,
      follow: true,
    },
    alternates: {
      canonical,
    },
    openGraph: {
      title:       `${job.title} at ${job.company}`,
      description: `Apply for ${job.title} at ${job.company}`,
      type:        "website",
      url:         canonical,
    },
  };
}

// decodeEntities/sanitise moved to lib/sanitize.js (shared verbatim with
// components/JobPreview.jsx — see task-5-report.md).

// ─── Build FAQ items from actual job data ─────────────────────────────────────
function buildFAQ(job, salary) {
  const faqs = [];
  const co   = job.company;
  const role = job.title;
  const locs = (job.locations || []).join(", ") || (job.remote ? "fully remote" : null);

  // Salary FAQ
  if (salary) {
    faqs.push({
      q: `What is the salary for the ${role} role at ${co}?`,
      a: `The listed salary for this ${role} position at ${co} is ${salary}. This is ${job.remote ? "a remote" : "an"} ${job.employment_type?.replace(/[-_]/g," ") || "full-time"} role.`,
    });
  } else {
    faqs.push({
      q: `Is the salary disclosed for the ${role} position at ${co}?`,
      a: `The salary for this ${role} role at ${co} is not publicly listed. Click "Apply Now" to learn more about the compensation package on their official careers page.`,
    });
  }

  // Location / Remote FAQ
  if (job.remote) {
    faqs.push({
      q: `Is the ${role} job at ${co} remote?`,
      a: `Yes, this ${role} position at ${co} is remote${locs && locs !== "fully remote" ? `, with team members based in ${locs}` : ""}. You can work from home or anywhere in the supported regions.`,
    });
  } else if (locs) {
    faqs.push({
      q: `Where is the ${role} position at ${co} located?`,
      a: `This ${role} role at ${co} is based in ${locs}. The position is listed as on-site or hybrid. Check the full job description or apply directly to confirm the work arrangement.`,
    });
  }

  // Employment type FAQ
  if (job.employment_type) {
    const type = job.employment_type.replace(/[-_]/g, " ");
    faqs.push({
      q: `Is the ${role} role at ${co} full-time or part-time?`,
      a: `This is listed as a ${type} position. It is posted as a ${role} role${job.department ? ` in the ${job.department} department` : ""} at ${co}.`,
    });
  }

  // Department FAQ
  if (job.department) {
    faqs.push({
      q: `Which team or department does the ${role} at ${co} belong to?`,
      a: `This ${role} position is part of the ${job.department} department at ${co}. See the full job description for more information about the team structure and responsibilities.`,
    });
  }

  // How to apply FAQ
  faqs.push({
    q: `How do I apply for the ${role} position at ${co}?`,
    a: `Click the "Apply Now" button on this page. You will be redirected to ${co}'s official application portal${job.source ? ` hosted on ${job.source}` : ""} where you can submit your application directly.`,
  });

  // Posted date FAQ
  if (job.posted_at) {
    faqs.push({
      q: `When was the ${role} job at ${co} posted?`,
      a: `This ${role} position at ${co} was posted on ${fmtDate(job.posted_at)}. Apply as soon as possible — early applications are often reviewed first.`,
    });
  }

  return faqs;
}

// ─── JSON-LD structured data ──────────────────────────────────────────────────
function buildJsonLd(job, faqs) {
  const jobPosting = buildJobPostingJsonLd(job, jobUrl(job));

  const faqPage = {
    "@context": "https://schema.org",
    "@type":    "FAQPage",
    "mainEntity": faqs.map(({ q, a }) => ({
      "@type":          "Question",
      "name":           q,
      "acceptedAnswer": { "@type": "Answer", "text": a },
    })),
  };

  return [jobPosting, faqPage].filter(Boolean);
}

// Source badge label — formatAtsLabel() (lib/ats.js) is the shared helper also
// used by components/JobPreview.jsx; a local copy here would drift from it.

// ─── Page component ───────────────────────────────────────────────────────────
export default async function JobDetailPage({ params }) {
  const { NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID } = process.env;
  const { slug } = await params;
  if (TITLE_ALIASES.has(slug)) redirect(`/title/${slug}-jobs`);
  const job = await getJobCached(slug).catch(() => null);
  if (!job) notFound();
  const relatedJobs = await getRelatedJobs(job).catch(() => []);

  const salary  = fmtSalary(job);
  const date    = fmtDate(job.posted_at);
  const locs    = Array.isArray(job.locations) ? job.locations.filter(Boolean) : [];
  const deleted = job.status === "deleted";

  // Decode double-encoded HTML entities first, then sanitise
  const rawDesc    = job.description || "";
  const decodedDesc = decodeEntities(rawDesc);
  const isHtml     = /<[a-z][\s\S]*>/i.test(decodedDesc);
  const cleanDesc  = sanitise(decodedDesc);   // already decoded inside sanitise(), but safe to pass pre-decoded

  const tags    = Array.isArray(job.tags) ? job.tags.filter(Boolean) : [];
  const faqs    = buildFAQ(job, salary);
  const jsonLd  = buildJsonLd(job, faqs);

  // Category links from category_slugs field
  const catSlugs = (job.category_slugs || "").split(",").filter(Boolean);

  return (
    <>
      {NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID && (
        <Script
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID}`}
          crossOrigin="anonymous"
          strategy="lazyOnload"
        />
      )}

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="container" style={{ paddingTop: "1.5rem", paddingBottom: "4rem" }}>

        {/* Breadcrumb */}
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className="bc-sep">/</span>
          <Link href={`/company/${job.company_slug}`}>{job.company}</Link>
          <span className="bc-sep">/</span>
          <span>{job.canonical_title || job.title}</span>
        </nav>

        {/* Deleted banner */}
        {deleted && (
          <div className="deleted-banner" role="alert">
            This position is no longer active. The listing has been closed or removed.
          </div>
        )}

        {/* ── Job card — single elevated surface, header + two-col body ── */}
        <div className="jd-card">
          <div className="jd-card-header">
            {/* Top row: logo + title + apply */}
            <div className="jd-top-row">
              <div className="jd-logo" aria-hidden="true">{initials(job.company)}</div>

              <div className="jd-title-block">
                <h1 className="jd-title">{job.title}</h1>
                <div className="jd-company-row">
                  <Link href={`/company/${job.company_slug}`} className="jd-company-link">
                    {job.company}
                  </Link>
                  {job.department && (
                    <span className="jd-dept">· {job.department}</span>
                  )}
                </div>
              </div>

              {!deleted && job.apply_url && (
                <div className="jd-header-actions">
                  <a
                    id="apply-btn-top"
                    className="jd-apply-btn"
                    href={job.apply_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Apply Now ↗
                  </a>
                </div>
              )}
            </div>

            {/* Meta pills */}
            <div className="jd-meta-row">
              {job.remote ? <span className="jd-pill">Remote</span> : null}
              {locs.map((l) => (
                <Link key={l} href={`/location/${l.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"")}`}
                  className="jd-pill jd-pill-link">
                  {l}
                </Link>
              ))}
              {job.employment_type ? (
                <span className="jd-pill">{job.employment_type.replace(/[-_]/g," ")}</span>
              ) : null}
              {salary ? (
                <span className="jd-pill mono">{salary}</span>
              ) : null}
              {date ? (
                <time className="jd-pill mono" dateTime={job.posted_at?.toString()}>
                  Posted {date}
                </time>
              ) : null}
              {job.source ? (
                <span className="jd-pill jd-pill-muted">via {formatAtsLabel(job.source)}</span>
              ) : null}
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="jd-tags-row">
                {tags.map((t) => (
                  <span key={t} className="jd-tag">{t}</span>
                ))}
              </div>
            )}
          </div>

          {/* ── Two column layout ────────────────────────── */}
          <div className="jd-two-col">

            {/* LEFT — Description + FAQ */}
            <div className="jd-main">

              {/* Description */}
              <section className="jd-section" aria-label="Job description">
                <h2 className="jd-section-title">About this role</h2>
                {cleanDesc.trim() ? (
                  isHtml ? (
                    <div className="jd-description"
                      dangerouslySetInnerHTML={{ __html: cleanDesc }} />
                  ) : (
                    <div className="jd-description" style={{ whiteSpace: "pre-wrap" }}>
                      {cleanDesc}
                    </div>
                  )
                ) : (
                  <div className="jd-description">
                    <p>Full job description is available on {job.company}&apos;s careers page.</p>
                    {job.apply_url && (
                      <a href={job.apply_url} target="_blank" rel="noopener noreferrer">
                        View full details ↗
                      </a>
                    )}
                  </div>
                )}
              </section>

              {/* FAQ section */}
              <section className="jd-section jd-faq" aria-label="Frequently asked questions">
                <h2 className="jd-section-title">Frequently Asked Questions</h2>
                <div className="faq-list">
                  {faqs.map(({ q, a }, i) => (
                    <details key={i} className="faq-item" open={i === 0}>
                      <summary className="faq-q">{q}</summary>
                      <div className="faq-a">{a}</div>
                    </details>
                  ))}
                </div>
              </section>

            </div>

            {/* RIGHT — Sidebar */}
            <aside className="jd-sidebar">

              {/* Apply CTA */}
              {!deleted && job.apply_url && (
                <div className="jd-sidebar-card jd-apply-card">
                  <h3>Ready to apply?</h3>
                  <p>Join {job.company} as a <strong>{job.title}</strong></p>
                  <a
                    id="apply-btn-sidebar"
                    className="jd-apply-btn jd-apply-full"
                    href={job.apply_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Apply Now ↗
                  </a>
                  {job.source && (
                    <p className="jd-source-note">
                      via {formatAtsLabel(job.source)}
                      {job.source_slug ? ` · ${job.source_slug}` : ""}
                    </p>
                  )}
                </div>
              )}

              {/* Job details */}
              <div className="jd-sidebar-section">
                <h3 className="jd-section-title">Job Details</h3>
                <dl className="jd-detail-list">

                  {[
                    ["Company",     <Link key="co" href={`/company/${job.company_slug}`}
                                      className="jd-detail-link">{job.company}</Link>],
                    ["Job Title",   job.title],
                    job.department ? ["Department", job.department] : null,
                    job.employment_type
                      ? ["Employment", job.employment_type.replace(/[-_]/g," ")]
                      : null,
                    job.remote
                      ? ["Location", "Remote"]
                      : locs.length
                        ? ["Location", locs.join(", ")]
                        : null,
                    // fmtSalary() returns null when absent — render the em
                    // dash here rather than hiding the row, so "salary not
                    // disclosed" reads as a fact instead of a layout gap.
                    ["Salary", <span key="sal" className="jd-salary-value mono">{salary ?? "—"}</span>],
                    job.salary_currency
                      ? ["Currency", job.salary_currency]
                      : null,
                    job.salary_period
                      ? ["Pay Period", job.salary_period.replace(/[-_]/g," ")]
                      : null,
                    job.source
                      ? ["Source ATS", formatAtsLabel(job.source)]
                      : null,
                    date
                      ? ["Posted", <span key="posted" className="mono">{date}</span>]
                      : null,
                    job.canonical_title && job.canonical_title !== job.title
                      ? ["Role Type", job.canonical_title]
                      : null,
                  ].filter(Boolean).map(([label, value]) => (
                    <div key={label} className="jd-detail-row">
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Category links */}
              {catSlugs.length > 0 && (
                <div className="jd-sidebar-section">
                  <h3 className="jd-section-title">Related Categories</h3>
                  <div className="jd-cat-links">
                    {catSlugs.map((slug) => (
                      <Link key={slug} href={`/category/${slug}`} className="jd-cat-link">
                        {slug.replace(/-jobs$/, "").replace(/-/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())} →
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* More from company */}
              <div className="jd-sidebar-section">
                <h3 className="jd-section-title">More from {job.company}</h3>
                <Link href={`/company/${job.company_slug}`} className="jd-more-link">
                  All open positions at {job.company} →
                </Link>
              </div>

            </aside>
          </div>
        </div>

        {relatedJobs.length > 0 && (
          <section className="jd-related-jobs" aria-labelledby="related-jobs-heading">
            <h2 id="related-jobs-heading" className="section-heading">Related Jobs</h2>
            <div className="job-list">
              {relatedJobs.map((relatedJob) => (
                <JobCard key={relatedJob.db_id} job={relatedJob} />
              ))}
            </div>
          </section>
        )}

        {/* ── Bottom apply CTA ─────────────────────────── */}
        {!deleted && job.apply_url && (
          <div className="jd-bottom-cta">
            <div className="jd-bottom-cta-inner">
              <div>
                <div className="jd-bottom-role">{job.title}</div>
                <div className="jd-bottom-co">{job.company}{salary ? ` · ${salary}` : ""}</div>
              </div>
              <a
                id="apply-btn-bottom"
                className="jd-apply-btn"
                href={job.apply_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Apply for this role ↗
              </a>
            </div>
            <p className="jd-redirect-note">
              You&apos;ll be redirected to {job.company}&apos;s official application page
              {job.source ? ` on ${formatAtsLabel(job.source)}` : ""}.
            </p>
          </div>
        )}

      </div>
    </>
  );
}
