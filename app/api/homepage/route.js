import { getHomepageData } from "@/lib/jobs";

export const dynamic = "force-dynamic";

let lastSuccessfulHomepage = null;

export async function GET() {
  try {
    const data = await getHomepageData();
    lastSuccessfulHomepage = data;
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.error("Unable to load homepage data", error);
    if (lastSuccessfulHomepage) {
      return Response.json(
        { ...lastSuccessfulHomepage, stale: true },
        { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600" } }
      );
    }
    return Response.json({ error: "Homepage data unavailable" }, { status: 503 });
  }
}
