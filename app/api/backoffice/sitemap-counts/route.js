import { hasValidAdminAuth } from "@/lib/admin-auth";
import { getSitemapUrlCounts } from "@/lib/sitemap-counts";

export const dynamic = "force-dynamic";

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request) {
  if (!hasValidAdminAuth(request)) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": 'Basic realm="LeadNear Jobs Backoffice"' } }
    );
  }

  const rows = await getSitemapUrlCounts();
  const csv = [
    "url,kind,record_count",
    ...rows.map((row) => [row.url, row.kind, row.recordCount].map(csvCell).join(",")),
  ].join("\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(`${csv}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sitemap_url_counts_${date}.csv"`,
      "cache-control": "no-store",
      "x-record-count": String(rows.length),
    },
  });
}
