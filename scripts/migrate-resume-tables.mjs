// Additive DDL for the resume-scan tables. Deliberately NOT `prisma db push`:
// the job-board tables are managed by raw SQL and are absent from
// prisma/schema.prisma, so db push proposes dropping all eleven of them.
// Statements are idempotent and touch nothing that already exists.
import pg from "pg";
import { loadEnvFile } from "../lib/load-env.mjs";
import { buildPgConfig } from "../lib/pg-config.mjs";

loadEnvFile(".env.local");
let host;
try {
  host = new URL(process.env.DATABASE_URL).hostname;
} catch {
  console.error(`REFUSING: DATABASE_URL is not set or not a valid URL.`);
  process.exit(1);
}
if (!host.endsWith("aivencloud.com")) {
  console.error(`REFUSING: ${host} is not the Aiven staging host.`);
  process.exit(1);
}

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "ResumeScan" (
     "id" TEXT NOT NULL,
     "userId" TEXT NOT NULL,
     "filename" TEXT NOT NULL,
     "pages" INTEGER NOT NULL,
     "score" INTEGER NOT NULL,
     "skills" TEXT[],
     "result" JSONB NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ResumeScan_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE TABLE IF NOT EXISTS "ResumeScanTarget" (
     "id" TEXT NOT NULL,
     "scanId" TEXT NOT NULL,
     "canonicalTitle" TEXT NOT NULL,
     "score" INTEGER NOT NULL,
     "cohortSize" INTEGER NOT NULL,
     "detail" JSONB NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ResumeScanTarget_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "ResumeScan_userId_createdAt_idx" ON "ResumeScan"("userId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ResumeScanTarget_scanId_createdAt_idx" ON "ResumeScanTarget"("scanId", "createdAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ResumeScanTarget_scanId_canonicalTitle_key" ON "ResumeScanTarget"("scanId", "canonicalTitle")`,
];

// Foreign keys have no IF NOT EXISTS, so add them only when absent.
const CONSTRAINTS = [
  [`ResumeScan_userId_fkey`, `ALTER TABLE "ResumeScan" ADD CONSTRAINT "ResumeScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  [`ResumeScanTarget_scanId_fkey`, `ALTER TABLE "ResumeScanTarget" ADD CONSTRAINT "ResumeScanTarget_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "ResumeScan"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
];

const pool = new pg.Pool(buildPgConfig());
const client = await pool.connect();
try {
  const before = await client.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`);
  await client.query("BEGIN");
  for (const sql of STATEMENTS) await client.query(sql);
  for (const [name, sql] of CONSTRAINTS) {
    const { rows } = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [name]);
    if (!rows.length) await client.query(sql);
  }
  // prisma/schema.prisma declares `skills String[]` as required, but the
  // CREATE TABLE above left the column nullable, so Prisma Client believes a
  // NULL can't occur while Postgres would accept one. The table is empty on
  // staging, so tightening this now is safe; guarded so re-runs are no-ops.
  {
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ResumeScan' AND column_name = 'skills' AND is_nullable = 'YES'`
    );
    if (rows.length) await client.query(`ALTER TABLE "ResumeScan" ALTER COLUMN "skills" SET NOT NULL`);
  }
  await client.query("COMMIT");
  const after = await client.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`);
  console.log(`tables before: ${before.rows[0].n}  after: ${after.rows[0].n}  (expected +2 on a fresh run, +0 when re-run)`);
  for (const t of ["ResumeScan", "ResumeScanTarget"]) {
    const { rows } = await client.query(`SELECT to_regclass($1) AS t`, [`public.\"${t}\"`]);
    console.log(`  ${t}: ${rows[0].t ? "present" : "MISSING"}`);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("migration failed, rolled back:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
