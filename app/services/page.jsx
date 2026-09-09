// Ported from leadnear-main/pages/services.jsx (Pages Router -> App Router).
// Head metadata moved to the metadata export; markup unchanged.

export const metadata = {
  title: "Services | LeadNear Jobs",
  description: "How LeadNear builds and operates job and company discovery infrastructure.",
  alternates: { canonical: "/services" },
};

import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  Database,
  ExternalLink,
  Gauge,
  GitBranch,
  Layers,
  LineChart,
  Search,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { scheduleMeetLink } from "@/lib/consts/webLinks";

const proofBlocks = [
  {
    image: "/services/gsc-impressions.webp",
    width: 2876,
    height: 1610,
    alt: "Google Search Console impressions proof for LeadNear",
    label: "GSC_IMPRESSIONS",
    title: "18M+ Search Impressions",
    body: "LeadNear has already earned millions of organic search impressions from structured company and jobs pages. We use that proof as the baseline, not as a promise that every site will scale at the same speed.",
    note: "Useful signal: page architecture, internal linking, sitemaps, and data depth can compound when the pages answer real long-tail demand.",
  },
  {
    image: "/services/gsc-clicks.webp",
    width: 2880,
    height: 1530,
    alt: "Google Search Console clicks proof for LeadNear",
    label: "GSC_CLICKS",
    title: "128K+ Organic Clicks",
    body: "The system has converted search visibility into real site visits. For client projects, we track the same funnel from generated pages to indexed pages, clicks, signups, demo requests, and revenue events.",
    note: "Useful signal: traffic alone is not enough. Every rollout needs attribution, conversion tracking, and a pruning plan.",
  },
  {
    image: "/services/gsc-recent.webp",
    width: 2880,
    height: 1520,
    alt: "Recent Google Search Console performance proof for LeadNear",
    label: "RECENT_TREND",
    title: "Recent Growth Snapshot",
    body: "The recent Search Console view shows that the system is not just historical proof. It is still being monitored, tuned, and expanded with real operational constraints.",
    note: "Useful signal: crawl health, freshness, index coverage, and template quality matter more than raw page count.",
  },
];

const liveNodes = [
  {
    category: "Company directory",
    title: "Google Company Page",
    path: "/company/in/google",
    href: "/company/in/google",
    purpose: "Company intelligence page for firmographic, web, social, and contact discovery signals.",
    proof: "Shows how structured company data becomes a useful search landing page.",
  },
  {
    category: "Company directory",
    title: "Tech Mahindra Company Page",
    path: "/company/in/tech-mahindra",
    href: "/company/in/tech-mahindra",
    purpose: "India company profile page built from normalized business data.",
    proof: "Good example of country-specific entity routing and page structure.",
  },
  {
    category: "Company directory",
    title: "Starbucks Company Page",
    path: "/company/us/starbucks",
    href: "/company/us/starbucks",
    purpose: "US company profile page with public business metadata.",
    proof: "Shows how the same page model can support multiple markets.",
  },
  {
    category: "Jobs engine",
    title: "Jobs Search Hub",
    path: "/jobs",
    href: "/jobs",
    purpose: "Search hub for the external jobs system integrated into LeadNear.",
    proof: "Case study for large-scale jobs pages, sitemaps, and publishing operations.",
  },
  {
    category: "Jobs engine",
    title: "Remote Jobs Page",
    path: "/jobs/remote",
    href: "/jobs/remote",
    purpose: "Segmented job discovery page for remote roles.",
    proof: "Example of a high-intent page cluster built from structured filters.",
  },
  {
    category: "Jobs engine",
    title: "Software Engineering Jobs",
    path: "/jobs/category/software-engineering-jobs",
    href: "/jobs/category/software-engineering-jobs",
    purpose: "Category page for software engineering roles.",
    proof: "Example of category-led programmatic SEO with real user utility.",
  },
];

const pipeline = [
  "Opportunity audit",
  "Data model",
  "Template design",
  "Internal linking",
  "Sitemap rollout",
  "Index monitoring",
  "Conversion tracking",
];

