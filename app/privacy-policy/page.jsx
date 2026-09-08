// Ported from leadnear-main/pages/privacy-policy.jsx (Pages Router -> App Router).
// The <Head> block became the metadata export below; markup is unchanged.

export const metadata = {
  title: "Privacy Policy | LeadNear Jobs",
  description: "How LeadNear Jobs collects, uses and protects your data.",
  alternates: { canonical: "/privacy-policy" },
};

const sections = [
  { id: "introduction", title: "Introduction" },
  { id: "about", title: "About Our Services" },
  { id: "scope", title: "Scope of This Policy" },
  { id: "lawful-basis", title: "Lawful Basis for Processing" },
  { id: "data-we-collect", title: "Data We Collect" },
  { id: "how-we-use", title: "How We Use Data" },
  { id: "data-sharing", title: "Data Sharing" },
  { id: "data-retention", title: "Data Retention" },
  { id: "professional-individuals", title: "Data of Professional Individuals" },
  { id: "user-rights", title: "User Rights" },
  { id: "cookies", title: "Cookies and Tracking" },
  { id: "data-security", title: "Data Security" },
  { id: "international-transfers", title: "International Data Transfers" },
  { id: "children", title: "Children’s Privacy" },
  { id: "third-party-links", title: "Third-Party Links" },
  { id: "changes", title: "Changes to This Policy" },
  { id: "contact", title: "Contact Information" },
];

const SectionHeading = ({ number, title, id }) => (
  <div className="flex items-baseline gap-3 mb-4">
    <span className="text-sm font-semibold tracking-wider text-blue-600 tabular-nums">
      {String(number).padStart(2, "0")}
    </span>
    <h2 id={id} className="scroll-mt-24 text-2xl font-semibold text-gray-900 tracking-tight">
      {title}
    </h2>
  </div>
);

