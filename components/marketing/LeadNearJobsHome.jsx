"use client";

// Ported from leadnear-main/lib/components/jobs/LeadNearJobsHome.jsx.
// Changes: next/router -> next/navigation, and every Link/router path lost its
// "/jobs" prefix because next.config.mjs basePath already adds it. fetch() URLs
// keep the prefix -- basePath is not applied to fetch.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bookmark,
  BriefcaseBusiness,
  Building2,
  Check,
  CircleDollarSign,
  Clock3,
  Globe2,
  MapPin,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import AutocompleteInput from "@/components/marketing/AutocompleteInput";

const SAVED_JOBS_KEY = "leadnear:saved-jobs:v1";

const popularFilters = [
  ["Remote Jobs", "/remote"],
  ["$100K+ Jobs", "/salary/100k-plus"],
  ["Tech Jobs", "/category/software-engineering-jobs"],
  ["AI Jobs", "/title/ai-engineer-jobs"],
  ["Startup Jobs", "/search?q=startup"],
  ["Entry Level Jobs", "/search?q=entry+level"],
  ["Executive Jobs", "/search?q=executive"],
  ["Internship Jobs", "/search?type=internship"],
];

const categoryGroups = [
  { title: "Technology", icon: BriefcaseBusiness, links: [["Software Engineering", "software-engineering-jobs"], ["DevOps", "devops-cloud-jobs"], ["Cloud", "devops-cloud-jobs"], ["Cybersecurity", "software-engineering-jobs"]] },
  { title: "Data & AI", icon: Sparkles, links: [["Machine Learning", "data-ai-jobs"], ["Data Science", "data-ai-jobs"], ["Analytics", "data-ai-jobs"]] },
  { title: "Product", icon: BarChart3, links: [["Product Manager", "product-jobs"], ["Product Designer", "design-jobs"]] },
  { title: "Business", icon: Users, links: [["Sales", "sales-jobs"], ["Marketing", "marketing-jobs"], ["Customer Success", "customer-success-jobs"]] },
  { title: "Operations", icon: Building2, links: [["HR", "people-hr-jobs"], ["Finance", "operations-jobs"], ["Operations", "operations-jobs"]] },
];

const countryFallbacks = [
  ["United States", "united-states", "US"], ["United Kingdom", "united-kingdom", "GB"], ["India", "india", "IN"],
  ["Canada", "canada", "CA"], ["Germany", "germany", "DE"], ["Australia", "australia", "AU"],
];
const cityFallbacks = [["New York", "new-york"], ["San Francisco", "san-francisco"], ["London", "london"], ["Bangalore", "bangalore"], ["Toronto", "toronto"]];
const titleFallbacks = ["Software Engineer", "Product Manager", "Data Scientist", "Account Executive", "Marketing Manager", "Operations Manager"];

function formatCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${number.toLocaleString()}+` : "—";
}

function formatAnimatedCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? `${number.toLocaleString()}+` : "—";
}

const LIVE_COUNT_MIN_POLL_INTERVAL_MS = 4_000;
const LIVE_COUNT_MAX_POLL_INTERVAL_MS = 9_000;
const LIVE_COUNT_ANIMATION_DURATION_MS = 1_500;
const STATUS_CLOCK_INTERVAL_MS = 1_000;

function formatLastUpdated(updatedAt, now) {
  const timestamp = new Date(updatedAt || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "Last updated recently";

  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (elapsedSeconds < 1) return "Last updated just now";
  if (elapsedSeconds < 60) return `Last updated ${elapsedSeconds}s ago`;

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `Last updated ${elapsedMinutes} min${elapsedMinutes === 1 ? "" : "s"} ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `Last updated ${elapsedHours} hr${elapsedHours === 1 ? "" : "s"} ago`;
}

function LiveMetricsStatus({ updatedAt }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), STATUS_CLOCK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [updatedAt]);

  return (
    <p className="mx-auto mt-3 flex w-fit items-center gap-1.5 text-xs font-medium text-slate-500">
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
      <span>{formatLastUpdated(updatedAt, now)}</span>
      <span aria-hidden="true" className="text-slate-300">·</span>
      <span className="text-slate-500">Updating in real time</span>
    </p>
  );
}

