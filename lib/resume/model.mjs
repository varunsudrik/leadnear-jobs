// One place for the model choice and its request parameters, so switching
// models is a one-line change (spec D6/D7) and every caller stays consistent.
//
// Measured against the Task 10 eval fixtures on 2026-09-19, 5 runs each:
//
//   deepseek-v4-flash   3/5 valid, 2/5 schema-invalid, avg 29.6s
//   gpt-5-mini          5/5 valid, 0/5 schema-invalid, avg  6.5s
//
// deepseek is ~9x cheaper per token ($0.36 vs $3.30 per 1,000 scans) and,
// unlike gpt-5-mini, honours `temperature` — both were the original reasons
// to pick it. The measurement overrode them: a 40% schema-invalid rate is a
// 502 for two users in five, and 29.6s blows through the "10 to 20 seconds"
// the scanning screen promises and approaches the route's 60s maxDuration.
//
// What we give up is run-to-run score stability: gpt-5-mini ignores
// `temperature`, and the same resume measured 72 / 70 / 66 across three runs
// because it returned 7, then 6, then 5 skills and the Keywords subscore is
// linear in that count. That is far less visible than it sounds — a scan is
// stored and rendered from storage, so a second score requires re-uploading,
// which costs one of three free scans. A failed scan, by contrast, is visible
// immediately and to everyone.
//
// Set RESUME_MODEL to switch back without a code change.
export const MODEL = process.env.RESUME_MODEL || "openai/gpt-5-mini";

// Still sent on every request. gpt-5-mini ignores it (see above); a model
// that honours it, such as any of the deepseek line, gets temperature 0 plus
// this seed and is reproducible.
export const SEED = 1729;

// Reasoning tokens bill at the completion rate. Left unpinned they multiply
// output cost several-fold for a task that is mostly extraction.
export const REASONING_EFFORT = "low";
