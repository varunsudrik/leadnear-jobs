/* eslint-disable @next/next/no-html-link-for-pages -- these anchors intentionally leave the /jobs Next.js zone */
import "./globals.css";
// Imported after globals.css so Tailwind utilities win on the ported pages.
import "./tailwind.css";
import Link from "next/link";
import { sans, mono } from "@/app/fonts";
import { DEMO_FIT } from "@/lib/demo-fit";
import SiteNavbar from "@/components/SiteNavbar";
import SessionProvider from "@/components/SessionProvider";

const mainOrigin = "https://leadsnear.com";

// The blog is a separate application that is not part of this project, so the
// footer link has to leave the app rather than resolve to a local route.
const blogUrl = process.env.NEXT_PUBLIC_BLOG_URL || "https://blog.leadnear.com";

export const metadata = {
  metadataBase: new URL(mainOrigin),
  title: "LeadNear Jobs — Find Your Next Role",
  description: "Search jobs from companies worldwide. Filter by role, location, salary, and remote work.",
};

export default function RootLayout({ children }) {
  return <html lang="en" className={`${sans.variable} ${mono.variable}`}><body>
    <SessionProvider>
    <SiteNavbar />
    <main className="site-main">{children}</main>
    <footer className="site-footer"><div className="footer-inner">
      <div className="footer-links">
        <Link href="/">Search jobs</Link>
        <Link href="/remote">Remote</Link>
        <Link href="/salaries">Salaries</Link>
        {DEMO_FIT ? <Link href="/resume">Resume scan</Link> : null}
        <a href={blogUrl} rel="noopener">Blog</a>
        <Link href="/contact-us?subject=Post%20a%20Job">Post a job</Link>
        <Link href="/about">About</Link>
        <Link href="/privacy-policy">Privacy</Link>
        <Link href="/toc">Terms</Link>
        <Link href="/opt-out">Opt-out</Link>
      </div>
      <span className="footer-provenance">© 2026 LeadNear Jobs · jobs from career pages and ATS feeds, refreshed nightly</span>
    </div></footer>
    </SessionProvider>
  </body></html>;
}
