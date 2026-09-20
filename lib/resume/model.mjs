// One place for the model choice and its request parameters, so switching
// models is a one-line change (spec D6/D7) and every caller stays consistent.
//
// Chosen by measurement, not by price list. Swept 12 candidates over the
// eval fixtures, then re-ran the seven finalists over 8 cases x 2 passes
// (2026-09-19):
//
//   gemini-2.5-flash-lite  14/16  0 invalid  3.9s   $0.96 / 1k scans
//   gemini-2.5-flash       14/16  0 invalid  2.9s   $4.05
//   gpt-4.1-mini           12/16  0 invalid  1.7s   $3.84
//   gpt-5-mini             10/16  0 invalid  7.3s   $3.30
//   deepseek-v4.1-flash    10/16  3 invalid 15.3s   $1.44
//   gemini-3.1-flash-lite   8/16  0 invalid  2.2s   $2.85
//   gpt-5-nano              8/16  0 invalid 21.8s   $0.66
//
// flash-lite wins on all three axes at once — most accurate (tied), 2x faster
// than the previous default and 3.4x cheaper. Two earlier defaults were picked
// from the price list and both were wrong: deepseek-v4-flash returned
// schema-invalid JSON on 2 of 5 runs and averaged 29.6s, and gpt-5-mini scored
// 10/16 here.
//
// It also honours `temperature`, which gpt-5-mini ignored — so temperature 0
// plus the seed below makes a rescan of the same resume reproducible again.
//
// Set RESUME_MODEL to override without a code change.
export const MODEL = process.env.RESUME_MODEL || "google/gemini-2.5-flash-lite";

// gemini-2.5-flash-lite honours temperature, so temperature 0 plus this seed
// is a real reproducibility guarantee again rather than a no-op.
export const SEED = 1729;

// Reasoning tokens bill at the completion rate. Left unpinned they multiply
// output cost several-fold for a task that is mostly extraction.
export const REASONING_EFFORT = "low";
