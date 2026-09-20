// Ported from leadnear-main/pages/about.jsx (Pages Router -> App Router).
// <Head> becomes the metadata export; the markup is unchanged.
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Globe2, Search } from "lucide-react";

export const metadata = {
  title: "About LeadNear Jobs",
  description: "LeadNear Jobs helps people discover opportunities from companies worldwide.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main className="bg-white text-slate-900">
      <section className="border-b border-blue-100 bg-gradient-to-br from-white via-accent-tint to-indigo-100 py-20">
        <div className="tailwind-container mx-auto px-5 text-center sm:px-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-accent">About LeadNear Jobs</p>
          <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-black tracking-tight text-ink md:text-6xl">Helping people find their next opportunity</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">We bring jobs, salary information, remote opportunities, and company research together in one global discovery experience.</p>
        </div>
      </section>
      <section className="py-16">
        <div className="tailwind-container mx-auto grid gap-5 px-5 sm:px-8 md:grid-cols-3">
          {[[Search, "Search quickly", "Find roles by title, skill, company, and location."], [Globe2, "Explore globally", "Discover remote and location-based opportunities worldwide."], [BriefcaseBusiness, "Research confidently", "Compare openings, salary signals, and company information."]].map(([Icon, title, copy]) => (
            <div key={title} className="rounded-2xl border border-slate-200 p-6">
              <Icon className="h-7 w-7 text-accent" />
              <h2 className="mt-5 !text-left text-xl font-black text-ink">{title}</h2>
              <p className="mt-3 text-slate-600">{copy}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 font-bold text-white hover:bg-accent-hover">Search Jobs <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </main>
  );
}