const Bullets = ({ items }) => (
  <ul className="space-y-2">
    {items.map((item, idx) => (
      <li key={idx} className="flex gap-3">
        <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-gray-400" aria-hidden />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

const SubHeading = ({ children }) => (
  <h3 className="text-base font-semibold text-gray-900 mt-6 mb-2">{children}</h3>
);

export default function PrivacyPolicy() {
  return (
    <>
      <div className="bg-white min-h-screen">
        <div className="-mt-px border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white">
          <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-10 py-16 sm:py-20">
            <p className="text-xs font-semibold tracking-widest uppercase text-blue-600">
              Legal
            </p>
            <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight text-gray-900">
              Privacy Policy
            </h1>
            <p className="mt-4 text-sm text-gray-500">Last updated: April 2026</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-10 py-12 sm:py-16">
          <nav
            aria-label="Table of contents"
            className="mb-14 rounded-2xl border border-gray-100 bg-gray-50/60 p-6 sm:p-8"
          >
            <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-500 mb-4">
              Contents
            </h2>
            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {sections.map((s, i) => (
                <li key={s.id} className="flex gap-3">
                  <span className="text-gray-400 tabular-nums w-6 flex-shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <a
                    href={`#${s.id}`}
                    className="text-gray-700 hover:text-blue-600 transition-colors"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="text-gray-700 leading-relaxed text-[15px] sm:text-base">
            <div className="space-y-14">
              <section>
                <SectionHeading number={1} id="introduction" title="Introduction" />
                <div className="space-y-4">
                  <p>
                    LeadNear (&ldquo;Company&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates the Chrome extension LeadNear: Email &amp; Phone Finder and related services (collectively, the &ldquo;Services&rdquo;).
                  </p>
                  <p>
                    This Privacy Policy explains how we collect, use, process, store, and disclose information relating to users (&ldquo;Users&rdquo;), website visitors (&ldquo;Visitors&rdquo;), and individuals whose professional data may be included in our database (&ldquo;Professional Individuals&rdquo;).
                  </p>
                  <p>
                    By accessing or using our Services, you acknowledge that you have read and understood this Privacy Policy.
                  </p>
                </div>
              </section>

              <section>
                <SectionHeading number={2} id="about" title="About Our Services" />
                <div className="space-y-4">
                  <p>
                    LeadNear provides tools designed for recruiters, sales professionals, and businesses to discover and access publicly available professional contact information, including email addresses and phone numbers.
                  </p>
                  <p>Our Services may include:</p>
                  <Bullets
                    items={[
                      "A browser extension",
                      "Contact search tools",
                      "Data enrichment tools",
                    ]}
                  />
                  <p>
                    We compile and index information from publicly available sources and third-party providers.
                  </p>
                </div>
              </section>

              <section>
                <SectionHeading number={3} id="scope" title="Scope of This Policy" />
                <div className="space-y-4">
                  <p>This Privacy Policy applies to:</p>
                  <Bullets
                    items={[
                      <>
                        <span className="font-medium text-gray-900">Users</span> — Individuals using our Services
                      </>,
                      <>
                        <span className="font-medium text-gray-900">Professional Individuals</span> — People whose data appears in our database
                      </>,
                      <>
                        <span className="font-medium text-gray-900">Visitors</span> — Anyone accessing our website or services
                      </>,
                    ]}
                  />
                </div>
              </section>

              <section>
                <SectionHeading number={4} id="lawful-basis" title="Lawful Basis for Processing" />
                <div className="space-y-4">
                  <p>We process personal data under the following legal bases:</p>
                  <Bullets
                    items={[
                      <>
                        <span className="font-medium text-gray-900">Contract</span> — To provide Services to Users
                      </>,
                      <>
                        <span className="font-medium text-gray-900">Legitimate Interests</span> — To maintain and improve our database and services
                      </>,
                      <>
                        <span className="font-medium text-gray-900">Consent</span> — Where required (e.g., marketing communications)
                      </>,
                      <>
                        <span className="font-medium text-gray-900">Legal Obligation</span> — Compliance with applicable laws
                      </>,
                    ]}
                  />
                </div>
              </section>

              <section>
                <SectionHeading number={5} id="data-we-collect" title="Data We Collect" />
                <div className="space-y-4">
                  <SubHeading>5.1 Data Collected from Users</SubHeading>
                  <p>We may collect:</p>
                  <Bullets
                    items={[
                      "Name",
                      "Email address",
                      "Company name",
                      "Communication data (support requests, feedback)",
                    ]}
                  />

                  <SubHeading>5.2 Data Collected Automatically</SubHeading>
                  <p>When you use our Services, we may collect:</p>
                  <Bullets
                    items={[
                      "IP address",
                      "Browser type and device information",
                      "Usage data (searches, clicks, interactions)",
                      "Log data and timestamps",
                    ]}
                  />

                  <SubHeading>5.3 Data Collected via Extension</SubHeading>
                  <p>When you use the Chrome extension, we may process:</p>
                  <Bullets items={["Public profile data (e.g., name, job title, company)"]} />
                  <p>We do not collect private messages or restricted content.</p>

                  <SubHeading>5.4 Data About Professional Individuals</SubHeading>
                  <p>We may collect and process:</p>
                  <Bullets
                    items={[
                      "Name",
                      "Job title",
                      "Company",
                      "Business email addresses",
                      "Phone numbers",
                      "Social media profiles",
                      "Public career history",
                    ]}
                  />
                  <p className="pt-2 font-medium text-gray-900">Sources:</p>
                  <Bullets
                    items={[
                      "Public websites",
                      "Social networks",
                      "Business directories",
                      "Third-party data providers",
                    ]}
                  />
                </div>
              </section>

              <section>
                <SectionHeading number={6} id="how-we-use" title="How We Use Data" />
                <div className="space-y-4">
                  <p>We use data to:</p>
                  <Bullets
                    items={[
                      "Provide and operate Services",
                      "Deliver contact information results",
                      "Maintain and update our database",
                      "Improve accuracy and functionality",
                      "Prevent fraud and misuse",
                      "Provide customer support",
                      "Send service-related communications",
                    ]}
                  />
                </div>
              </section>

              <section>
                <SectionHeading number={7} id="data-sharing" title="Data Sharing" />
                <div className="space-y-4">
                  <p>We may share data with:</p>

                  <SubHeading>7.1 Service Providers</SubHeading>
                  <p>Hosting, analytics, payment processors, and infrastructure providers.</p>

                  <SubHeading>7.2 Legal Authorities</SubHeading>
                  <p>When required by law or to protect rights and safety.</p>

                  <SubHeading>7.3 Business Transfers</SubHeading>
                  <p>In case of merger, acquisition, or sale.</p>

                  <p className="pt-4 font-medium text-gray-900">
                    We do not sell personal data for advertising purposes.
                  </p>
                </div>
              </section>

              <section>
                <SectionHeading number={8} id="data-retention" title="Data Retention" />
                <div className="space-y-4">
                  <p>We retain data only as long as necessary for:</p>
                  <Bullets
                    items={["Providing Services", "Legal compliance", "Dispute resolution"]}
                  />
                  <p>
                    We may retain limited data for fraud prevention and legal obligations.
                  </p>
                </div>
              </section>

              <section>
                <SectionHeading
                  number={9}
                  id="professional-individuals"
                  title="Data of Professional Individuals"
                />
                <div className="space-y-4">
                  <p>
                    Our database may include profiles built from publicly available information.
                  </p>
                  <p>If you are a Professional Individual, you may:</p>
                  <Bullets
                    items={[
                      "Request access to your data",
                      "Request correction",
                      "Request deletion (opt-out)",
                    ]}
                  />
                  <p>Requests can be made via opt-out form or email.</p>
                </div>
              </section>

              <section>
                <SectionHeading number={10} id="user-rights" title="User Rights" />
                <div className="space-y-4">
                  <p>Depending on your jurisdiction, you may have rights to:</p>
                  <Bullets
                    items={[
                      "Access your data",
                      "Correct inaccurate data",
                      "Delete your data",
                      "Object to processing",
                      "Withdraw consent",
                    ]}
                  />
                  <p>
                    To exercise rights, contact{" "}
                    <a
                      href="mailto:support@leadnear.com"
                      className="text-blue-600 font-medium hover:underline"
                    >
                      support@leadnear.com
                    </a>
                    .
                  </p>
                </div>
              </section>

              <section>
                <SectionHeading number={11} id="cookies" title="Cookies and Tracking" />
                <div className="space-y-4">
                  <p>We use cookies and similar technologies to:</p>
                  <Bullets
                    items={["Maintain sessions", "Improve functionality", "Analyze usage"]}
                  />
                  <p>You can control cookies through your browser settings.</p>
                </div>
              </section>

              <section>
                <SectionHeading number={12} id="data-security" title="Data Security" />
                <div className="space-y-4">
                  <p>
                    We implement appropriate technical and organizational measures, including:
                  </p>
                  <Bullets items={["Encryption", "Secure servers", "Access controls"]} />
                  <p>However, no system is completely secure.</p>
                </div>
              </section>

              <section>
                <SectionHeading
                  number={13}
                  id="international-transfers"
                  title="International Data Transfers"
                />
                <div className="space-y-4">
                  <p>
                    Your data may be processed and stored in countries outside your jurisdiction.
                  </p>
                  <p>We take appropriate safeguards to ensure data protection.</p>
                </div>
              </section>

              <section>
                <SectionHeading number={14} id="children" title="Children’s Privacy" />
                <div className="space-y-4">
                  <p>Our Services are not intended for individuals under 18.</p>
                  <p>We do not knowingly collect data from minors.</p>
                </div>
              </section>

              <section>
                <SectionHeading number={15} id="third-party-links" title="Third-Party Links" />
                <div className="space-y-4">
                  <p>Our Services may contain links to third-party websites.</p>
                  <p>We are not responsible for their privacy practices.</p>
                </div>
              </section>

              <section>
                <SectionHeading number={16} id="changes" title="Changes to This Policy" />
                <div className="space-y-4">
                  <p>We may update this Privacy Policy periodically.</p>
                  <p>Updates will be posted with a revised date.</p>
                </div>
              </section>

              <section>
                <SectionHeading number={17} id="contact" title="Contact Information" />
                <div className="mt-2 rounded-2xl border border-gray-100 bg-gray-50/60 p-6 sm:p-8">
                  <dl className="space-y-3 text-[15px]">
                    <div className="flex flex-col sm:flex-row sm:gap-3">
                      <dt className="w-28 flex-shrink-0 font-medium text-gray-900">
                        Company
                      </dt>
                      <dd className="text-gray-700">LeadNear Technologies Pvt Ltd</dd>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:gap-3">
                      <dt className="w-28 flex-shrink-0 font-medium text-gray-900">Email</dt>
                      <dd>
                        <a
                          href="mailto:support@leadnear.com"
                          className="text-blue-600 font-medium hover:underline"
                        >
                          support@leadnear.com
                        </a>
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-5 text-sm text-gray-500">
                    For privacy-related inquiries, please contact us at the email above.
                  </p>
                </div>
              </section>
            </div>
          </article>
        </div>
      </div>
    </>
  );
};


