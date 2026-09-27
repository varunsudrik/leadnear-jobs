// lib/db.js — PostgreSQL singleton pool for Next.js App Router

import { getPool } from "./pg-pool.mjs";

// The singleton lives in lib/pg-pool.mjs (connection details and TLS from
// lib/pg-config.mjs), shared with lib/resume/match.mjs so the app holds one
// pool against the database's 20-connection budget.
const pool = getPool();

export default pool;

function postgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// ─── Helper: query that returns rows ──────────────────────────────────────────
export async function query(sql, values = []) {
  const result = await pool.query(postgresSql(sql), values);
  return result.rows;
}

// ─── Helper: get single row ───────────────────────────────────────────────────
export async function queryOne(sql, values = []) {
  const rows = await query(sql, values);
  return rows[0] ?? null;
}
