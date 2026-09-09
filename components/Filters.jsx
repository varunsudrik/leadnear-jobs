"use client";
import { useCallback, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import LiveJobCount from "@/app/LiveJobCount";

const EMP_TYPES  = ["Full-time","Part-time","Contract","Internship","Freelance"];
const SALARY_OPTS = [
  { label:"Any salary", value:"" },
  { label:"$50K+",  value:"50000"  },
  { label:"$100K+", value:"100000" },
  { label:"$150K+", value:"150000" },
  { label:"$200K+", value:"200000" },
];
const DAYS_OPTS = [
  { label:"Any time",    value:"" },
  { label:"Last 24h",    value:"1" },
  { label:"Last 7 days", value:"7" },
  { label:"Last 30 days",value:"30" },
];
// Full set of real category_slugs values in the seeded DB (all ten have
// non-zero job counts), ordered by job count desc. The Direction C spec
// (spec lines 76-85) only mock-listed seven of these; the other three —
// operations-jobs (148, the single largest category), customer-success-jobs
// (66), and people-hr-jobs (26) — are real categories the filter must cover.
// Labels keep the design's abbreviated tone ("Software Eng", "DevOps/Cloud").
const CATEGORIES = [
  { slug:"operations-jobs",           label:"Operations" },
  { slug:"software-engineering-jobs", label:"Software Eng" },
  { slug:"sales-jobs",                label:"Sales" },
  { slug:"customer-success-jobs",     label:"Customer Success" },
  { slug:"data-ai-jobs",              label:"Data & AI" },
  { slug:"product-jobs",              label:"Product" },
  { slug:"marketing-jobs",            label:"Marketing" },
  { slug:"people-hr-jobs",            label:"People & HR" },
  { slug:"devops-cloud-jobs",         label:"DevOps/Cloud" },
  { slug:"design-jobs",               label:"Design" },
];
const SORTS = ["newest", "salary"];

// "12 min ago" / "3 hrs ago" — matches the spec's count-line wording
// (spec lines 76-85: "128,431 roles · updated 12 min ago").
function formatUpdated(updatedAt) {
  if (!updatedAt) return null;
  const ms = Date.now() - new Date(updatedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function Filters({ initialCount = 0 }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [updatedAt, setUpdatedAt] = useState(null);

  const get = (k) => sp.get(k) || "";
  const set = (k, v) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v); else next.delete(k);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  };

  const remote = get("remote"), type = get("type"), salary_min = get("salary_min");
  const category = get("category"), days = get("days");
  const rawSort = get("sort");
  const sort = SORTS.includes(rawSort) ? rawSort : "newest";
  const hasFilters = remote || type || salary_min || category || days || get("ats") || get("location") || rawSort;

  const clearAll = () => {
    const next = new URLSearchParams(sp.toString());
    ["ats","location","remote","type","salary_min","category","days","page","sort"].forEach((k) => next.delete(k));
    router.push(`${pathname}?${next.toString()}`);
  };

  // LiveJobCount already owns the fetch/poll cycle for /api/live-count; this
  // just reads updatedAt off its snapshots instead of firing a second fetch.
  const handleSnapshot = useCallback((body) => {
    if (body?.updatedAt) setUpdatedAt(body.updatedAt);
  }, []);

  const updatedLabel = formatUpdated(updatedAt);

  return (
    <div className="filter-bar">
      <span className="filter-count">
        <b><LiveJobCount initialCount={initialCount} onSnapshot={handleSnapshot} /></b> roles
        {updatedLabel ? ` · updated ${updatedLabel}` : ""}
      </span>
      <button type="button" className="filter-toggle" aria-pressed={remote === "1"}
        onClick={() => set("remote", remote === "1" ? "" : "1")}>
        Remote
      </button>
      <select className="filter-select" value={type} onChange={(e) => set("type", e.target.value)}>
        <option value="">Any type</option>
        {EMP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select className="filter-select" value={salary_min} onChange={(e) => set("salary_min", e.target.value)}>
        {SALARY_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className="filter-select" value={category} onChange={(e) => set("category", e.target.value)}>
        <option value="">All categories</option>
        {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
      </select>
      <select className="filter-select" value={days} onChange={(e) => set("days", e.target.value)}>
        {DAYS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hasFilters && <button type="button" className="filter-clear" onClick={clearAll}>Clear</button>}
      <span className="filter-spacer" />
      <select className="sort-select" value={sort}
        onChange={(e) => set("sort", e.target.value === "newest" ? "" : e.target.value)}>
        <option value="newest">Sort: newest</option>
        <option value="salary">Sort: salary</option>
        {/* Requires the matching subsystem; shipping it enabled would silently
            fall back to another order and look like a bug. */}
        <option value="fit" disabled title="Available once you scan a resume">Sort: best fit</option>
      </select>
    </div>
  );
}
