// lib/load-env.mjs — minimal .env reader for the standalone scripts.
//
// Next.js loads .env.local on its own, but `node scripts/*.mjs` does not, and
// the project deliberately has no dotenv dependency. Extracted from
// scripts/publish-jobs.mjs so every script reads the file the same way.
//
// Existing process environment always wins, so an explicit
// `DATABASE_URL=... node scripts/foo.mjs` overrides the file.

import fs from "node:fs";

export function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}
