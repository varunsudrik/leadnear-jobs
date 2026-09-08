import Link from "next/link";
import { getPopularLocationsMinJobs } from "@/lib/jobs";

export const revalidate = 600;

export const metadata = {
  title: "Locations with 100+ Jobs | LeadNear Jobs",
  description: "Browse locations on LeadNear Jobs with at least 100 active listings.",
  alternates: {
    canonical: "https://www.leadnear.com/jobs/locations",
  },
};

function fmt(value) {
  return Number(value || 0).toLocaleString();
}

function locationLabel(slug) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default async function PopularLocationsPage() {
  const locations = await getPopularLocationsMinJobs(100).catch(() => []);

  return (
    <div className="container locations-page">
      <div className="list-page-heading">
        <span className="admin-kicker">Locations</span>
        <h1>Locations with 100+ Jobs</h1>
        <p>Browse locations with at least 100 active listings right now.</p>
      </div>

      <div className="popular-location-list">
        {locations.map((loc) => (
          <Link
            key={loc.location_slug}
            className="sidebar-link popular-location-link"
            href={`/location/${loc.location_slug}`}
          >
            {locationLabel(loc.location_slug)}
            <span className="cnt">{fmt(loc.job_count)}</span>
          </Link>
        ))}
      </div>

      <div className="section-action-row">
        <Link className="section-action-btn" href="/">← Back to Homepage</Link>
      </div>
    </div>
  );
}
