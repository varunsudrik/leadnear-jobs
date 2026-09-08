// jobs/title/[slug]/page.jsx
import { getByTitle } from "@/lib/jobs";
import JobListLayout from "@/components/JobListLayout";
import { notFound } from "next/navigation";

function slug2title(slug = "") {
  return slug.replace(/-jobs$/, "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const title = slug2title(slug);
  return {
    title: `${title} Jobs | LeadNear Jobs`,
    description: `Find ${title} jobs worldwide.`,
    alternates: {
      canonical: `https://www.leadnear.com/jobs/title/${slug}`,
    },
  };
}
export default async function TitlePage({ params, searchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const page = sp?.page || 1;
  const data = await getByTitle(slug, page).catch(() => null);
  if (!data) notFound();
  return <JobListLayout heading={`${data.canon} Jobs`} prefix="📋" jobs={data.jobs} total={data.total} />;
}
