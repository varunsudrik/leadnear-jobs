import Link from "next/link";
import { getPopularCompaniesMinJobs } from "@/lib/jobs";

export const revalidate = 600;

export const metadata = {
  title: "Companies with 100+ Jobs | LeadNear Jobs",
  description: "Browse companies on LeadNear Jobs with at least 100 active listings.",
  alternates: {
    canonical: "https://www.leadnear.com/jobs/companies",
  },
};

function fmt(value) {
  return Number(value || 0).toLocaleString();
}

export default async function PopularCompaniesPage() {
  const companies = await getPopularCompaniesMinJobs(100).catch(() => []);

  return (
    <div className="container companies-page">
      <div className="list-page-heading">
        <span className="admin-kicker">Companies</span>
        <h1>Companies with 100+ Jobs</h1>
        <p>Browse companies with at least 100 active listings right now.</p>
      </div>

      <div className="popular-company-list">
        {companies.map((company) => (
          <Link
            key={company.slug}
            className="sidebar-link popular-company-link"
            href={`/company/${company.slug}`}
          >
            {company.name || company.slug}
            <span className="cnt">{fmt(company.job_count)}</span>
          </Link>
        ))}
      </div>

      <div className="section-action-row">
        <Link className="section-action-btn" href="/">← Back to Homepage</Link>
      </div>
    </div>
  );
}
