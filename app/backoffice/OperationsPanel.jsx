"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatAtsLabel } from "@/lib/ats";

const API = "/jobs/api/backoffice/operations";

function formatCount(value) {
  return Number(value || 0).toLocaleString();
}

function formatDate(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function OperationsPanel({ initialStats }) {
  const [stats, setStats] = useState(initialStats);
  const [operation, setOperation] = useState(null);
  const [error, setError] = useState("");

  const running = operation?.status === "queued" || operation?.status === "running";

  useEffect(() => {
    if (!running || !operation?.id) return undefined;

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`${API}?id=${encodeURIComponent(operation.id)}`, {
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not read operation status.");
        setOperation(result);
        if (result.stats) setStats(result.stats);
      } catch (requestError) {
        setError(requestError.message);
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [running, operation?.id]);

  async function start(action) {
    setError("");
    setOperation(null);
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not start the operation.");
      setOperation(result);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <section className="admin-operations">
      <div className="admin-metrics-grid">
        <div className="admin-metric"><strong>{formatCount(stats.totalJobs)}</strong><span>Homepage jobs</span></div>
        <div className="admin-metric"><strong>{formatCount(stats.totalRemote)}</strong><span>Remote jobs</span></div>
        <div className="admin-metric"><strong>{formatCount(stats.totalCompanies)}</strong><span>Companies</span></div>
        <div className="admin-metric"><strong>{formatCount(stats.pendingPages)}</strong><span>Pages pending</span></div>
      </div>

      <div className="admin-operation-card admin-ats-card">
        <div>
          <h2>ATS source counts</h2>
          <p>Live active-job counts grouped by source after admin login.</p>
          <small>Last refreshed: {formatDate(stats.countsUpdatedAt)}</small>
        </div>
        <div className="admin-table-container" style={{ flex: 1 }}>
          {(stats.atsSources || []).length > 0 ? (
            <table className="admin-blocked-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>ATS Source</th>
                  <th style={{ textAlign: "right" }}>Job Count</th>
                </tr>
              </thead>
              <tbody>
                {stats.atsSources.map((item) => (
                  <tr key={item.source}>
                    <td>
                      <span style={{ fontWeight: 700, color: "var(--text2)" }}>
                        {formatAtsLabel(item.source)}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <strong style={{ color: "var(--text)" }}>
                        {formatCount(item.jobCount)}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-ats-empty">No ATS sources found.</div>
          )}
        </div>
      </div>

      <div className="admin-operation-card">
        <div>
          <h2>Homepage counts</h2>
          <p>Automatically refreshed every 10 minutes.</p>
          <small>Last refreshed: {formatDate(stats.countsUpdatedAt)}</small>
        </div>
        <button className="admin-action-btn" disabled={running} onClick={() => start("refresh-counts")}>
          Refresh counts now
        </button>
      </div>

      <div className="admin-operation-card">
        <div>
          <h2>New job pages</h2>
          <p>Automatically published every four hours, up to 10,000 pages per run.</p>
          <small>Last published: {formatDate(stats.lastPublishedAt)}</small>
        </div>
        <button className="admin-action-btn" disabled={running} onClick={() => start("publish-jobs")}>
          Publish new jobs now
        </button>
      </div>

      <div className="admin-operation-card">
        <div>
          <h2>Sitemap URL counts</h2>
          <p>Create a live CSV containing each sitemap URL and its record count.</p>
        </div>
        <Link className="admin-action-btn secondary" href="/api/backoffice/sitemap-counts">
          Download CSV
        </Link>
      </div>

      {error && <div className="admin-alert error" role="alert">{error}</div>}

      {operation && (
        <div className={`admin-alert ${operation.status === "failed" ? "error" : "success"}`} role="status">
          <strong>{operation.message || `Operation ${operation.status}.`}</strong>
          {operation.action === "publish-jobs" && operation.status === "completed" && (
            <span> {formatCount(operation.pagesCreated)} pages created.</span>
          )}
        </div>
      )}
    </section>
  );
}
