import Link from "next/link";

// C Resume Signed Out (spec lines 609-649). No hooks, no fetches — this is
// the marketing case for the feature, so sign-in is the call to action
// rather than a wall. The sample score is explicitly labelled a sample; no
// number here is the visitor's own.
const SAMPLE_PARTS = [
  { label: "Parse", value: 96, color: "#12876b" },
  { label: "Keywords", value: 64, color: "#d98324" },
  { label: "Format", value: 78, color: "#5b4ef0" },
  { label: "Impact", value: 58, color: "#d98324" },
];

export default function ResumeSignedOut() {
  return (
    <div className="console-shell">
      <h1 className="rs-title" style={{ marginBottom: 16 }}>Resume scan</h1>
      <div className="rso-grid">
        <div className="rso-hero">
          <span className="rso-glow" aria-hidden="true" />
          <div className="rso-inner">
            <div className="rso-badge"><span className="rso-dot" />Free, 3 scans</div>
            <h2 className="rso-title">See your resume the way an ATS sees it.</h2>
            <p className="rso-sub">
              Sign in and we score your PDF out of 100, show the extracted text with
              every parsing problem flagged, and rank every open role by how well you fit.
            </p>
            <div className="rso-cta-row">
              <Link href={{ pathname: "/signin", query: { callbackUrl: "/resume" } }} className="rso-cta-primary">
                Sign in to scan
              </Link>
              <Link href="/register" className="rso-cta-ghost">Create an account</Link>
            </div>
            <div className="rso-note">No card. Your file is never shared with employers.</div>
          </div>
        </div>

        <div className="rso-side">
          <div className="ru-good rso-sample">
            <div className="ru-good-head">A sample result</div>
            <div className="rso-sample-row">
              <div className="rso-donut">
                <div className="rso-donut-inner">
                  <span className="rso-donut-score mono">72</span>
                  <span className="rso-donut-label">ATS</span>
                </div>
              </div>
              <div className="rso-parts">
                {SAMPLE_PARTS.map((p) => (
                  <div key={p.label}>
                    <div className="rs-part-head"><span>{p.label}</span><span className="mono">{p.value}</span></div>
                    <div className="rs-track"><i style={{ width: `${p.value}%`, background: p.color }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rso-blur-note">
              This is a sample. Sign in to see your own score, the text a parser reads and every role ranked by fit.
            </div>
          </div>

          <div className="ru-good rso-why">
            <div className="ru-good-head">Why sign in</div>
            <div className="ru-good-list">
              <div className="ru-good-item"><span className="rso-why-dot">·</span><span>Your scans, matches and saved jobs stay on your account.</span></div>
              <div className="ru-good-item"><span className="rso-why-dot">·</span><span>Rescore against any job title later, free.</span></div>
              <div className="ru-good-item"><span className="rso-why-dot">·</span><span>Delete your scan whenever you want.</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
