// company/[slug]/page.jsx
import { getByCompany, fmtDate } from "@/lib/jobs";
import JobListLayout from "@/components/JobListLayout";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const label = slug.replace(/-/g," ").replace(/\b\w/g,(c)=>c.toUpperCase());
  return {
    title: `Jobs at ${label} | LeadNear Jobs`,
    description: `Browse all open positions at ${label} on LeadNear Jobs.`,
    alternates: {
      canonical: `https://www.leadnear.com/jobs/company/${slug}`,
    },
  };
}
export default async function CompanyPage({ params, searchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const data = await getByCompany(slug, sp?.page || 1).catch(() => ({ company: null, jobs: [], total: 0 }));
  const name = data.company?.name || slug.replace(/-/g," ").replace(/\b\w/g,(c)=>c.toUpperCase());
  return (
    <JobListLayout
      heading={`${name} Jobs`}
      prefix="🏢"
      subtitle={`${(data.total || 0).toLocaleString()} open positions`}
      jobs={data.jobs}
      total={data.total}
    />
  );
}
