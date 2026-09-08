import { spawn } from "node:child_process";
import fs from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const [id, action] = process.argv.slice(2);
const allowed = new Set(["refresh-counts", "publish-jobs"]);
if (!/^[0-9a-f-]{36}$/i.test(id || "") || !allowed.has(action)) process.exit(2);

const root = process.cwd();
const stateDir = path.join(root, ".runtime", "backoffice");
const statePath = path.join(stateDir, `${id}.json`);

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

loadEnvFile(path.join(root, ".env.local"));

const pool = new pg.Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "jobuser",
  password: process.env.DB_PASS || "jobpass123",
  database: process.env.DB_NAME || "jobboard",
  max: 1,
});

async function writeState(state) {
  await mkdir(stateDir, { recursive: true });
  const temporary = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(state));
  await rename(temporary, statePath);
}

async function snapshot() {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE render_hash IS NOT NULL
          AND published_render_hash IS DISTINCT FROM render_hash
      ) AS pending_pages,
      COUNT(*) FILTER (WHERE published_at IS NOT NULL) AS published_pages,
      MAX(published_at) AS last_published_at
    FROM jobs
    WHERE status='success'
  `);
  const metrics = await pool.query(`
    SELECT total_jobs, total_remote, total_100k_plus, total_companies, updated_at
    FROM site_metrics
    WHERE id=1
  `);
  const atsSources = await pool.query(`
    SELECT source, COUNT(*) AS job_count
    FROM jobs
    WHERE status='success' AND NULLIF(BTRIM(source), '') IS NOT NULL
    GROUP BY source
    ORDER BY job_count DESC, source
  `);
  const publication = result.rows[0] || {};
  const counts = metrics.rows[0] || {};
  return {
    totalJobs: Number(counts.total_jobs || 0),
    totalRemote: Number(counts.total_remote || 0),
    total100kPlus: Number(counts.total_100k_plus || 0),
    totalCompanies: Number(counts.total_companies || 0),
    countsUpdatedAt: counts.updated_at || null,
    pendingPages: Number(publication.pending_pages || 0),
    publishedPages: Number(publication.published_pages || 0),
    lastPublishedAt: publication.last_published_at || null,
    atsSources: atsSources.rows.map((item) => ({
      source: item.source,
      jobCount: Number(item.job_count || 0),
    })),
  };
}

const startedAt = new Date().toISOString();
await writeState({
  id,
  action,
  status: "running",
  message: action === "publish-jobs" ? "Publishing new job pages..." : "Refreshing homepage counts...",
  startedAt,
  workerPid: process.pid,
});

let stdout = "";
let stderr = "";
try {
  const args = ["scripts/publish-jobs.mjs"];
  if (action === "refresh-counts") args.push("refresh-counts");

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env: process.env });
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-100000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-100000); });
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (exitCode !== 0) throw new Error(stderr.trim() || `Publisher exited with code ${exitCode}.`);
  if (stdout.includes("run is active; exiting")) {
    throw new Error("Another publishing operation is already running.");
  }

  const published = stdout.match(/Published (\d+)\/(\d+) job pages\./);
  const noPending = stdout.includes("no job pages need publishing");
  const stats = await snapshot();
  const pagesCreated = published ? Number(published[1]) : 0;
  const message = action === "publish-jobs"
    ? (noPending ? "No new job pages were pending." : "Job publication completed.")
    : "Homepage counts refreshed.";

  await writeState({
    id,
    action,
    status: "completed",
    message,
    startedAt,
    completedAt: new Date().toISOString(),
    pagesCreated,
    pagesAttempted: published ? Number(published[2]) : 0,
    stats,
  });
} catch (error) {
  const published = stdout.match(/Published (\d+)\/(\d+) job pages\./);
  await writeState({
    id,
    action,
    status: "failed",
    message: error.message || "Operation failed.",
    startedAt,
    completedAt: new Date().toISOString(),
    pagesCreated: published ? Number(published[1]) : 0,
    pagesAttempted: published ? Number(published[2]) : 0,
    output: (stderr || stdout).slice(-4000),
  });
} finally {
  await pool.end().catch(() => {});
}