const capabilities = [
  {
    icon: Search,
    title: "Technical SEO & Programmatic SEO",
    body: "Build scalable search infrastructure with Technical SEO, Programmatic SEO, structured data, crawl optimization, indexing, and intelligent site architecture.",
  },
  {
    icon: Database,
    title: "Data Pipeline Engineering",
    body: "Collect, clean, dedupe, refresh, and version the records that feed your pages so rankings are not built on stale data.",
  },
  {
    icon: GitBranch,
    title: "Publishing Architecture",
    body: "Plan staged rollouts, cache strategy, sitemap segmentation, canonical rules, and page pruning before scale becomes expensive.",
  },
  {
    icon: LineChart,
    title: "Search Console Operations",
    body: "Track indexed pages, impressions, clicks, crawl issues, winning templates, weak pages, and conversion events every week.",
  },
  {
    icon: ShieldCheck,
    title: "Risk And Compliance Review",
    body: "Document data sources, page value, privacy constraints, and spam-policy risks so growth does not become a liability.",
  },
  {
    icon: Workflow,
    title: "Internal Growth Tools",
    body: "Create admin workflows for publishing queues, data quality checks, content approvals, alerts, and page performance reports.",
  },
];

const clientSegments = [
  "B2B SaaS with integrations, use cases, and comparison opportunities",
  "Marketplaces with categories, cities, services, vendors, or inventory",
  "Vertical job boards and recruiting platforms with structured listings",
  "Data and API companies with valuable datasets but weak organic reach",
  "Ecommerce catalogs where useful filtered pages are not indexable today",
  "Franchise, local, and multi-location businesses with messy location data",
];

const bottlenecks = [
  "Crawl budget: Google may crawl slower than your system can publish.",
  "Template similarity: pages must be genuinely useful, not doorway pages.",
  "Data freshness: jobs, products, prices, and company data decay quickly.",
  "Infrastructure cost: large page systems need storage, cache, and rebuild planning.",
  "Attribution: clients need leading indicators before SEO revenue fully matures.",
];

