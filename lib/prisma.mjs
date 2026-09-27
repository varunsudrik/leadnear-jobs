// lib/prisma.mjs — PrismaClient singleton.
//
// .mjs rather than .js: it is ESM, and lib/resume/store.mjs loads it under plain
// `node` for the test suites, where a typeless .js makes Node reparse it with a
// MODULE_TYPELESS_PACKAGE_JSON warning.
//
// Mirrors the pooling concern in lib/db.js: `next dev` re-evaluates modules on
// every hot reload, and a fresh PrismaClient per reload would open a new
// connection pool each time. This database allows only 20 connections in total,
// so that leaks the budget within a handful of edits.
//
// Prisma covers the 40 leadnear tables (User, Account, Session, …). The job
// board tables are queried with raw SQL through lib/db.js — the two coexist on
// the same database and neither manages the other's tables.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma._prismaClient ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma._prismaClient = prisma;
}

export default prisma;
