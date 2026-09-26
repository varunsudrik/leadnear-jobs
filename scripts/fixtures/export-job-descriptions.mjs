// Exports the real job descriptions that scripts/test-skills-sections.mjs pins,
// from the staging database (DATABASE_URL — itself a sample of production;
// production is never read here). Each is written verbatim except that email
// addresses and phone numbers are redacted.
//
//   node scripts/fixtures/export-job-descriptions.mjs
//
// Re-running overwrites the files with whatever staging holds now; the tests
// assert on the committed copies, so only re-run deliberately.
import { writeFileSync } from "node:fs";
import pg from "pg";
import { loadEnvFile } from "../../lib/load-env.mjs";
import { buildPgConfig } from "../../lib/pg-config.mjs";

loadEnvFile(".env.local");

// apply_url_md5 -> why it is a fixture
export const FIXTURES = {
  "02c555922c9d5a7cf8fc25cde2387d88": "smartrecruiters <h2>Qualifications</h2> with a nested bold sub-heading",
  "01d39d5344915c6cd908ddf16e4cf025": "smartrecruiters French, ALL-CAPS bold headings, empty trailing Qualifications",
  "1cda1fa73adc4518b181c0be5c26212e": "greenhouse entity-escaped HTML",
  "0215b108f224ed5ac1c4121c410dd754": "lever plain text with question-style headings",
  "0082c726c7e9f44dd1803326d66b30b1": "workday bullets split onto their own line",
  "01f40505eac208b71053b00e99eeb619": "breezy page-template placeholders, no job text",
  "013dac763cb5ca903933eb6402de879f": "oraclecloud heading that carries its own content",
};

const redact = (s) => s
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
  .replace(/\+?\d[\d\s().-]{8,}\d/g, "[phone]");

const pool = new pg.Pool(buildPgConfig({ max: 1 }));
try {
  const { rows } = await pool.query(
    `SELECT apply_url_md5, description FROM jobs WHERE apply_url_md5 = ANY($1)`,
    [Object.keys(FIXTURES)]
  );
  for (const md5 of Object.keys(FIXTURES)) {
    const row = rows.find((r) => r.apply_url_md5 === md5);
    if (!row) { console.error(`MISSING on this database: ${md5}`); process.exitCode = 1; continue; }
    const out = redact(row.description);
    writeFileSync(`scripts/fixtures/job-descriptions/${md5}.html`, out);
    console.log(`wrote ${md5}.html  ${out.length} chars  (${FIXTURES[md5]})`);
  }
} finally {
  await pool.end();
}
