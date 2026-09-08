// lib/db.js — PostgreSQL singleton pool for Next.js App Router

import pg from "pg";
import { buildPgConfig } from "./pg-config.mjs";

const globalPool = globalThis;
const { Pool, types } = pg;

// Return COUNT/BIGINT and NUMERIC values as JavaScript numbers.
types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);

// Connection details (including TLS) come from lib/pg-config.mjs so the app and
// the standalone scripts cannot drift apart on how they reach the database.
function createPool() {
  return new Pool(buildPgConfig());
}

// Singleton — prevents multiple pool instances on hot-reload in dev
if (!globalPool._postgresPool) {
  globalPool._postgresPool = createPool();
  // pg emits 'error' on idle clients that drop (e.g. a DB restart or network
  // blip). Left unhandled, that's an uncaught exception that crashes the
  // whole Next.js process instead of just failing the in-flight query.
  globalPool._postgresPool.on("error", (err) => {
    console.error("Postgres pool idle client error", err);
  });
}

export default globalPool._postgresPool;

function postgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// ─── Helper: query that returns rows ──────────────────────────────────────────
export async function query(sql, values = []) {
  const result = await globalPool._postgresPool.query(postgresSql(sql), values);
  return result.rows;
}

// ─── Helper: get single row ───────────────────────────────────────────────────
export async function queryOne(sql, values = []) {
  const rows = await query(sql, values);
  return rows[0] ?? null;
}
