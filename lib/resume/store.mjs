// The only module that knows Prisma. Quota is derived from scan rows rather
// than stored in a counter (spec D8): a counter is a second source of truth
// that drifts the first time a write half-fails, and then the header and the
// scan history disagree about how many scans a user has had.
import prisma from "../prisma.js";

export const QUOTA = 3;

// Pure, so the arithmetic that decides whether a user is charged can be
// tested without a database.
export function quotaFrom(used) {
  const safe = Math.max(0, Number(used) || 0);
  return {
    used: safe,
    quota: QUOTA,
    remaining: Math.max(0, QUOTA - safe),
    exhausted: safe >= QUOTA,
  };
}

export async function scanQuota(userId) {
  if (!userId) return quotaFrom(0);
  return quotaFrom(await prisma.resumeScan.count({ where: { userId } }));
}

// Called only after a fully successful scan. Writing the row IS consuming the
// quota, so there is no path where a failed scan costs the user anything.
export async function saveScan(userId, built) {
  return prisma.resumeScan.create({
    data: {
      userId,
      filename: built.scan.filename,
      pages: built.scan.pages,
      score: built.score,
      skills: built.skills,
      result: built,
    },
    select: { id: true, createdAt: true },
  });
}

export async function latestScan(userId) {
  if (!userId) return null;
  return prisma.resumeScan.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

// Spec D11: the user can delete what we hold. Cascades to targets.
export async function deleteScans(userId) {
  return prisma.resumeScan.deleteMany({ where: { userId } });
}
