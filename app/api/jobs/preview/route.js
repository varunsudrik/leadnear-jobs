import { getJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) return Response.json({ error: "slug required" }, { status: 400 });

  try {
    const job = await getJob(slug);
    if (!job) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ job });
  } catch (error) {
    console.error("Preview lookup failed", error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
