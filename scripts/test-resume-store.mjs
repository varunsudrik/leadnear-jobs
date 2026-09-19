import assert from "node:assert/strict";
import { QUOTA, quotaFrom, scanQuota, latestScan, deleteScans } from "../lib/resume/store.mjs";

// Quota arithmetic is pure and must be testable without a database, because
// it is the thing that decides whether a user is charged.
assert.deepEqual(quotaFrom(0), { used: 0, quota: QUOTA, remaining: QUOTA, exhausted: false });
assert.deepEqual(quotaFrom(2), { used: 2, quota: QUOTA, remaining: 1, exhausted: false });
assert.deepEqual(quotaFrom(3), { used: 3, quota: QUOTA, remaining: 0, exhausted: true });

// Never negative, whatever the count says. A stored counter could drift past
// the quota; a derived count should not, but the UI must not render "-1 left".
assert.equal(quotaFrom(5).remaining, 0);
assert.equal(quotaFrom(5).exhausted, true);

// Guard clauses in the three DB-touching functions short-circuit BEFORE
// calling Prisma, so they are testable with no database at all. This is the
// class of assertion that would have caught the deleteScans(undefined) data
// -destruction bug: Prisma drops `undefined` keys from a `where` filter, so
// an unguarded deleteMany({ where: { userId: undefined } }) runs as
// deleteMany({}) and wipes every user's rows.
assert.deepEqual(await scanQuota(null), quotaFrom(0));
assert.deepEqual(await scanQuota(undefined), quotaFrom(0));
assert.equal(await latestScan(null), null);
assert.deepEqual(await deleteScans(null), { count: 0 });
assert.deepEqual(await deleteScans(undefined), { count: 0 });

console.log("resume-store ok");
