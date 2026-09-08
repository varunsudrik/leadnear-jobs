import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";

function authorized(request) {
  const expected = process.env.REVALIDATE_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (!expected || expectedBytes.length !== suppliedBytes.length) return false;
  return timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const tags = Array.isArray(body.tags) ? body.tags.slice(0, 500) : [];
  const paths = Array.isArray(body.paths) ? body.paths.slice(0, 500) : [];

  for (const tag of new Set(tags.filter((value) => typeof value === "string"))) {
    revalidateTag(tag);
  }
  for (const path of new Set(paths.filter((value) => typeof value === "string"))) {
    revalidatePath(path);
  }

  return Response.json({
    revalidated: true,
    tags: tags.length,
    paths: paths.length,
    at: new Date().toISOString(),
  });
}
