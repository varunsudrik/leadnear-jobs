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
//
// The quota check is re-done HERE, inside a Serializable transaction, rather
// than trusted from the caller's earlier scanQuota() read: that read happens
// before the 10-20s AI call, so two concurrent requests from a user sitting
// at `used: QUOTA - 1` can both pass the early check and both reach this
// write. Under Serializable isolation Postgres aborts one of the two
// racing transactions (surfaced to the caller as Prisma error P2034) rather
// than let both count()s observe the same stale row count, so the cap
// cannot be bypassed by concurrency. Returns { overQuota: true } instead of
// creating the row when the count (read inside the transaction, so it can
// only see committed rows) is already at or over QUOTA.
export async function saveScan(userId, built) {
  if (!userId) return { overQuota: true };
  return prisma.$transaction(async (tx) => {
    const used = await tx.resumeScan.count({ where: { userId } });
    if (used >= QUOTA) return { overQuota: true };
    return tx.resumeScan.create({
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
  }, { isolationLevel: "Serializable" });
}

export async function latestScan(userId) {
  if (!userId) return null;
  return prisma.resumeScan.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

// Spec D11: the user can delete what we hold. Cascades to targets.
//
// The guard is load-bearing, not defensive style: Prisma drops `undefined`
// keys from a filter object, so `deleteMany({ where: { userId: undefined } })`
// executes as `deleteMany({})` and wipes every user's rows. Without this
// check, one unauthenticated call with a missing session id deletes the
// whole table.
export async function deleteScans(userId) {
  if (!userId) return { count: 0 };
  return prisma.resumeScan.deleteMany({ where: { userId } });
}
