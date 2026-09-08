// jobs/category/[slug]/page.jsx
import { getByCategory, getCategoryTotal } from "@/lib/jobs";
import JobListLayout from "@/components/JobListLayout";

function slug2label(slug = "") {
  return slug.replace(/-jobs$/, "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const label = slug2label(slug);
  const total = await getCategoryTotal(slug).catch(() => 0);
  const formattedTotal = Number(total).toLocaleString("en-US");
  const canonical = `https://www.leadnear.com/jobs/category/${slug}`;
  const description = `Browse ${formattedTotal}+ ${label} jobs from top companies worldwide. Explore remote, full-time, contract and hybrid opportunities.`;
  return {
    title: `${label} Jobs | LeadNear Jobs`,
    description,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical,
    },
    openGraph: {
      title: `${label} Jobs | LeadNear Jobs`,
      description,
      url: canonical,
      type: "website",
    },
  };
}
export default async function CategoryPage({ params, searchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const data = await getByCategory(slug, sp?.page || 1).catch(() => ({ jobs: [], total: 0 }));
  const label = slug2label(slug);
  return <JobListLayout heading={`${label} Jobs`} prefix="📂" jobs={data.jobs} total={data.total} />;
}
