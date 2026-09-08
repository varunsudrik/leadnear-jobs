"use client";

import { useState, useEffect } from "react";

const API = "/jobs/api/backoffice/blocked-ips";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function BlockedIpsPanel({ initialIps = [] }) {
  const [ips, setIps] = useState(initialIps);
  const [statusFilter, setStatusFilter] = useState("blocked");
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchIps = async (status) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}?status=${encodeURIComponent(status)}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not read blocked IPs.");
      setIps(result.ips || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIps(statusFilter);
    
    // Auto-refresh list every 30 seconds
    const interval = setInterval(() => {
      fetchIps(statusFilter);
    }, 30000);

    return () => clearInterval(interval);
  }, [statusFilter]);

  async function handleUnblock(id, ipAddress) {
    if (!window.confirm(`Are you sure you want to unblock IP ${ipAddress}?`)) {
      return;
    }
    
    setError("");
    setSuccess("");
    setProcessingId(id);

    try {
      const response = await fetch(API, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not unblock the IP.");
      
      setSuccess(`Successfully unblocked IP ${ipAddress}`);
      // Refresh current tab list
      fetchIps(statusFilter);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <section className="admin-operations blocked-ips-section">
      <div className="admin-blocked-ips-tabs">
        <button
          className={`admin-tab-btn ${statusFilter === "blocked" ? "active" : ""}`}
          onClick={() => setStatusFilter("blocked")}
        >
          🔴 Blocked
        </button>
        <button
          className={`admin-tab-btn ${statusFilter === "expired" ? "active" : ""}`}
          onClick={() => setStatusFilter("expired")}
        >
          🟡 Expired
        </button>
        <button
          className={`admin-tab-btn ${statusFilter === "unblocked" ? "active" : ""}`}
          onClick={() => setStatusFilter("unblocked")}
        >
          ⚪ Unblocked
        </button>
        <button
          className={`admin-tab-btn ${statusFilter === "all" ? "active" : ""}`}
          onClick={() => setStatusFilter("all")}
        >
          🔍 All History
        </button>
      </div>

      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {success && <div className="admin-alert success" role="status">{success}</div>}

      <div className="admin-operation-card blocked-ips-table-card">
        {loading && ips.length === 0 ? (
          <div className="admin-ips-loading">Loading blocked IPs history...</div>
        ) : ips.length === 0 ? (
          <div className="admin-ips-empty">No IP address records found matching this status.</div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-blocked-table">
              <thead>
                <tr>
                  <th>IP Address</th>
                  <th>Req Count</th>
                  <th>Blocked At</th>
                  <th>Expires At</th>
                  <th>Status</th>
                  <th>Info</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {ips.map((item) => (
                  <tr key={item.id}>
                    <td className="ip-address-cell">
                      <strong>{item.ip_address}</strong>
                    </td>
                    <td>
                      <span className="req-count-badge">{item.request_count}</span>
                    </td>
                    <td>{formatDate(item.blocked_at)}</td>
                    <td>{item.status === "blocked" ? formatDate(item.expires_at) : "-"}</td>
                    <td>
                      <span className={`admin-blocked-status ${item.status}`}>
                        {item.status === "blocked" ? "blocked" : item.status === "expired" ? "expired" : "unblocked"}
                      </span>
                    </td>
                    <td className="details-cell">
                      <div className="ua-info" title={item.user_agent}>
                        <strong>UA:</strong> {item.user_agent ? (item.user_agent.length > 50 ? item.user_agent.substring(0, 50) + "..." : item.user_agent) : "Unknown"}
                      </div>
                      {item.sample_paths && item.sample_paths.length > 0 && (
                        <div className="sample-paths">
                          <strong>Paths:</strong> {item.sample_paths.slice(0, 3).join(", ")}
                          {item.sample_paths.length > 3 ? "..." : ""}
                        </div>
                      )}
                    </td>
                    <td>
                      {item.status === "blocked" ? (
                        <button
                          className="admin-unblock-btn"
                          disabled={processingId === item.id}
                          onClick={() => handleUnblock(item.id, item.ip_address)}
                        >
                          {processingId === item.id ? "Unblocking..." : "Unblock"}
                        </button>
                      ) : (
                        <span className="by-info">
                          By: {item.unblocked_by || "system"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
