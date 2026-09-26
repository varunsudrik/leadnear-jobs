#!/usr/bin/env node
// scripts/prisma.mjs — run the Prisma CLI with this project's .env.local.
//
// Prisma reads .env (and prisma/.env) but deliberately ignores .env.local,
// which is where Next.js and the other scripts here keep the connection
// string. Rather than maintain the same credentials in two files that can
// drift apart, load .env.local first and hand the environment to Prisma.
//
//   node scripts/prisma.mjs db push
//   node scripts/prisma.mjs studio
//   node scripts/prisma.mjs diff      the SQL `db push` would run, applied nowhere
//
// It also refuses what would destroy the job board (lib/prisma-guard.mjs):
// `db push` only runs when Prisma's own diff contains no DROP TABLE or DROP
// COLUMN, and commands that reset the database are blocked outright. Prisma
// does not know the job tables exist, so on a populated database `db push`
// would drop every one of them (13 on staging). Run `npx prisma …` directly
// only if you really mean to — and never against a shared database.

import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { loadEnvFile } from "../lib/load-env.mjs";
import { blockedReason, destructiveStatements, isDbPush } from "../lib/prisma-guard.mjs";

const root = process.cwd();
loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set — checked .env.local and .env in", root);
  process.exit(1);
}

const args = process.argv.slice(2);

const blocked = blockedReason(args);
if (blocked) {
  console.error(`REFUSING: prisma ${args.join(" ")} — ${blocked}.`);
  console.error("This database also holds the job board's tables, which Prisma does not know about.");
  process.exit(1);
}

// The SQL that would take DATABASE_URL to prisma/schema.prisma. Read-only:
// Prisma introspects the database and prints; nothing is applied.
function schemaDiff() {
  const result = spawnSync(
    "npx",
    ["prisma", "migrate", "diff", "--from-url", process.env.DATABASE_URL, "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
    { env: process.env, encoding: "utf8" }
  );
  return result.status === 0 ? { ok: true, sql: result.stdout } : { ok: false, error: (result.stderr || result.stdout || "").trim() };
}

if (args[0] === "diff") {
  const diff = schemaDiff();
  if (!diff.ok) {
    console.error(diff.error);
    process.exit(1);
  }
  process.stdout.write(diff.sql.trim() ? diff.sql : "-- no changes: the database already matches prisma/schema.prisma\n");
  process.exit(0);
}

if (isDbPush(args)) {
  const diff = schemaDiff();
  if (!diff.ok) {
    // Fail closed: without the diff there is no way to know what push would drop.
    console.error("REFUSING: could not compute what `db push` would change, so it is not safe to run.");
    console.error(diff.error);
    process.exit(1);
  }
  const drops = destructiveStatements(diff.sql);
  if (drops.length) {
    console.error(`REFUSING: db push would run ${drops.length} destructive statement(s):\n`);
    for (const line of drops) console.error(`  ${line}`);
    console.error("\nThese are the job board's tables (created by raw SQL, unknown to Prisma), or real data.");
    console.error("See the full SQL with `npm run db:diff`, then apply only the additive statements with a");
    console.error("reviewed script — scripts/migrate-resume-tables.mjs is the pattern.");
    process.exit(1);
  }
  console.log("db push: Prisma's diff contains no drops — proceeding.");
}

const child = spawn("npx", ["prisma", ...args], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
