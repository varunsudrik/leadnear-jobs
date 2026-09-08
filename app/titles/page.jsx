import Link from "next/link";
import { getPopularTitlesMinJobs, titleSlug } from "@/lib/jobs";

export const revalidate = 600;

export const metadata = {
  title: "Job Titles with 100+ Jobs | LeadNear Jobs",
  description: "Browse job titles on LeadNear Jobs with at least 100 active listings.",
  alternates: {
    canonical: "https://www.leadnear.com/jobs/titles",
  },
};

function fmt(value) {
  return Number(value || 0).toLocaleString();
}

export default async function PopularTitlesPage() {
  const titles = await getPopularTitlesMinJobs(100).catch(() => []);

  return (
    <div className="container titles-page">
      <div className="list-page-heading">
        <span className="admin-kicker">Job titles</span>
        <h1>Job Titles with 100+ Jobs</h1>
        <p>Browse roles with at least 100 active listings right now.</p>
      </div>

      <div className="popular-title-list">
        {titles.map((title) => (
          <Link
            key={title.canonical_title}
            className="sidebar-link popular-title-link"
            href={`/title/${titleSlug(title.canonical_title)}`}
          >
            {title.canonical_title}
            <span className="cnt">{fmt(title.job_count)}</span>
          </Link>
        ))}
      </div>

      <div className="section-action-row">
        <Link className="section-action-btn" href="/">← Back to Homepage</Link>
      </div>
    </div>
  );
}
