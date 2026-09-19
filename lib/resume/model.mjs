// One place for the model choice and its request parameters, so switching
// models is a one-line change (spec D6/D7) and every caller stays consistent.
//
// deepseek-v4-flash: $0.046/M in, $0.093/M out, about $0.36 per 1,000 scans,
// roughly 9x cheaper than gpt-5-mini. Unlike gpt-5-mini it accepts
// `temperature`, which is what makes rescanning the same resume reproducible.
export const MODEL = process.env.RESUME_MODEL || "deepseek/deepseek-v4-flash";

// Scores must be reproducible: same resume in, same number out. temperature 0
// plus a fixed seed is the entire mechanism; there is no other determinism.
export const SEED = 1729;

// Reasoning tokens bill at the completion rate. Left unpinned they multiply
// output cost several-fold for a task that is mostly extraction.
export const REASONING_EFFORT = "low";
