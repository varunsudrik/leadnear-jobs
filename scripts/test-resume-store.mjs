import assert from "node:assert/strict";
import { QUOTA, quotaFrom } from "../lib/resume/store.mjs";

// Quota arithmetic is pure and must be testable without a database, because
// it is the thing that decides whether a user is charged.
assert.deepEqual(quotaFrom(0), { used: 0, quota: QUOTA, remaining: QUOTA, exhausted: false });
assert.deepEqual(quotaFrom(2), { used: 2, quota: QUOTA, remaining: 1, exhausted: false });
assert.deepEqual(quotaFrom(3), { used: 3, quota: QUOTA, remaining: 0, exhausted: true });

// Never negative, whatever the count says. A stored counter could drift past
// the quota; a derived count should not, but the UI must not render "-1 left".
assert.equal(quotaFrom(5).remaining, 0);
assert.equal(quotaFrom(5).exhausted, true);

console.log("resume-store ok");
