// lib/format.js — Pure formatting utilities, safe to import from both client and server

export function fmtSalary(job) {
  const mn  = job?.salary_min;
  const mx  = job?.salary_max;
  const cur = job?.salary_currency || "USD";
  const per = (job?.salary_period || "year").toLowerCase();
  if (!mn && !mx) return null;
  const f = (n) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n)));
  const suffix = { year:"/yr", annual:"/yr", month:"/mo", hour:"/hr" }[per] ?? "";
  if (mn && mx) return `${cur} ${f(mn)}–${f(mx)}${suffix}`;
  if (mn) return `${cur} ${f(mn)}+${suffix}`;
  return `up to ${cur} ${f(mx)}${suffix}`;
}

export function fmtDate(raw) {
  if (!raw) return "";
  try { return new Date(raw).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return ""; }
}

export function initials(name = "") {
  const w = name.replace(/[^a-zA-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  return (name.slice(0, 2) || "JB").toUpperCase();
}

export function titleSlug(canon = "") {
  return canon.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-jobs";
}
