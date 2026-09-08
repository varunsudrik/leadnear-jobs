// location/[slug]/page.jsx  — city/location browsing
import { getByLocation } from "@/lib/jobs";
import JobListLayout from "@/components/JobListLayout";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const label = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return {
    title: `Jobs in ${label} | LeadNear Jobs`,
    description: `Find jobs in ${label} on LeadNear Jobs.`,
    alternates: {
      canonical: `https://www.leadnear.com/jobs/location/${slug}`,
    },
  };
}
export default async function LocationPage({ params, searchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const data = await getByLocation(slug, sp?.page || 1).catch(() => ({ jobs: [], total: 0, label: "" }));
  return <JobListLayout heading={`Jobs in ${data.label || slug}`} prefix="📍" jobs={data.jobs} total={data.total} />;
}
