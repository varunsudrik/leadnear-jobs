"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const EMP_TYPES  = ["Full-Time","Part-Time","Contract","Internship","Freelance"];
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
const CATEGORIES = [
  { slug:"software-engineering-jobs", label:"Software Eng" },
  { slug:"devops-cloud-jobs",         label:"DevOps/Cloud" },
  { slug:"data-ai-jobs",              label:"Data & AI" },
  { slug:"product-jobs",              label:"Product" },
  { slug:"design-jobs",               label:"Design" },
  { slug:"sales-jobs",                label:"Sales" },
  { slug:"customer-success-jobs",     label:"CS" },
  { slug:"marketing-jobs",            label:"Marketing" },
  { slug:"operations-jobs",           label:"Operations" },
  { slug:"people-hr-jobs",            label:"HR" },
];

export default function Filters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const get = (k) => sp.get(k) || "";
  const set = (k, v) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v); else next.delete(k);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  };

  const remote = get("remote"), type = get("type"), salary_min = get("salary_min");
  const category = get("category"), days = get("days");
  const hasFilters = remote || type || salary_min || category || days || get("ats") || get("location");

  const clearAll = () => {
    const next = new URLSearchParams(sp.toString());
    ["ats","location","remote","type","salary_min","category","days","page"].forEach((k) => next.delete(k));
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="filters-strip">
      <span className="filter-label">Filter:</span>
      <button className={`filter-toggle${remote === "1" ? " active" : ""}`}
        onClick={() => set("remote", remote === "1" ? "" : "1")}>
        🌍 Remote
      </button>
      <select className="filter-select" value={type} onChange={(e) => set("type", e.target.value)}>
        <option value="">All types</option>
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
      {hasFilters && <button className="filter-clear" onClick={clearAll}>✕ Clear</button>}
    </div>
  );
}
