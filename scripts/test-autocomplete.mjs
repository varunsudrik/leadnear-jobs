// HTTP contract test for the autocomplete API: unlike the other *:test suites, which are
// pure, this needs the dev server running (`npm run dev`, port 4100). Pass a
// different origin as the first argument to test another server.
const base = (process.argv[2] || "http://127.0.0.1:4100").replace(/\/$/, "");

async function suggestions(q, kind) {
  const response = await fetch(`${base}/jobs/api/autocomplete?q=${encodeURIComponent(q)}&kind=${kind}`);
  if (!response.ok) throw new Error(`${kind}/${q} returned HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.suggestions)) throw new Error("Response is missing suggestions[]");
  if (body.suggestions.length > 8) throw new Error("Response returned more than eight suggestions");
  return body.suggestions;
}

const short = await suggestions("s", "query");
if (short.length !== 0) throw new Error("One-character queries must return no suggestions");

const remote = await suggestions("re", "location");
if (!remote.some((item) => item.value === "Remote" && item.type === "remote")) {
  throw new Error("Location autocomplete must include Remote for 're'");
}

for (const item of await suggestions("so", "query")) {
  if (!item.value || !["title", "skill", "company"].includes(item.type)) {
    throw new Error("Query suggestions must be typed title, skill, or company values");
  }
}

console.log("Autocomplete contract checks passed.");