export default function ServicesPage() {
  return (
    <>
      <main className="services-page">
        <section className="service-hero">
          <div className="service-container">
            <div className="eyebrow">LeadNear Services</div>
            <h1>
              Technical SEO | Programmatic SEO
              <span>| Data Engineering</span>
            </h1>
            <p className="hero-copy">
              We engineer technical SEO, programmatic SEO engines, structured data pipelines, and scalable web extraction infrastructure that ranks reliably in production environments. The proof is our own LeadNear company and jobs infrastructure.
            </p>
            <div className="hero-actions">
              <a href={scheduleMeetLink} target="_blank" rel="noreferrer" className="service-btn primary">
                Book a technical audit
              </a>
              <a href="#proof" className="service-btn secondary">
                Review the proof
              </a>
            </div>
            <div className="metrics-panel">
              <div>
                <strong>18.4M+</strong>
                <span>Google impressions</span>
              </div>
              <div>
                <strong>128K+</strong>
                <span>Organic clicks</span>
              </div>
              <div>
                <strong>10K+</strong>
                <span>Indexed pages</span>
              </div>
              <div>
                <strong>Global</strong>
                <span>Multi-region traffic</span>
              </div>
            </div>
          </div>
        </section>

        <section id="proof" className="service-section">
          <div className="service-container">
            <div className="section-heading">
              <span>Proof, Not Hype</span>
              <h2>Real Search Console evidence from systems we operate.</h2>
              <p>
                We do not sell generic blog content or bulk AI pages. We sell technical growth infrastructure: clean data, useful templates, crawlable routes, and measurable outcomes.
              </p>
            </div>
            <div className="proof-stack">
              {proofBlocks.map((block) => (
                <article className="proof-card" key={block.label}>
                  <div className="proof-image">
                    <Image
                      src={block.image}
                      alt={block.alt}
                      width={block.width}
                      height={block.height}
                      className="service-image"
                    />
                  </div>
                  <div className="proof-copy">
                    <span>{block.label}</span>
                    <h3>{block.title}</h3>
                    <p>{block.body}</p>
                    <div className="proof-note">{block.note}</div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="service-section muted">
          <div className="service-container">
            <div className="section-heading">
              <span>Core Case Study</span>
              <h2>LeadNear proves the operating model.</h2>
              <p>
                The company directory and jobs engine are not slideware. They are live search surfaces with real pages, screenshots, and operational lessons around crawl budget, storage, freshness, and conversion tracking.
              </p>
            </div>
            <div className="case-grid">
              <div className="case-card">
                <div className="case-icon"><Layers size={22} /></div>
                <h3>Company Intelligence Pages</h3>
                <p>
                  Company pages convert firmographic, web, social, and contact signals into useful landing pages. This is the same pattern many SaaS, marketplace, and data companies can adapt.
                </p>
                <ul>
                  <li>Entity pages by company and country</li>
                  <li>Structured fields instead of thin text</li>
                  <li>Internal linking between related discovery paths</li>
                </ul>
              </div>
              <div className="case-card">
                <div className="case-icon"><Gauge size={22} /></div>
                <h3>Jobs Publishing System</h3>
                <p>
                  The jobs case study shows the harder side of programmatic SEO: many records, large cache output, publishing queues, sitemap pressure, and stale-data risk.
                </p>
                <ul>
                  <li>Large structured jobs dataset</li>
                  <li>Search pages, category pages, and geography pages</li>
                  <li>Monitoring for generated pages, cache, and crawl state</li>
                </ul>
              </div>
              <div className="screenshot-card">
                <div>
                  <h4>Company page example</h4>
                  <Image
                    src="/services/company-page.png"
                    alt="LeadNear company page screenshot"
                    width={2868}
                    height={1572}
                    className="service-image"
                  />
                </div>
                <div>
                  <h4>Jobs page example</h4>
                  <Image
                    src="/services/jobs-page.webp"
                    alt="LeadNear jobs page screenshot"
                    width={2868}
                    height={1680}
                    className="service-image"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="service-section" id="live">
          <div className="service-container">
            <div className="section-heading">
              <span>Live Examples</span>
              <h2>Inspect the routes yourself.</h2>
              <p>
                These are examples of the page systems behind the case study. Live availability, counts, and rankings can change, so the important part is the structure and operating model.
              </p>
            </div>
            <div className="nodes-grid">
              {liveNodes.map((node) => (
                <article className="node-card" key={node.href}>
                  <div className="node-top">
                    <span>{node.category}</span>
                    <h3>{node.title}</h3>
                    <code>{node.path}</code>
                  </div>
                  <p>{node.purpose}</p>
                  <div className="node-proof">
                    <CheckCircle2 size={16} />
                    <span>{node.proof}</span>
                  </div>
                  <a href={node.href} target="_blank" rel="noreferrer">
                    Open live page <ExternalLink size={15} />
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="service-section muted">
          <div className="service-container">
            <div className="section-heading">
              <span>How We Build</span>
              <h2>A staged rollout, not a million-page gamble.</h2>
              <p>
                The safest way to scale is to prove one page cluster, measure indexing and conversion, then expand. That protects your brand, crawl budget, engineering time, and search visibility.
              </p>
            </div>
            <div className="pipeline">
              {pipeline.map((step, index) => (
                <div className="pipeline-node" key={step}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{step}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="service-section" id="capabilities">
          <div className="service-container">
            <div className="section-heading">
              <span>Engineering Scope</span>
              <h2>What we can build and operate.</h2>
            </div>
            <div className="capability-grid">
              {capabilities.map(({ icon: Icon, title, body }) => (
                <article className="capability-card" key={title}>
                  <Icon size={21} />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="service-section muted">
          <div className="service-container two-column">
            <div>
              <div className="section-heading compact">
                <span>Best-Fit Clients</span>
                <h2>Who should track this seriously.</h2>
                <p>
                  The best clients already have structured data or repeatable page opportunities. If your growth depends only on hand-written articles, this is probably not the right service.
                </p>
              </div>
              <ul className="trust-list">
                {clientSegments.map((segment) => (
                  <li key={segment}>{segment}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="section-heading compact">
                <span>Known Bottlenecks</span>
                <h2>What we handle upfront.</h2>
                <p>
                  Programmatic SEO fails when teams publish faster than they can verify quality. We make these risks visible before launch.
                </p>
              </div>
              <ul className="trust-list">
                {bottlenecks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="service-section contact" id="contact">
          <div className="service-container">
            <div className="contact-panel">
              <BarChart3 size={32} />
              <h2>Start with a technical growth audit.</h2>
              <p>
                We will review your data, current indexed pages, sitemap structure, page opportunities, risk areas, and the first cluster worth launching.
              </p>
              <div className="hero-actions centered">
                <a href={scheduleMeetLink} target="_blank" rel="noreferrer" className="service-btn primary">
                  Book a technical audit
                </a>
                <Link href="/contact-us" className="service-btn secondary">
                  Contact LeadNear
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <style>{`
        .services-page {
          background: #09090b;
          color: #f4f4f5;
          margin-top: -1rem;
          min-height: 100vh;
        }
        .service-container {
          width: 100%;
          max-width: 1180px;
          margin: 0 auto;
          padding: 0 24px;
        }
        .service-hero {
          padding: 150px 0 86px;
          background: radial-gradient(circle at 78% 14%, rgba(91, 78, 240, 0.2), transparent 34%),
            linear-gradient(180deg, #0b1020 0%, #09090b 100%);
          border-bottom: 1px solid #27272a;
        }
        .eyebrow,
        .section-heading span,
        .proof-copy span,
        .node-top span,
        .pipeline-node span {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          color: #5b4ef0;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 0.75rem;
          font-weight: 700;
        }
        h1,
        h2,
        h3,
        h4,
        p {
          margin: 0;
        }
        .services-page h1 {
          color: #ffffff;
          max-width: 960px;
          font-size: 4.45rem;
          line-height: 0.98;
          letter-spacing: -0.055em;
          margin-top: 18px;
        }
        .services-page h1 span {
          display: block;
          margin-top: 10px;
        }
        .hero-copy {
          max-width: 780px;
          color: #cbd5e1;
          font-size: 1.15rem;
          line-height: 1.7;
          margin-top: 28px;
        }
        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          margin-top: 34px;
        }
        .hero-actions.centered {
          justify-content: center;
        }
        .service-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 46px;
          border-radius: 8px;
          padding: 0 20px;
          font-weight: 700;
          text-decoration: none;
          transition: 160ms ease;
        }
        .service-btn.primary {
          background: #5b4ef0;
          border: 1px solid #4a3ee0;
          color: white;
        }
        .service-btn.secondary {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid #3f3f46;
          color: #f4f4f5;
        }
        .service-btn:hover {
          transform: translateY(-1px);
        }
        .metrics-panel {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          margin-top: 74px;
          border: 1px solid #27272a;
          border-radius: 8px;
          overflow: hidden;
          background: rgba(18, 18, 20, 0.9);
        }
        .metrics-panel div {
          padding: 28px;
          border-right: 1px solid #27272a;
        }
        .metrics-panel div:last-child {
          border-right: 0;
        }
        .metrics-panel strong {
          display: block;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          color: #f4f4f5;
          font-size: 2.35rem;
          font-weight: 800;
          line-height: 1;
        }
        .metrics-panel span {
          display: block;
          margin-top: 10px;
          color: #a1a1aa;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.09em;
          text-transform: uppercase;
        }
        .service-section {
          padding: 96px 0;
          border-bottom: 1px solid #27272a;
        }
        .service-section.muted {
          background: #101014;
        }
        .section-heading {
          max-width: 760px;
          margin-bottom: 44px;
        }
        .section-heading.compact {
          margin-bottom: 24px;
        }
        .section-heading h2,
        .contact-panel h2 {
          color: #f4f4f5;
          font-size: clamp(2rem, 4vw, 3.15rem);
          line-height: 1.04;
          letter-spacing: -0.04em;
          margin-top: 12px;
        }
        .section-heading p,
        .contact-panel p {
          color: #a1a1aa;
          line-height: 1.7;
          margin-top: 16px;
          font-size: 1rem;
        }
        .proof-stack {
          display: grid;
          gap: 28px;
        }
        .proof-card {
          display: grid;
          grid-template-columns: 1.35fr 0.95fr;
          background: #18181b;
          border: 1px solid #27272a;
          border-radius: 8px;
          overflow: hidden;
        }
        .proof-image {
          min-height: 320px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 28px;
          background: #0d0d11;
          border-right: 1px solid #27272a;
        }
        .service-image {
          width: 100%;
          height: auto;
          border-radius: 6px;
          border: 1px solid #3f3f46;
          background: #09090b;
        }
        .proof-copy {
          padding: 38px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .proof-copy h3,
        .case-card h3,
        .node-card h3,
        .capability-card h3 {
          color: #f4f4f5;
          font-size: 1.24rem;
          margin-top: 12px;
          margin-bottom: 12px;
        }
        .proof-copy p,
        .case-card p,
        .node-card p,
        .capability-card p {
          color: #a1a1aa;
          line-height: 1.65;
        }
        .proof-note {
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid #27272a;
          color: #cbd5e1;
          font-size: 0.9rem;
          line-height: 1.6;
        }
        .case-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 24px;
        }
        .case-card,
        .node-card,
        .capability-card,
        .contact-panel {
          background: #18181b;
          border: 1px solid #27272a;
          border-radius: 8px;
        }
        .case-card {
          padding: 30px;
        }
        .case-icon {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          color: #5b4ef0;
          background: rgba(91, 78, 240, 0.12);
          border: 1px solid rgba(91, 78, 240, 0.22);
          border-radius: 8px;
        }
        .case-card ul,
        .trust-list {
          list-style: none;
          padding: 0;
          margin: 22px 0 0;
          display: grid;
          gap: 12px;
        }
        .case-card li,
        .trust-list li {
          color: #cbd5e1;
          line-height: 1.55;
          padding-left: 22px;
          position: relative;
        }
        .case-card li::before,
        .trust-list li::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0.65em;
          width: 7px;
          height: 7px;
          border-radius: 99px;
          background: #22c55e;
        }
        .screenshot-card {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 26px;
          padding: 30px;
          background: #121214;
          border: 1px solid #27272a;
          border-radius: 8px;
        }
        .screenshot-card h4 {
          color: #e5e7eb;
          margin-bottom: 12px;
          font-size: 0.94rem;
        }
        .nodes-grid,
        .capability-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 22px;
        }
        .node-card,
        .capability-card {
          padding: 26px;
        }
        .node-top code {
          display: block;
          color: #cbd5e1;
          font-size: 0.8rem;
          margin-bottom: 18px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .node-proof {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          color: #cbd5e1;
          margin-top: 18px;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .node-proof svg,
        .capability-card svg {
          color: #5b4ef0;
          flex: 0 0 auto;
        }
        .node-card a {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #5b4ef0;
          text-decoration: none;
          margin-top: 22px;
          font-weight: 700;
        }
        .pipeline {
          display: grid;
          grid-template-columns: repeat(7, minmax(130px, 1fr));
          gap: 12px;
          overflow-x: auto;
          padding-bottom: 8px;
        }
        .pipeline-node {
          min-height: 108px;
          padding: 18px;
          background: #18181b;
          border: 1px solid #27272a;
          border-radius: 8px;
        }
        .pipeline-node strong {
          display: block;
          color: #f4f4f5;
          margin-top: 12px;
          line-height: 1.35;
        }
        .capability-card svg {
          margin-bottom: 12px;
        }
        .two-column {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 58px;
        }
        .contact {
          padding-bottom: 120px;
        }
        .contact-panel {
          max-width: 860px;
          margin: 0 auto;
          text-align: center;
          padding: 58px 34px;
        }
        .contact-panel svg {
          color: #5b4ef0;
        }
        .contact-panel p {
          max-width: 650px;
          margin-left: auto;
          margin-right: auto;
        }
        @media (max-width: 980px) {
          .metrics-panel,
          .case-grid,
          .screenshot-card,
          .two-column {
            grid-template-columns: 1fr;
          }
          .metrics-panel div {
            border-right: 0;
            border-bottom: 1px solid #27272a;
          }
          .metrics-panel div:last-child {
            border-bottom: 0;
          }
          .proof-card {
            grid-template-columns: 1fr;
          }
          .services-page h1 {
            font-size: 3.35rem;
            white-space: normal;
          }
          .proof-image {
            border-right: 0;
            border-bottom: 1px solid #27272a;
          }
          .nodes-grid,
          .capability-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .service-hero {
            padding-top: 120px;
          }
          .services-page h1 {
            font-size: 2.6rem;
          }
          .service-section {
            padding: 72px 0;
          }
          .nodes-grid,
          .capability-grid {
            grid-template-columns: 1fr;
          }
          .proof-copy,
          .case-card,
          .screenshot-card,
          .node-card,
          .capability-card,
          .contact-panel {
            padding: 22px;
          }
          .hero-actions {
            flex-direction: column;
          }
          .service-btn {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}

