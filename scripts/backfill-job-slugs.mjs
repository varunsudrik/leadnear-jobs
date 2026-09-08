import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function loadEnvFile(file) {
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

loadEnvFile(path.join(process.cwd(), ".env.local"));

const pool = new pg.Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5434),
  user: process.env.DB_USER || "jobuser",
  password: process.env.DB_PASS || "jobpass123",
  database: process.env.DB_NAME || "jobs_slug_rehearsal",
  max: 1,
});

const batchSize = Math.max(1, Number(process.env.JOB_SLUG_BACKFILL_BATCH_SIZE || 10000));
const maxBatches = Math.max(1, Number(process.env.JOB_SLUG_BACKFILL_MAX_BATCHES || 1000000));

async function countRemaining() {
  const result = await pool.query(
    "SELECT COUNT(*)::bigint AS remaining FROM jobs WHERE job_slug IS NULL OR job_slug = ''"
  );
  return Number(result.rows[0].remaining);
}

async function runBatch() {
  const started = Date.now();
  const result = await pool.query(
    `WITH batch AS (
       SELECT db_id
       FROM jobs
       WHERE job_slug IS NULL OR job_slug = ''
       ORDER BY db_id
       LIMIT $1
     )
     UPDATE jobs j
     SET job_slug = public.generate_job_slug(j.title, j.db_id, 150)
     FROM batch
     WHERE j.db_id = batch.db_id`,
    [batchSize]
  );
  return {
    rows: result.rowCount,
    seconds: (Date.now() - started) / 1000,
  };
}

async function main() {
  const totalStarted = Date.now();
  let totalRows = 0;

  for (let batch = 1; batch <= maxBatches; batch += 1) {
    const { rows, seconds } = await runBatch();
    totalRows += rows;
    const rate = seconds > 0 ? Math.round(rows / seconds) : rows;
    const remaining = rows > 0 ? await countRemaining() : 0;
    const etaSeconds = rate > 0 ? Math.round(remaining / rate) : null;

    console.log(JSON.stringify({
      batch,
      rows,
      seconds,
      rowsPerSecond: rate,
      remaining,
      etaSeconds,
      totalRows,
    }));

    if (rows === 0) break;
  }

  console.log(JSON.stringify({
    done: true,
    totalRows,
    totalSeconds: (Date.now() - totalStarted) / 1000,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end().catch(() => {});
});
