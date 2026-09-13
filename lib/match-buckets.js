// Turns a cohort of real jobs into the three buckets the Matches screen draws.
//
// Pure on purpose: no database, no React, no environment. The tier comes from
// the same fitFor() hash components/JobCard.jsx uses, so a job's bucket here
// always agrees with its badge on the home page.
import { fitFor, whyFor } from "./demo-fit.js";

export function bucketJobs(jobs) {
  const strong = [];
  const good = [];
  const low = [];
  const byTier = { strong, good, low };

  for (const job of jobs ?? []) {
    const tier = fitFor(job.job_slug);
    // No tier means no slug to hash, or the demo layer is off. Drop the row
    // rather than defaulting it into Low — an invented "low fit" reads as a
    // judgement of the job.
    if (!tier) continue;
    byTier[tier].push({ ...job, tier, why: whyFor(tier) });
  }

  return {
    strong,
    good,
    low,
    counts: { strong: strong.length, good: good.length, low: low.length,
              total: strong.length + good.length + low.length },
  };
}
