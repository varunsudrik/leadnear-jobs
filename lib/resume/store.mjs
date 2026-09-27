// The only module that knows Prisma. Quota is derived from scan rows rather
// than stored in a counter (spec D8): a counter is a second source of truth
// that drifts the first time a write half-fails, and then the header and the
// scan history disagree about how many scans a user has had.
import prisma from "../prisma.mjs";

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
  const scan = await prisma.resumeScan.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  // A redacted row (see redactScans below) still exists so it keeps counting
  // against quota, but it must never render as if it were a real scan: its
  // `result` was nulled out to `{}`. Treating that as "no scan" is what
  // sends /resume back to the upload state instead of showing an empty
  // result screen.
  if (!scan || !scan.result || Object.keys(scan.result).length === 0) return null;
  return scan;
}

// Spec D11: the user can delete what we hold. This REDACTS rather than
// deletes the row, on purpose: quota is COUNT(*) over ResumeScan rows (spec
// D8), derived rather than stored, precisely so there is no second source of
// truth to drift. A hard delete here would let anyone reset their free scans
// for free — register, use all 3, delete, repeat forever — which defeats
// the sign-in requirement (spec D1) that exists because each scan costs
// real money. Keeping the row and nulling its content satisfies both: the
// count the quota reads never changes, and nothing the user asked to be
// forgotten is still readable.
//
// The guard is load-bearing, not defensive style: Prisma drops `undefined`
// keys from a filter object, so `updateMany({ where: { userId: undefined } })`
// executes as `updateMany({})` and wipes every user's rows. Without this
// check, one unauthenticated call with a missing session id redacts the
// whole table.
export async function redactScans(userId) {
  if (!userId) return { count: 0 };
  return prisma.resumeScan.updateMany({
    where: { userId },
    data: { result: {}, filename: "", skills: [], score: 0 },
  });
}
