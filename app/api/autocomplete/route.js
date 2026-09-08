import { getAutocompleteSuggestions } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q") || "";
  const kind = params.get("kind") === "location" ? "location" : "query";
  try {
    const suggestions = await getAutocompleteSuggestions(q, kind);
    return Response.json(
      { suggestions },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (error) {
    console.error("Autocomplete lookup failed", error);
    return Response.json({ suggestions: [] }, { status: 200 });
  }
}
