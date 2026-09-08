import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { hasValidAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = new Set(["refresh-counts", "publish-jobs"]);
const STATE_DIR = path.join(process.cwd(), ".runtime", "backoffice");
const ID_PATTERN = /^[0-9a-f-]{36}$/i;

function unauthorized() {
  return Response.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "WWW-Authenticate": 'Basic realm="LeadNear Jobs Backoffice"' } }
  );
}

async function readState(id) {
  if (!ID_PATTERN.test(id || "")) return null;
  try {
    return JSON.parse(await readFile(path.join(STATE_DIR, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

async function findRunningOperation() {
  await mkdir(STATE_DIR, { recursive: true });
  const files = await readdir(STATE_DIR);
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const state = await readState(file.slice(0, -5));
    if (!state || !["queued", "running"].includes(state.status)) continue;
    const started = Date.parse(state.startedAt || state.queuedAt || "");
    if (Number.isFinite(started) && Date.now() - started > 6 * 60 * 60 * 1000) {
      await writeFile(
        path.join(STATE_DIR, file),
        JSON.stringify({
          ...state,
          status: "failed",
          message: "Operation expired before it could complete.",
          completedAt: new Date().toISOString(),
        })
      );
      continue;
    }
    return state;
  }
  return null;
}

export async function GET(request) {
  if (!hasValidAdminAuth(request)) return unauthorized();
  const id = new URL(request.url).searchParams.get("id");
  const state = await readState(id);
  if (!state) return Response.json({ error: "Operation not found." }, { status: 404 });
  return Response.json(state, { headers: { "cache-control": "no-store" } });
}

export async function POST(request) {
  if (!hasValidAdminAuth(request)) return unauthorized();
  const body = await request.json().catch(() => ({}));
  if (!ALLOWED_ACTIONS.has(body.action)) {
    return Response.json({ error: "Unknown operation." }, { status: 400 });
  }

  const running = await findRunningOperation();
  if (running) {
    return Response.json(
      { error: "Another backoffice operation is already running.", operation: running },
      { status: 409 }
    );
  }

  const id = randomUUID();
  const state = {
    id,
    action: body.action,
    status: "queued",
    message: "Operation queued.",
    queuedAt: new Date().toISOString(),
  };
  await writeFile(path.join(STATE_DIR, `${id}.json`), JSON.stringify(state));

  const worker = spawn(
    process.execPath,
    [path.join(process.cwd(), "scripts", "run-backoffice-operation.mjs"), id, body.action],
    { cwd: process.cwd(), detached: true, stdio: "ignore", env: process.env }
  );
  worker.unref();

  return Response.json(state, { status: 202 });
}
