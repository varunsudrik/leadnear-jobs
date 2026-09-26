// lib/prisma-guard.mjs — what scripts/prisma.mjs refuses to run.
//
// This database holds two table families (AGENTS.md): Prisma's tables, and
// the job board's (jobs, job_locations, the rollups, job_skills…), which are
// created by raw SQL and declared nowhere in prisma/schema.prisma. To Prisma
// those look like tables to remove, so on any populated database `db push`
// computes DROP TABLE for every one of them — 13 on staging, 2026-09-26.
// Pure, so it is tested directly (scripts/test-prisma-guard.mjs).

// Commands that reset or wipe a database whatever the diff says. `migrate dev`
// offers to reset any database it finds "drifted" from migrations, and this
// one always is: the project has no migrations and half its tables are
// outside Prisma.
const BLOCKED = [
  { match: (args) => args.includes("--force-reset"), why: "--force-reset drops and recreates the whole database" },
  { match: (args) => args.includes("--accept-data-loss"), why: "--accept-data-loss applies drops without asking" },
  { match: (args) => args[0] === "migrate" && args[1] === "reset", why: "migrate reset wipes the whole database" },
  { match: (args) => args[0] === "migrate" && args[1] === "dev", why: "migrate dev offers to reset a drifted database, and this one always drifts (no migrations; job tables live outside Prisma)" },
];

// The reason a command is refused outright, or null.
export function blockedReason(args) {
  const list = Array.isArray(args) ? args : [];
  return BLOCKED.find((rule) => rule.match(list))?.why ?? null;
}

export const isDbPush = (args) => Array.isArray(args) && args[0] === "db" && args[1] === "push";

// Statements in a `prisma migrate diff --script` that destroy data: whole
// tables, or columns (which Prisma emits inside ALTER TABLE, possibly on a
// continuation line). Returns the offending lines, trimmed.
export function destructiveStatements(sql) {
  return String(sql ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^DROP\s+TABLE\b/i.test(line) || /\bDROP\s+COLUMN\b/i.test(line));
}
