import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const metrics = await queryOne(
      `SELECT total_jobs, total_remote, total_100k_plus, total_companies, updated_at
       FROM site_metrics
       WHERE id = 1`
    );

    return Response.json(
      {
        totalJobs: Number(metrics?.total_jobs || 0),
        remoteJobs: Number(metrics?.total_remote || 0),
        highSalaryJobs: Number(metrics?.total_100k_plus || 0),
        companiesHiring: Number(metrics?.total_companies || 0),
        updatedAt: metrics?.updated_at || null,
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Unable to load live job count", error);
    return Response.json({ error: "Live job count unavailable" }, { status: 503 });
  }
}
