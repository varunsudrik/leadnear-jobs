import { query, queryOne } from "@/lib/db";
import JobForm from "../admin/JobForm";
import OperationsPanel from "./OperationsPanel";
import BlockedIpsPanel from "./BlockedIpsPanel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Backoffice | LeadNear Jobs",
  robots: "noindex,nofollow",
};

export default async function BackofficePage() {
  const [metrics, publication, atsSources] = await Promise.all([
    queryOne(`
      SELECT total_jobs, total_remote, total_100k_plus, total_companies, updated_at
      FROM site_metrics
      WHERE id = 1
    `),
    queryOne(`
      SELECT COUNT(*) FILTER (
        WHERE render_hash IS NOT NULL
          AND published_render_hash IS DISTINCT FROM render_hash
      ) AS pending_pages,
      COUNT(*) FILTER (WHERE published_at IS NOT NULL) AS published_pages,
      MAX(published_at) AS last_published_at
      FROM jobs
      WHERE status='success'
    `),
    query(`
      SELECT source, COUNT(*) AS job_count
      FROM jobs
      WHERE status='success' AND NULLIF(BTRIM(source), '') IS NOT NULL
      GROUP BY source
      ORDER BY job_count DESC, source
    `),
  ]);

  const blockedIps = await query(`
    SELECT id, ip_address, request_count, user_agent, sample_paths, blocked_at, unblocked_at, expires_at, status, blocked_by, unblocked_by, notes
    FROM blocked_ips
    WHERE status = 'blocked'
    ORDER BY blocked_at DESC
  `);

  const initialBlockedIps = blockedIps.map((item) => ({
    ...item,
    blocked_at: item.blocked_at ? new Date(item.blocked_at).toISOString() : null,
    unblocked_at: item.unblocked_at ? new Date(item.unblocked_at).toISOString() : null,
    expires_at: item.expires_at ? new Date(item.expires_at).toISOString() : null,
  }));

  const initialStats = {
    totalJobs: Number(metrics?.total_jobs || 0),
    totalRemote: Number(metrics?.total_remote || 0),
    total100kPlus: Number(metrics?.total_100k_plus || 0),
    totalCompanies: Number(metrics?.total_companies || 0),
    countsUpdatedAt: metrics?.updated_at ? new Date(metrics.updated_at).toISOString() : null,
    pendingPages: Number(publication?.pending_pages || 0),
    publishedPages: Number(publication?.published_pages || 0),
    lastPublishedAt: publication?.last_published_at
      ? new Date(publication.last_published_at).toISOString()
      : null,
    atsSources: atsSources.map((item) => ({
      source: item.source,
      jobCount: Number(item.job_count || 0),
    })),
  };

  return (
    <div className="container admin-page">
      <div className="admin-heading">
        <span className="admin-kicker">LeadNear Jobs Backoffice</span>
        <h1>Publishing controls</h1>
        <p>
          Refresh homepage metrics, publish newly inserted job pages, or download
          the current sitemap URL counts.
        </p>
      </div>

      <OperationsPanel initialStats={initialStats} />

      <div className="admin-heading admin-blocked-ips-heading">
        <span className="admin-kicker">Security</span>
        <h1>Blocked IPs</h1>
        <p>
          IPs automatically blocked for exceeding 300 requests per 10 minutes.
          Blocks expire after 30 days, or unblock manually below.
        </p>
      </div>
      <BlockedIpsPanel initialIps={initialBlockedIps} />

      <div className="admin-heading admin-add-job-heading">
        <span className="admin-kicker">Manual entry</span>
        <h1>Add a job</h1>
        <p>
          New records are published every four hours, or immediately with the
          manual publish control above.
        </p>
      </div>
      <JobForm />
    </div>
  );
}
