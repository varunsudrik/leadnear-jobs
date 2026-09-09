import { getJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) return Response.json({ error: "slug required" }, { status: 400 });

  try {
    const job = await getJob(slug);
    // getJob() has no status filter (app/[slug]/page.jsx relies on that to
    // render its own "no longer available" branch for deleted jobs), so the
    // status check lives here instead. A non-success job is treated the same
    // as a missing one -- the preview must not be weaker than the full page.
    if (!job || job.status !== "success") {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    // Narrow the row to exactly the fields components/JobPreview.jsx renders,
    // so internal columns (db_id, apply_url_md5, render_hash, source_slug,
    // created_at, updated_at, category_slugs, tags, ...) never leak.
    const {
      job_slug, title, company, company_slug, department, locations, remote,
      employment_type, salary_min, salary_max, salary_currency, salary_period,
      posted_at, source, apply_url, description,
    } = job;

    return Response.json({
      job: {
        job_slug, title, company, company_slug, department, locations, remote,
        employment_type, salary_min, salary_max, salary_currency, salary_period,
        posted_at, source, apply_url, description,
      },
    });
  } catch (error) {
    console.error("Preview lookup failed", error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
