// jobs/salary/[tier]/page.jsx
import { getBySalary } from "@/lib/jobs";
import JobListLayout from "@/components/JobListLayout";

const LABELS = {
  "100k-plus": { label: "$100K+ Jobs", min: "$100K/yr" },
  "150k-plus": { label: "$150K+ Jobs", min: "$150K/yr" },
  "200k-plus": { label: "$200K+ Jobs", min: "$200K/yr" },
  "250k-plus": { label: "$250K+ Jobs", min: "$250K/yr" },
};
export async function generateMetadata({ params }) {
  const { tier } = await params;
  const meta = LABELS[tier] || { label: "High-Paying Jobs" };
  return {
    title: `${meta.label} | LeadNear Jobs`,
    description: `Find high-paying jobs with disclosed salary on LeadNear Jobs.`,
    alternates: {
      canonical: `https://www.leadnear.com/jobs/salary/${tier}`,
    },
  };
}
export default async function SalaryPage({ params, searchParams }) {
  const [{ tier }, sp] = await Promise.all([params, searchParams]);
  const meta = LABELS[tier] || { label: "High-Paying Jobs", min: "" };
  const data = await getBySalary(tier, sp?.page || 1).catch(() => ({ jobs: [], total: 0 }));
  return (
    <JobListLayout heading={meta.label} prefix="💰" subtitle={`salary ≥ ${meta.min} annually (USD)`}
      jobs={data.jobs} total={data.total} highlightSalary />
  );
}
