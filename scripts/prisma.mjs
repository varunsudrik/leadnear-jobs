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

import path from "node:path";
import { spawn } from "node:child_process";
import { loadEnvFile } from "../lib/load-env.mjs";

const root = process.cwd();
loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set — checked .env.local and .env in", root);
  process.exit(1);
}

const child = spawn("npx", ["prisma", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
