// lib/staging-guard.mjs — refuse to write anywhere but the Aiven staging
// database. Production is read-only (AGENTS.md); staging is the only database
// this project's scripts may change. Same rule scripts/migrate-resume-tables.mjs
// and scripts/add-resume-match-index.mjs enforce inline.
export function requireStagingDatabase() {
  let host;
  try {
    host = new URL(process.env.DATABASE_URL).hostname;
  } catch {
    console.error("REFUSING: DATABASE_URL is not set or not a valid URL.");
    process.exit(1);
  }
  if (!host.endsWith("aivencloud.com")) {
    console.error(`REFUSING: ${host} is not the Aiven staging host.`);
    process.exit(1);
  }
  return host;
}
