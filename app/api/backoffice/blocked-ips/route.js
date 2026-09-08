import { query, queryOne } from "@/lib/db";
import { hasValidAdminAuth } from "@/lib/admin-auth";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "WWW-Authenticate": 'Basic realm="LeadNear Jobs Backoffice"' } }
  );
}

// Helper to load Vercel env variables from .env.ratelimiter manually
function loadVercelEnv() {
  const env = {
    VERCEL_TOKEN: process.env.VERCEL_TOKEN,
    VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
    VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID,
  };

  const paths = [
    path.join(process.cwd(), ".env.ratelimiter"),
    "/opt/jobs-portal/.env.ratelimiter"
  ];

  for (const filepath of paths) {
    if (fs.existsSync(filepath)) {
      try {
        const content = fs.readFileSync(filepath, "utf8");
        for (const line of content.split("\n")) {
          const trimmed = line.strip ? line.strip() : line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const index = trimmed.indexOf("=");
          if (index > -1) {
            const k = trimmed.slice(0, index).trim();
            const v = trimmed.slice(index + 1).trim();
            env[k] = v;
          }
        }
        break; // Stop at first found file
      } catch (e) {
        console.error(`Failed to load env file ${filepath}:`, e);
      }
    }
  }

  return env;
}

export async function GET(request) {
  if (!hasValidAdminAuth(request)) return unauthorized();

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status") || "blocked";

  try {
    let rows;
    if (statusFilter === "all") {
      rows = await query(`
        SELECT id, ip_address, request_count, user_agent, sample_paths, blocked_at, unblocked_at, expires_at, status, blocked_by, unblocked_by, notes
        FROM blocked_ips
        ORDER BY blocked_at DESC
      `);
    } else {
      rows = await query(`
        SELECT id, ip_address, request_count, user_agent, sample_paths, blocked_at, unblocked_at, expires_at, status, blocked_by, unblocked_by, notes
        FROM blocked_ips
        WHERE status = ?
        ORDER BY blocked_at DESC
      `, [statusFilter]);
    }

    return Response.json({ ips: rows }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("Failed to fetch blocked IPs:", err);
    return Response.json({ error: "Database query failed" }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!hasValidAdminAuth(request)) return unauthorized();

  let id;
  try {
    // Try request body first
    const body = await request.json().catch(() => ({}));
    id = body.id;
  } catch {
    // Ignore body parsing errors and try query parameters
  }

  if (!id) {
    const { searchParams } = new URL(request.url);
    id = searchParams.get("id");
  }

  if (!id) {
    return Response.json({ error: "Missing block record ID" }, { status: 400 });
  }

  try {
    // Get IP address from database
    const record = await queryOne(`
      SELECT ip_address, status FROM blocked_ips WHERE id = ?
    `, [id]);

    if (!record) {
      return Response.json({ error: "Block record not found" }, { status: 404 });
    }

    if (record.status !== "blocked") {
      return Response.json({ error: `IP is not currently blocked (status: ${record.status})` }, { status: 400 });
    }

    const ipAddress = record.ip_address;

    // Load Vercel Env credentials
    const vercelEnv = loadVercelEnv();
    const { VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } = vercelEnv;

    if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
      console.warn("Vercel credentials missing. Cannot unblock IP on Vercel.");
      // We will still update the database status as requested, but log a warning.
    } else {
      // 1. Fetch current firewall configuration to find the ID of the blocked IP entry
      let url = `https://api.vercel.com/v1/security/firewall/config?projectId=${VERCEL_PROJECT_ID}`;
      if (VERCEL_TEAM_ID) {
        url += `&teamId=${VERCEL_TEAM_ID}`;
      }

      const getRes = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${VERCEL_TOKEN}`,
        },
      });

      if (!getRes.ok) {
        const getResText = await getRes.text();
        return Response.json({ error: `Failed to fetch Vercel config: ${getResText}` }, { status: 502 });
      }

      const configData = await getRes.json();
      const activeIps = configData?.active?.ips || [];
      const draftIps = configData?.draft?.ips || [];
      const foundIpEntry = [...activeIps, ...draftIps].find(entry => entry.ip === ipAddress);

      if (foundIpEntry && foundIpEntry.id) {
        // 2. Call Vercel API to remove IP block using its ID
        const patchRes = await fetch(url, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${VERCEL_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "ip.remove",
            id: foundIpEntry.id,
          }),
        });

        const patchResText = await patchRes.text();
        console.log(`Vercel Firewall unblock response for ${ipAddress} (ID: ${foundIpEntry.id}): ${patchRes.status} - ${patchResText}`);

        if (!patchRes.ok) {
          if (patchRes.status !== 404 && !patchResText.includes("not_found")) {
            return Response.json({ error: `Vercel Firewall PATCH failed: ${patchResText}` }, { status: 502 });
          }
        }
      } else {
        console.log(`IP ${ipAddress} not found in Vercel active or draft firewall configuration. Assuming already unblocked.`);
      }
    }

    // Update database status
    await query(`
      UPDATE blocked_ips
      SET status = 'unblocked', unblocked_at = NOW(), unblocked_by = 'admin'
      WHERE id = ?
    `, [id]);

    return Response.json({ success: true, ip: ipAddress });
  } catch (err) {
    console.error("Failed to unblock IP:", err);
    return Response.json({ error: err.message || "Failed to unblock IP" }, { status: 500 });
  }
}