function AnimatedMetric({ value, refreshId, showRefreshTick = false }) {
  const [displayedCount, setDisplayedCount] = useState(value);
  const displayedCountRef = useRef(value);
  const animationFrameRef = useRef(null);
  const reducedMotionRef = useRef(false);
  const lastBackendValueRef = useRef(value);

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const setCountImmediately = useCallback((count) => {
    displayedCountRef.current = count;
    setDisplayedCount(count);
  }, []);

  const animateTo = useCallback((nextCount, duration = LIVE_COUNT_ANIMATION_DURATION_MS) => {
    const startCount = displayedCountRef.current;

    if (nextCount <= startCount || reducedMotionRef.current) {
      stopAnimation();
      setCountImmediately(nextCount);
      return;
    }

    stopAnimation();
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const easedProgress = 1 - (1 - progress) ** 3;
      setCountImmediately(Math.round(startCount + (nextCount - startCount) * easedProgress));

      if (progress < 1) animationFrameRef.current = requestAnimationFrame(tick);
      else animationFrameRef.current = null;
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, [setCountImmediately, stopAnimation]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => { reducedMotionRef.current = mediaQuery.matches; };
    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => {
      mediaQuery.removeEventListener("change", updateMotionPreference);
      stopAnimation();
    };
  }, [stopAnimation]);

  useEffect(() => {
    if (refreshId === 0) {
      lastBackendValueRef.current = value;
      animateTo(value);
      return;
    }

    if (!showRefreshTick) {
      lastBackendValueRef.current = value;
      animateTo(value);
      return;
    }

    const previousBackendValue = lastBackendValueRef.current;
    lastBackendValueRef.current = value;

    if (value !== previousBackendValue) {
      animateTo(value);
      return;
    }

    const maximumIncrement = Math.min(8, Math.max(2, value * 0.000005));
    const increment = Math.max(1, Math.ceil(Math.random() * maximumIncrement));
    animateTo(Math.max(value, displayedCountRef.current) + increment, 350);
    return stopAnimation;
  }, [animateTo, refreshId, showRefreshTick, stopAnimation, value]);

  return <span className="tabular-nums">{formatAnimatedCount(displayedCount)}</span>;
}

