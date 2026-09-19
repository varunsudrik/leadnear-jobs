import assert from "node:assert/strict";

// A minimal in-memory stand-in for Prisma, injected through the same global
// singleton lib/prisma.js already uses to survive Next's hot-reload (see its
// own comment there). This is what lets the redact-vs-delete distinction —
// the whole point of this suite's newest test — be exercised for real, with
// actual row state moving through saveScan/redactScans/scanQuota/latestScan,
// instead of only asserting which Prisma method name gets called. It must be
// installed BEFORE lib/resume/store.mjs is first imported, since lib/prisma.js
// only builds a real PrismaClient when this global is absent.
function makeFakePrisma() {
  let rows = [];
  let seq = 0;
  const api = {
    resumeScan: {
      count: async ({ where }) => rows.filter((r) => r.userId === where.userId).length,
      findFirst: async ({ where }) =>
        rows.filter((r) => r.userId === where.userId).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
      create: async ({ data }) => {
        const row = { id: `row-${++seq}`, createdAt: seq, ...data };
        rows.push(row);
        return { id: row.id, createdAt: row.createdAt };
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        rows = rows.map((r) => {
          if (r.userId !== where.userId) return r;
          count += 1;
          return { ...r, ...data };
        });
        return { count };
      },
    },
    $transaction: async (fn) => fn(api),
  };
  return { api, rows: () => rows };
}

const fake = makeFakePrisma();
globalThis._prismaClient = fake.api;

const { QUOTA, quotaFrom, scanQuota, latestScan, redactScans, saveScan } = await import("../lib/resume/store.mjs");

// Quota arithmetic is pure and must be testable without a database, because
// it is the thing that decides whether a user is charged.
assert.deepEqual(quotaFrom(0), { used: 0, quota: QUOTA, remaining: QUOTA, exhausted: false });
assert.deepEqual(quotaFrom(2), { used: 2, quota: QUOTA, remaining: 1, exhausted: false });
assert.deepEqual(quotaFrom(3), { used: 3, quota: QUOTA, remaining: 0, exhausted: true });

// Never negative, whatever the count says. A stored counter could drift past
// the quota; a derived count should not, but the UI must not render "-1 left".
assert.equal(quotaFrom(5).remaining, 0);
assert.equal(quotaFrom(5).exhausted, true);

// Guard clauses in the DB-touching functions short-circuit BEFORE calling
// Prisma, so they are testable with no database at all. This is the class of
// assertion that would have caught the deleteScans(undefined) data
// -destruction bug: Prisma drops `undefined` keys from a `where` filter, so
// an unguarded call runs unfiltered and touches every user's rows.
assert.deepEqual(await scanQuota(null), quotaFrom(0));
assert.deepEqual(await scanQuota(undefined), quotaFrom(0));
assert.equal(await latestScan(null), null);
assert.deepEqual(await redactScans(null), { count: 0 });
assert.deepEqual(await redactScans(undefined), { count: 0 });

// FIX (the reopened free-scan hole): quota is COUNT(*) over ResumeScan rows
// (spec D8). Register, scan 3 times, delete, scan 3 more, forever — unless
// deleting keeps the row. redactScans must leave the row in place so the
// count never drops, while still clearing what it holds.
const userId = "redact-test-user";
const built = (n) => ({
  score: 70 + n,
  skills: [`skill-${n}`],
  scan: { filename: `resume-${n}.pdf`, pages: 1, lines: [] },
});
for (let i = 0; i < QUOTA; i++) {
  const saved = await saveScan(userId, built(i));
  assert.ok(!saved.overQuota, `scan ${i} should be accepted, quota not yet reached`);
}

const beforeRedact = await scanQuota(userId);
assert.deepEqual(beforeRedact, quotaFrom(QUOTA), "3 saved scans should exhaust the quota");

const redacted = await redactScans(userId);
assert.deepEqual(redacted, { count: QUOTA }, "every row for the user must be touched by a redact");

// This is the assertion that stops the hole reopening: if redactScans is
// ever reverted to a hard delete, the row count drops and this fails.
const afterRedact = await scanQuota(userId);
assert.deepEqual(
  afterRedact,
  beforeRedact,
  "redacting a scan must never change the quota — the row must survive, only its content is cleared"
);

// The rows themselves must actually lose their content, not merely survive:
// a redact that no-ops on content would pass the count check above while
// still leaking the stored resume text and result.
for (const row of fake.rows().filter((r) => r.userId === userId)) {
  assert.deepEqual(row.result, {}, "redacted row must have its result cleared");
  assert.equal(row.filename, "", "redacted row must have its filename cleared");
  assert.deepEqual(row.skills, [], "redacted row must have its skills cleared");
  assert.equal(row.score, 0, "redacted row must have its score cleared");
}

// A redacted row must not resurrect as a scan: /resume must fall back to the
// upload state, not render an empty result as though it were a real one.
assert.equal(await latestScan(userId), null, "a fully redacted account must report no scan");

console.log("resume-store ok");
