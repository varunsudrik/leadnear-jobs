import { getByType } from "@/lib/jobs";
import JobListLayout from "@/components/JobListLayout";
import { notFound } from "next/navigation";

const LABELS = {
  "full-time": "Full-Time",
  "part-time": "Part-Time",
  contract: "Contract",
  temporary: "Temporary",
  internship: "Internship",
  volunteer: "Volunteer",
  "per-diem": "Per Diem",
  other: "Other",
};

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const label = LABELS[slug] || slug;
  return {
    title: `${label} Jobs | LeadNear Jobs`,
    description: `Find ${label.toLowerCase()} jobs on LeadNear Jobs.`,
    alternates: {
      canonical: `https://www.leadnear.com/jobs/type/${slug}`,
    },
  };
}

export default async function TypePage({ params, searchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const data = await getByType(slug, sp?.page || 1).catch(() => null);
  if (!data || !data.total) notFound();
  return (
    <JobListLayout
      heading={`${data.label} Jobs`}
      prefix="🧾"
      subtitle={`${Number(data.total || 0).toLocaleString()} open positions`}
      jobs={data.jobs}
      total={data.total}
    />
  );
}