function useLiveJobMetrics(initialMetrics, initialUpdatedAt) {
  const [snapshot, setSnapshot] = useState({ metrics: initialMetrics, updatedAt: initialUpdatedAt, refreshId: 0 });

  useEffect(() => {
    let cancelled = false;
    const refreshMetrics = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/jobs/api/live-count", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (cancelled) return;

        setSnapshot((current) => ({
          refreshId: current.refreshId + 1,
          updatedAt: typeof body.fetchedAt === "string" ? body.fetchedAt : current.updatedAt,
          metrics: Object.fromEntries(Object.entries(current.metrics).map(([key, value]) => {
            const nextValue = Number(body[key]);
            return [key, Number.isFinite(nextValue) ? nextValue : value];
          })),
        }));
      } catch {
        // Keep the last known metrics until the next refresh succeeds.
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshMetrics();
    };
    const scheduleNextRefresh = () => {
      const delay = LIVE_COUNT_MIN_POLL_INTERVAL_MS
        + Math.round(Math.random() * (LIVE_COUNT_MAX_POLL_INTERVAL_MS - LIVE_COUNT_MIN_POLL_INTERVAL_MS));
      refreshTimeout = window.setTimeout(async () => {
        await refreshMetrics();
        scheduleNextRefresh();
      }, delay);
    };

    let refreshTimeout;
    refreshMetrics();
    scheduleNextRefresh();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return snapshot;
}

function formatSalary(job) {
  if (!job?.salary_min && !job?.salary_max) return "Salary not disclosed";
  const currency = job.salary_currency || "USD";
  const compact = (value) => Number(value) >= 1000 ? `${Math.round(Number(value) / 1000)}K` : Number(value).toLocaleString();
  if (job.salary_min && job.salary_max) return `${currency} ${compact(job.salary_min)}–${compact(job.salary_max)}`;
  return `${currency} ${compact(job.salary_min || job.salary_max)}+`;
}

function formatDate(value) {
  if (!value) return "Recently posted";
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `Posted ${Math.max(1, hours)} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Posted ${days} day${days === 1 ? "" : "s"} ago`;
}

function jobHref(job) {
  if (job.url?.startsWith("/")) return job.url;
  if (job.job_slug) return `/${job.job_slug}`;
  if (job.db_id) return `/job/${job.db_id}`;
  return "/";
}

function initials(name = "") {
  const words = name.replace(/[^a-zA-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : name.slice(0, 2) || "LN").toUpperCase();
}

function slugifyTitle(title) {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-jobs`;
}

function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>}
        <h2 className="!text-left text-3xl font-extrabold tracking-tight text-ink md:text-4xl">{title}</h2>
        {description && <p className="mt-3 max-w-2xl text-base text-slate-600 md:text-lg">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function JobCard({ job, saved, onToggleSave }) {
  const locations = Array.isArray(job.locations) ? job.locations : [];
  const isRemote = job.remote === true || job.remote === 1 || job.remote === "1" || job.remote === "true";
  const location = locations.length ? locations.slice(0, 2).map((item) => String(item).replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())).join(", ") : isRemote ? "Remote" : "Location flexible";
  const jobId = String(job.job_slug || job.db_id || job.apply_url_md5 || job.title);

  return (
    <article className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-950/5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-indigo-500 text-xs font-extrabold text-white">{initials(job.company)}</div>
        <div className="min-w-0 flex-1">
          <Link href={jobHref(job)} className="line-clamp-2 text-base font-bold text-ink transition group-hover:text-accent">{job.title}</Link>
          <p className="mt-1 truncate text-sm font-semibold text-slate-600">{job.company}</p>
        </div>
        <button type="button" onClick={() => onToggleSave(jobId)} aria-label={saved ? `Remove ${job.title} from saved jobs` : `Save ${job.title}`} aria-pressed={saved} className={`rounded-lg border p-1.5 transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${saved ? "border-blue-200 bg-accent-tint text-accent" : "border-slate-200 text-slate-500 hover:border-blue-200 hover:text-accent"}`}>
          <Bookmark className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5 text-xs font-semibold">
        {isRemote && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Remote</span>}
        {job.employment_type && <span className="rounded-full bg-accent-tint px-2.5 py-1 capitalize text-accent">{String(job.employment_type).replace(/[-_]/g, " ")}</span>}
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{formatSalary(job)}</span>
      </div>

      {Array.isArray(job.tags) && job.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {job.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{tag}</span>)}
        </div>
      )}

      <div className="mt-auto pt-4">
        <div className="flex items-center gap-2 text-sm text-slate-500"><MapPin className="h-4 w-4" /><span className="truncate">{location}</span></div>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-500"><Clock3 className="h-4 w-4" /><span>{formatDate(job.posted_at)}</span></div>
        <Link href={jobHref(job)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-blue-500">
          View & Apply <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export default function LeadNearJobsHome({ data }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [savedJobs, setSavedJobs] = useState([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_JOBS_KEY) || "[]");
      if (Array.isArray(saved)) setSavedJobs(saved.map(String));
    } catch {}
  }, []);

  const toggleSave = (jobId) => {
    setSavedJobs((current) => {
      const next = current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId];
      localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleSearch = (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (location.trim().toLowerCase() === "remote") params.set("remote", "1");
    else if (location.trim()) params.set("location", location.trim());
    router.push(`/search${params.toString() ? `?${params}` : ""}`);
  };

  const totals = data.totals || {};
  const liveMetricSnapshot = useLiveJobMetrics(
    {
      totalJobs: Number(totals.totalJobs ?? totals.total_jobs) || 0,
      remoteJobs: Number(totals.remoteJobs ?? totals.total_remote) || 0,
      highSalaryJobs: Number(totals.highSalaryJobs ?? totals.total_100k_plus) || 0,
      companiesHiring: Number(totals.companiesHiring ?? totals.total_companies) || 0,
    },
    null
  );
  const liveMetrics = liveMetricSnapshot.metrics;
  const stats = [
    [<AnimatedMetric key="live-jobs" value={liveMetrics.totalJobs} refreshId={liveMetricSnapshot.refreshId} showRefreshTick />, "Jobs", BriefcaseBusiness],
    [<AnimatedMetric key="live-remote-jobs" value={liveMetrics.remoteJobs} refreshId={liveMetricSnapshot.refreshId} />, "Remote jobs", Globe2],
    [<AnimatedMetric key="live-high-salary-jobs" value={liveMetrics.highSalaryJobs} refreshId={liveMetricSnapshot.refreshId} />, "High salary jobs", CircleDollarSign],
    [<AnimatedMetric key="live-companies-hiring" value={liveMetrics.companiesHiring} refreshId={liveMetricSnapshot.refreshId} />, "Companies hiring", Building2],
  ];
  const remoteRoles = data.remoteRoles?.length ? data.remoteRoles.slice(0, 5) : titleFallbacks.slice(0, 5).map((canonical_title) => ({ canonical_title }));
  const countries = useMemo(() => countryFallbacks.map(([label, slug, code]) => data.countries?.find((item) => item.country_slug === slug) || { country_label: label, country_slug: slug, country_code: code }), [data.countries]);
  const locations = cityFallbacks.map(([label, slug]) => data.topLocations?.find((item) => item.location_slug === slug) || { label, location_slug: slug });
  const titles = data.topTitles?.length ? data.topTitles.slice(0, 6) : titleFallbacks.map((canonical_title) => ({ canonical_title }));

  return (
    <div className="marketing-page bg-white text-slate-900">
      <section className="relative overflow-hidden border-b border-blue-100 bg-gradient-to-br from-white via-accent-tint/70 to-indigo-100/70 py-16 md:py-24">
        <div aria-hidden="true" className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-blue-300/20 blur-3xl" />
        <div aria-hidden="true" className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="tailwind-container relative mx-auto px-5 sm:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-accent shadow-sm"><Sparkles className="h-4 w-4" /> Opportunities from companies worldwide</span>
            <h1 className="mt-7 text-4xl font-black tracking-tight text-ink sm:text-5xl md:text-7xl">Find Your <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">Dream Job</span></h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-600 md:text-xl">Search millions of jobs from thousands of companies worldwide. Discover remote roles, high-paying opportunities, and jobs matching your skills.</p>
          </div>

          <form onSubmit={handleSearch} role="search" className="mx-auto mt-10 grid max-w-5xl gap-3 rounded-2xl border border-white bg-white p-3 shadow-2xl shadow-blue-950/10 md:grid-cols-[1fr_0.7fr_auto]">
            <label className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 px-4 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"><Search className="h-5 w-5 shrink-0 text-accent" /><span className="sr-only">Job title, keyword, skill, or company</span><AutocompleteInput value={query} onChange={setQuery} kind="query" label="Job title, keyword, skill, or company" placeholder="Job title, skill, or company" /></label>
            <label className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 px-4 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"><MapPin className="h-5 w-5 shrink-0 text-accent" /><span className="sr-only">Location or remote</span><AutocompleteInput value={location} onChange={setLocation} kind="location" label="Location or remote" placeholder="Location or Remote" /></label>
            <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-hover px-7 py-4 font-bold text-white shadow-lg shadow-accent/20 transition hover:from-accent-hover hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Search Jobs <ArrowRight className="h-4 w-4" /></button>
          </form>

          <div className="mx-auto mt-8 grid max-w-5xl grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map(([value, label, Icon]) => <div key={label} className="rounded-xl border border-blue-100 bg-white/80 p-4 text-center shadow-sm backdrop-blur"><Icon className="mx-auto h-5 w-5 text-accent" /><p className="mt-2 text-2xl font-black text-ink">{value}</p><p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p></div>)}
          </div>

          <LiveMetricsStatus updatedAt={liveMetricSnapshot.updatedAt} />

          {data.unavailable && <p role="status" className="mx-auto mt-5 max-w-2xl text-center text-sm text-slate-500">Live job totals are temporarily unavailable. Search and browse links remain available.</p>}
        </div>
      </section>

      <section className="border-b border-slate-100 py-8"><div className="tailwind-container mx-auto px-5 sm:px-8"><p className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">Popular searches</p><div className="flex flex-wrap gap-2">{popularFilters.map(([label, href]) => <Link key={label} href={href} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-accent-tint hover:text-accent">{label}</Link>)}</div></div></section>

      <section className="py-16 md:py-24"><div className="tailwind-container mx-auto px-5 sm:px-8"><SectionHeading eyebrow="Explore careers" title="Featured job categories" description="Move quickly from broad interests to the roles companies are hiring for now." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{categoryGroups.map(({ title, icon: Icon, links }) => <div key={title} className="rounded-2xl border border-slate-200 p-5 transition hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/5"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-tint text-accent"><Icon className="h-5 w-5" /></div><h3 className="mt-4 text-lg font-extrabold text-ink">{title}</h3><ul className="mt-4 space-y-2">{links.map(([label, slug]) => <li key={`${title}-${label}`}><Link href={`/category/${slug}`} className="text-sm font-medium text-slate-600 hover:text-accent">{label}</Link></li>)}</ul></div>)}</div></div></section>

      <section className="bg-ink py-16 text-white md:py-24"><div className="tailwind-container mx-auto grid gap-10 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">Work from anywhere</p><h2 className="mt-3 !text-left text-3xl font-black text-white md:text-5xl">Remote Jobs Worldwide</h2><p className="mt-5 text-lg leading-8 text-slate-300">Work from anywhere with thousands of remote opportunities.</p><p className="mt-8 text-4xl font-black">{formatCount(totals.remoteJobs ?? totals.total_remote)}</p><p className="mt-1 text-sm font-semibold text-slate-400">open remote positions</p><Link href="/remote" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-ink transition hover:bg-accent-tint">Browse Remote Jobs <ArrowRight className="h-4 w-4" /></Link></div><div className="grid gap-3 sm:grid-cols-2">{remoteRoles.map((role) => { const title = role.canonical_title || role.title; return <Link key={title} href={`/title/${slugifyTitle(title)}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-blue-400/40 hover:bg-white/10"><span className="font-bold">{title}</span>{role.job_count && <span className="text-sm text-blue-200">{Number(role.job_count).toLocaleString()}</span>}</Link>; })}</div></div></section>

      <section className="py-16 md:py-24"><div className="tailwind-container mx-auto px-5 sm:px-8"><SectionHeading eyebrow="Salary transparency" title="Find high-paying opportunities" description="Discover roles with transparent salary information." /><div className="grid gap-4 md:grid-cols-3">{[["100k-plus", "$100K+ Jobs"], ["150k-plus", "$150K+ Jobs"], ["200k-plus", "$200K+ Jobs"]].map(([tier, label]) => <Link key={tier} href={`/salary/${tier}`} className="group rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-7 transition hover:-translate-y-1 hover:shadow-xl"><CircleDollarSign className="h-8 w-8 text-amber-600" /><h3 className="mt-5 text-2xl font-black text-ink">{label}</h3><p className="mt-2 text-slate-600">Browse opportunities with disclosed annual compensation.</p><span className="mt-6 inline-flex items-center gap-2 font-bold text-amber-700">Explore roles <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></Link>)}</div></div></section>

      <section className="border-y border-slate-100 bg-slate-50 py-16 md:py-24"><div className="tailwind-container mx-auto px-5 sm:px-8"><SectionHeading eyebrow="Fresh opportunities" title="Latest jobs" description="New roles from companies hiring worldwide." action={<Link href="/" className="inline-flex items-center gap-2 font-bold text-accent">View all jobs <ArrowRight className="h-4 w-4" /></Link>} />{data.latestJobs?.length ? <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{data.latestJobs.slice(0, 9).map((job) => { const id = String(job.job_slug || job.db_id || job.apply_url_md5 || job.title); return <JobCard key={id} job={job} saved={savedJobs.includes(id)} onToggleSave={toggleSave} />; })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><BriefcaseBusiness className="mx-auto h-9 w-9 text-slate-400" /><h3 className="mt-4 text-xl font-bold text-slate-900">Latest jobs are temporarily unavailable</h3><p className="mt-2 text-slate-600">Use job search to explore all available opportunities.</p><Link href="/" className="mt-5 inline-flex font-bold text-accent">Browse all jobs</Link></div>}</div></section>

      <section className="py-16 md:py-24"><div className="tailwind-container mx-auto px-5 sm:px-8"><SectionHeading eyebrow="Hiring now" title="Top hiring companies" description="Employers ranked by their current number of open roles." action={<Link href="/companies" className="inline-flex items-center gap-2 font-bold text-accent">All companies <ArrowRight className="h-4 w-4" /></Link>} /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(data.topCompanies || []).slice(0, 8).map((company) => <Link key={company.slug} href={`/company/${company.slug}`} className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 hover:shadow-lg"><div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-accent font-black text-white">{company.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- logos come from arbitrary third-party hosts; next/image would need every domain allow-listed, and these are 48px thumbnails
        <img src={company.logo_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
      ) : initials(company.name)}</div><div className="min-w-0"><h3 className="truncate font-extrabold text-ink">{company.name}</h3><p className="mt-1 text-sm text-slate-500">{Number(company.job_count || 0).toLocaleString()} openings</p></div></Link>)}</div></div></section>

      <section className="bg-accent-tint/70 py-16 md:py-24"><div className="tailwind-container mx-auto px-5 sm:px-8"><SectionHeading eyebrow="Global reach" title="Browse jobs by location" description="Find opportunities across leading countries and hiring hubs." /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{countries.map((country) => <Link key={country.country_slug} href={`/country/${country.country_slug}`} className="rounded-2xl border border-blue-100 bg-white p-5 transition hover:border-blue-300 hover:shadow-lg"><p className="text-xs font-black uppercase tracking-widest text-accent">{country.country_code || "Global"}</p><h3 className="mt-2 text-xl font-black text-ink">{country.country_label}</h3>{country.job_count && <p className="mt-2 text-sm text-slate-500">{Number(country.job_count).toLocaleString()} jobs</p>}</Link>)}</div><div className="mt-8 flex flex-wrap gap-3">{locations.map((item) => <Link key={item.location_slug} href={`/location/${item.location_slug}`} className="rounded-full border border-blue-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:text-accent">{item.label || item.location_slug.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())}</Link>)}</div></div></section>

      <section className="py-16 md:py-24"><div className="tailwind-container mx-auto grid gap-12 px-5 sm:px-8 lg:grid-cols-2"><div><SectionHeading eyebrow="Popular careers" title="Browse by job title" description="SEO-friendly career pages with live openings and related roles." /><div className="grid gap-3 sm:grid-cols-2">{titles.map((item) => { const title = item.canonical_title || item.title; return <Link key={title} href={`/title/${slugifyTitle(title)}`} className="flex items-center justify-between rounded-xl border border-slate-200 p-4 font-bold text-slate-800 transition hover:border-blue-300 hover:text-accent"><span>{title}</span><ArrowRight className="h-4 w-4" /></Link>; })}</div></div><div className="rounded-3xl bg-ink p-8 text-white md:p-10"><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">Why LeadNear Jobs</p><h2 className="mt-3 !text-left text-3xl font-black text-white">Everything you need to find your next role</h2><ul className="mt-8 grid gap-4 sm:grid-cols-2">{["Millions of job listings", "Advanced filters", "Remote opportunities", "Salary insights", "Company research", "Personalized discovery"].map((feature) => <li key={feature} className="flex items-center gap-3 text-slate-200"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500"><Check className="h-4 w-4" /></span>{feature}</li>)}</ul></div></div></section>

      <section className="border-t border-slate-100 py-16"><div className="tailwind-container mx-auto grid gap-5 px-5 sm:px-8 lg:grid-cols-2"><div className="rounded-3xl bg-gradient-to-br from-accent to-indigo-700 p-8 text-white md:p-10"><h2 className="!text-left text-3xl font-black text-white">Welcome back</h2><p className="mt-4 max-w-xl text-blue-100">Sign in to your existing LeadNear account using the same secure login you already know.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/signin" className="rounded-xl border border-white/30 px-5 py-3 font-bold text-white hover:bg-white/10">Login</Link></div></div><div className="rounded-3xl border border-slate-200 bg-white p-8 md:p-10"><h2 className="!text-left text-3xl font-black text-ink">Looking to hire?</h2><p className="mt-4 text-slate-600">Tell us about your hiring goals and our team will help you publish opportunities.</p><Link href="/contact-us?subject=Post%20a%20Job" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 font-bold text-white hover:bg-accent">Post Jobs <ArrowRight className="h-4 w-4" /></Link></div></div></section>
    </div>
  );
}
