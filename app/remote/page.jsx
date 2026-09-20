// remote/page.jsx
import { searchJobs } from "@/lib/jobs";
import JobListLayout from "@/components/JobListLayout";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return {
    title: "Remote Jobs Worldwide | LeadNear Jobs",
    description: "Browse all remote jobs worldwide on LeadNear Jobs.",
    alternates: {
      canonical: "https://www.leadnear.com/jobs/remote",
    },
  };
}
export default async function RemotePage({ searchParams }) {
  const sp = (await searchParams) || {};
  const data = await searchJobs({ remote: "1", type: sp.type, salary_min: sp.salary_min,
    category: sp.category, days: sp.days, sort: sp.sort, page: sp.page || 1 }).catch(() => ({ jobs: [], total: 0 }));
  // No prefix: Direction C carries no emoji anywhere in the spec (the
  // shared JobListLayout default of "📋" is itself old-design and out of
  // scope here — used by other, not-yet-touched listing pages).
  return <JobListLayout heading="Remote Jobs" prefix="" mode="remote"
    subtitle="work from anywhere" jobs={data.jobs} total={data.total} />;
}
