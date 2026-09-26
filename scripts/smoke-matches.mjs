// End-to-end check of /jobs/matches against the running dev server, as a real
// signed-in user who has a scan (default test@test.com). Local only: it mints
// a session cookie with this checkout's NEXTAUTH_SECRET, which works against
// nothing but this app on localhost.
//
//   npm run matches:smoke                          (dev server on :4100)
//   npm run matches:smoke -- --email=someone@example.com
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig } from "../lib/pg-config.mjs";

loadEnvFile(".env.local");

const BASE = (process.env.SMOKE_BASE_URL || "http://localhost:4100/jobs").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(BASE)) {
  console.error(`REFUSING: ${BASE} is not a local dev server.`);
  process.exit(1);
}
const LATENCY_BUDGET_MS = 2000;
const email = (process.argv.find((a) => a.startsWith("--email=")) ?? "--email=test@test.com").slice("--email=".length);

const pool = new pg.Pool(buildPgConfig({ max: 1 }));
const { rows: [user] } = await pool.query(`SELECT id, email FROM "User" WHERE email = $1`, [email]);
await pool.end();
assert.ok(user, `no user ${email} on this database`);
const token = await encode({
  token: { id: user.id, email: user.email, sub: user.id, isAdmin: false, role: "user" },
  secret: process.env.NEXTAUTH_SECRET,
});
const cookie = `next-auth.session-token=${token}`;

async function load() {
  const started = Date.now();
  const response = await fetch(`${BASE}/matches`, { headers: { cookie } });
  const html = await response.text();
  return { status: response.status, ms: Date.now() - started, html };
}

const decode = (s) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const first = await load(); // compiles the route in dev mode
const page = await load();
const text = decode(page.html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const cards = [...page.html.matchAll(/aria-label="([^"]+) at ([^"]+)"/g)].map((m) =>
  `${decode(m[2])}|${decode(m[1])}`.toLowerCase().replace(/[^a-z0-9|]+/g, " ").trim()
);
const total = Number((text.match(/(\d+) matches/) ?? [])[1] ?? NaN);
const duplicates = cards.length - new Set(cards).size;

console.log(`GET ${BASE}/matches as ${email}: HTTP ${page.status}, ${page.ms}ms (first load ${first.ms}ms)`);
console.log(`  ${total} matches, ${cards.length} cards rendered, ${duplicates} duplicate company+title cards`);
const reasons = [...page.html.matchAll(/class="jc-reason">([^<]+)</g)].map((m) => decode(m[1]));
console.log(`  sample reasons: ${reasons.slice(0, 3).join(" | ")}`);

assert.equal(page.status, 200);
assert.ok(Number.isInteger(total), "no \"N matches\" heading");
assert.doesNotMatch(text, /Matches \d+ of \d+ skills/, "old resume-side reason line still rendered");
if (total > 0) assert.ok(reasons.length && reasons.every((r) => /requirement/.test(r)), "every card needs a requirement-based reason line");
assert.equal(duplicates, 0, "the same company+title appears on more than one card");
assert.ok(page.ms < LATENCY_BUDGET_MS, `second load took ${page.ms}ms (budget ${LATENCY_BUDGET_MS}ms)`);
console.log("matches smoke ok");
