// HTTP contract test for the live-count API: unlike the other *:test suites, which are
// pure, this needs the dev server running (`npm run dev`, port 4100). Pass a
// different origin as the first argument to test another server.
const base = (process.argv[2] || "http://127.0.0.1:4100").replace(/\/$/, "");
const response = await fetch(`${base}/jobs/api/live-count`, { cache: "no-store" });

if (!response.ok) throw new Error(`Live count endpoint returned HTTP ${response.status}`);

const body = await response.json();
for (const key of ["totalJobs", "remoteJobs", "highSalaryJobs", "companiesHiring"]) {
  if (!Number.isFinite(body[key]) || body[key] < 0) {
    throw new Error(`Live count response must include a non-negative numeric ${key}`);
  }
}
if (body.updatedAt !== null && typeof body.updatedAt !== "string") {
  throw new Error("Live count response must include an ISO updatedAt value or null");
}
if (typeof body.fetchedAt !== "string" || !Number.isFinite(new Date(body.fetchedAt).getTime())) {
  throw new Error("Live count response must include an ISO fetchedAt value");
}

console.log("Live count contract checks passed.");
