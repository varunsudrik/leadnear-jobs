/* eslint-disable @next/next/no-html-link-for-pages -- these anchors intentionally leave the /jobs Next.js zone */
import "./globals.css";
// Imported after globals.css so Tailwind utilities win on the ported pages.
import "./tailwind.css";
import Link from "next/link";
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
  return <html lang="en"><body>
    <SessionProvider>
    <SiteNavbar />
    <main className="site-main">{children}</main>
    <footer className="site-footer"><div className="footer-inner">
      <div><a href="/" className="footer-logo">LeadNear Jobs</a><p>Find your next opportunity from companies worldwide.</p></div>
      <div><strong>For Candidates</strong><Link href="/">Search Jobs</Link><Link href="/remote">Remote Jobs</Link><Link href="/salaries">Salary Explorer</Link><a href={blogUrl} rel="noopener">Career Resources</a></div>
      <div><strong>For Employers</strong><a href="/contact-us?subject=Post%20a%20Job">Post Jobs</a><a href="/contact-us?subject=Hiring%20Solutions">Hiring Solutions</a><Link href="/companies">Company Pages</Link></div>
      <div><strong>Company</strong><a href="/about">About</a><a href="/contact-us">Contact</a><a href="/privacy-policy">Privacy</a><a href="/toc">Terms</a><a href="/opt-out">Opt-out</a></div>
    </div><div className="footer-bottom">© {new Date().getFullYear()} LeadNear Jobs. All rights reserved.</div></footer>
    </SessionProvider>
  </body></html>;
}
