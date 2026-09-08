import { getByCompany } from "../../../../lib/jobs";
import mapping from "../../../../lib/company-mapping-job-portal.json";

export const dynamic = "force-dynamic";

// CORS helper headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return Response.json(
      { error: "Missing company slug parameter" },
      { status: 400, headers: corsHeaders }
    );
  }

  const cleanSlug = slug.toLowerCase().trim();
  // Find the mapped company slug in jobs portal, fallback to the original slug
  const mappedSlug = mapping[cleanSlug] || cleanSlug;

  try {
    const data = await getByCompany(mappedSlug);
    
    // Filter and transform job objects to return necessary details
    const jobs = (data?.jobs || []).map((job) => ({
      title: job.title,
      url: `/jobs/${job.job_slug}`, // relative to base /jobs
      posted_at: job.posted_at,
      employment_type: job.employment_type,
      remote: job.remote,
      locations: job.locations || [],
    }));

    return Response.json(
      {
        company: {
          name: data?.company?.name || mappedSlug,
          slug: mappedSlug,
          job_count: data?.company?.job_count || jobs.length,
        },
        jobs,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error fetching jobs in dynamic by-company API:", error);
    return Response.json(
      { error: "Failed to fetch jobs" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
