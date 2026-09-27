// lib/pg-pool.mjs — the one pg Pool the app uses for raw SQL.
//
// The database allows 20 connections in total (AGENTS.md), shared by the app,
// Prisma and every script. lib/db.js (the job board's queries) and
// lib/resume/match.mjs (the matches ranking) both take their pool from here,
// so the app holds one pool, not one per module. Plain .mjs with explicit
// imports so it also loads under `node scripts/*.mjs`, which lib/db.js's
// Next-only neighbours cannot.
import pg from "pg";
import { buildPgConfig } from "./pg-config.mjs";

const { Pool, types } = pg;

// Return COUNT/BIGINT and NUMERIC values as JavaScript numbers.
types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);

// Kept on globalThis so a hot reload in dev reuses it instead of leaking a
// new pool (and its connections) per edit.
export function getPool() {
  if (!globalThis._postgresPool) {
    const pool = new Pool(buildPgConfig());
    // pg emits 'error' on idle clients that drop (a DB restart or network
    // blip). Left unhandled that is an uncaught exception that crashes the
    // whole Next.js process instead of failing the in-flight query.
    pool.on("error", (err) => {
      console.error("Postgres pool idle client error", err);
    });
    globalThis._postgresPool = pool;
  }
  return globalThis._postgresPool;
}
