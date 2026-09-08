// Marketing homepage — the role leadnear.com's root page plays, ported here so
// this standalone project has it. The previous search-and-listing landing page
// now lives at /browse (and /search), so nothing was lost.
//
// leadnear-main fetched this data over HTTP from ${JOBS_ORIGIN}/jobs/api/homepage
// with an 8s timeout, which silently fell back to an empty page whenever the
// jobs service was cold. This project owns the data, so it calls getHomepageData()
// directly: no network hop, no timeout, no empty-state fallback to get wrong.

import { getHomepageData } from "@/lib/jobs";
import LeadNearJobsHome from "@/components/marketing/LeadNearJobsHome";

export const revalidate = 600;

export const metadata = {
  title: "LeadNear Jobs | Find Jobs, Remote Roles & High-Paying Careers",
  description:
    "Find your next opportunity from thousands of companies worldwide. Search remote jobs, software engineering jobs, high-paying roles, and jobs near you.",
  alternates: { canonical: "https://www.leadnear.com/jobs" },
};

const EMPTY_HOMEPAGE_DATA = {
  totals: {},
  latestJobs: [],
  remoteRoles: [],
  salaryTiers: [],
  topCompanies: [],
  topLocations: [],
  countries: [],
  topTitles: [],
  unavailable: true,
};

export default async function HomePage() {
  // The component renders a degraded but valid page from `unavailable`, so a
  // database blip costs the marketing content rather than the whole route.
  const data = await getHomepageData().catch((error) => {
    console.error("Unable to load homepage data", error);
    return EMPTY_HOMEPAGE_DATA;
  });

  return <LeadNearJobsHome data={data} />;
}
