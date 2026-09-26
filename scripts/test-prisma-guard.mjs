import assert from "node:assert/strict";
import { blockedReason, destructiveStatements, isDbPush } from "../lib/prisma-guard.mjs";

// ─── blockedReason ──────────────────────────────────────────────────────────
assert.match(blockedReason(["db", "push", "--force-reset"]), /drops and recreates/);
assert.match(blockedReason(["db", "push", "--accept-data-loss"]), /without asking/);
assert.match(blockedReason(["migrate", "reset"]), /wipes/);
assert.match(blockedReason(["migrate", "reset", "--force"]), /wipes/);
assert.match(blockedReason(["migrate", "dev"]), /drift/);
assert.equal(blockedReason(["db", "push"]), null);
assert.equal(blockedReason(["studio"]), null);
assert.equal(blockedReason(["generate"]), null);
assert.equal(blockedReason(["migrate", "diff", "--script"]), null);
assert.equal(blockedReason(undefined), null);

// ─── isDbPush ───────────────────────────────────────────────────────────────
assert.equal(isDbPush(["db", "push"]), true);
assert.equal(isDbPush(["db", "push", "--skip-generate"]), true);
assert.equal(isDbPush(["db", "pull"]), false);
assert.equal(isDbPush(["studio"]), false);

// ─── destructiveStatements ──────────────────────────────────────────────────
// What `migrate diff` produced against staging on 2026-09-26 (abridged).
const staging = `-- DropTable
DROP TABLE "jobs";

-- DropTable
DROP TABLE "job_skills";
`;
assert.deepEqual(destructiveStatements(staging), ['DROP TABLE "jobs";', 'DROP TABLE "job_skills";']);
// Dropped columns arrive inside ALTER TABLE, sometimes on their own line.
assert.deepEqual(
  destructiveStatements(`ALTER TABLE "User" DROP COLUMN "phone",\nADD COLUMN "mobile" TEXT;`),
  ['ALTER TABLE "User" DROP COLUMN "phone",']
);
assert.deepEqual(destructiveStatements(`ALTER TABLE "User"\n    DROP COLUMN "phone";`), ['DROP COLUMN "phone";']);
// Purely additive changes are allowed through.
assert.deepEqual(
  destructiveStatements(`-- CreateTable\nCREATE TABLE "Thing" ("id" TEXT NOT NULL);\nALTER TABLE "User" ADD COLUMN "mobile" TEXT;\nCREATE INDEX "x" ON "Thing"("id");`),
  []
);
// An index or constraint drop is not data loss and does not block.
assert.deepEqual(destructiveStatements(`DROP INDEX "old_idx";\nALTER TABLE "A" DROP CONSTRAINT "A_fkey";`), []);
assert.deepEqual(destructiveStatements(""), []);
assert.deepEqual(destructiveStatements(undefined), []);

console.log("prisma-guard ok");
