// Ported from leadnear-main/pages/toc.jsx (Pages Router -> App Router).
// The <Head> block became the metadata export below; markup is unchanged.

export const metadata = {
  title: "Terms and Conditions | LeadNear Jobs",
  description: "Terms and conditions for using LeadNear Jobs.",
  alternates: { canonical: "/toc" },
};

export default function TermsAndConditions() {
  return (
    <>
      <div className="bg-gray-50 min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto bg-white shadow-sm rounded-2xl overflow-hidden border border-gray-100">
          <div className="bg-blue-900 py-10 px-8 text-center">
            <h1 className="text-3xl md:text-4xl font-extrabold text-white">Terms and Conditions</h1>
            <p className="mt-2 text-blue-100 opacity-90">Last updated: January 2026</p>
          </div>
          
          <div className="p-8 md:p-12 space-y-8 text-gray-700 leading-relaxed">
            <section className="space-y-4">
              <p className="text-lg font-medium text-gray-900">LeadNear Web Site Terms and Conditions of Use!</p>
              
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">1. Terms</h2>
                  <p>
                    By accessing this web site, you are agreeing to be bound by these web site Terms and Conditions of Use, all applicable laws and regulations, and agree that you are responsible for compliance with any applicable local laws. If you do not agree with any of these terms, you are prohibited from using or accessing this site.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">2. Use License</h2>
                  <p>
                    Permission is granted to temporarily download one copy of the materials on LeadNear web site for authentic purpose only. The material that you download of a license, not a transfer of material, and under this license you may not: modify or copy the materials; attempt to decompile or reverse engineer any software contained on LeadNear web site; transfer the materials to another person or mirror the materials on any other server. This license shall automatically terminate if you violate any of these restrictions and may be terminated by LeadNear at any time. Upon terminating your viewing of these materials or upon the termination of this license, you must destroy any downloaded materials in your possession whether in electronic or printed format.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">3. Disclaimer</h2>
                  <p>
                    The materials on LeadNear web site are provided as is. LeadNear makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties, including without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights. Further, LeadNear does not warrant or make any representations concerning the accuracy, likely results, or reliability of the use of the materials on its Internet web site or otherwise relating to such materials or on any sites linked to this site.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">4. Limitation of Use</h2>
                  <p>
                    You may not use the Services in any manner that is or may be found by as, at our sole discretion as: violating or infringing in any way upon the rights of others; unlawful, threatening, abusive, defamatory, invasive of privacy or publicity rights, or otherwise objectionable; encouraging conduct that would constitute a criminal or civil offense; gives rise to civil liability; collect content or information, or otherwise access the Services using any automated means (such as bots or scrapers) without our prior permission; access LeadNear servers and Services through unauthorized means, such as unlicensed software clients; violates any applicable local, state, federal or international law, ordinance including any regulations requirements, procedures or policies in force from time to time, or any right of any third party, including without limitation, any right of privacy or publicity. In no event shall LeadNear be liable for any damages (including, without limitation damages for loss of data or profit, or due to business interruption,) arising out of the use or inability to use the materials on LeadNear Internet site.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">5. Revisions and Errata</h2>
                  <p>
                    The materials appearing on LeadNear web site could include technical, typographical, or photographic errors. LeadNear does not warrant that any of the materials on its web site are accurate, complete, or current. LeadNear may make changes to the materials contained on its web site at any time without notice. LeadNear does not, however, make any commitment to update the materials.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">6. Links</h2>
                  <p>
                    LeadNear has not reviewed all of the sites linked to its Internet web site and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by LeadNear of the site. Use of any such linked web site is at the users own risk.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">7. Refund Policy</h2>
                  <p>
                    LeadNear does offer refund for unused credits and the complete process takes 7 working days to process the refund amount to the user. We do not refund the funds which are there in trial plan. We also do not provide refund for the credits which user has purchased a contact and later reported as invalid and once user gets the refund that credit are not eligible for refund but can be used to unlock further contacts and also can be used to unlock contacts through the extension as well.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">8. Site Terms of Use Modifications</h2>
                  <p>
                    LeadNear may revise these terms of use for its web site at any time without notice. By using this web site you are agreeing to be bound by the then current version of these Terms and Conditions of Use.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">9. Governing Law</h2>
                  <p>
                    Any claim relating to LeadNear web site shall be governed by the laws of the State, India without regard to its conflict of law provisions.
                  </p>
                </div>
              </div>
            </section>

            <section className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-4 text-center">Contact Us</h2>
              <p className="text-center">
                If you have any additional questions about our terms, please feel free to address us at:
                <br />
                <a href="mailto:support@leadnear.com" className="text-blue-600 font-bold hover:underline mt-2 inline-block">support@leadnear.com</a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
};


