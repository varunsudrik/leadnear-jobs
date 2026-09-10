// C Home's hero (spec lines 62-75), with the phone variant from the design's
// own mobile screen (spec line 420).
//
// The phone version is not a narrower desktop hero: it drops the second CTA
// and shortens both strings. Both copy variants are rendered and toggled with
// CSS `display` rather than JavaScript — no hydration branch, no layout shift,
// and the strings stay in one file.
//
// Both CTAs are inert: resume scanning is not built. They carry aria-disabled
// and a title rather than the `disabled` attribute, because `disabled`
// suppresses the tooltip and removes focusability, and the mock's appearance
// is the requirement.
const NOT_LIVE = "Resume scoring isn't live yet";

export default function HomeHero() {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <span className="hh-glow" aria-hidden="true" />
      <div className="hh-copy">
        <span className="hh-badge">
          <span className="hh-dot" aria-hidden="true" />
          AI resume match
        </span>
        <h1 id="home-hero-title" className="hh-title">
          <span className="hh-wide">Drop your resume. Get an ATS score and every open role ranked by fit.</span>
          <span className="hh-narrow">Drop your resume. Get an ATS score and every role ranked by fit.</span>
        </h1>
        <p className="hh-sub">
          <span className="hh-wide">PDF or DOCX, up to 5 MB. Three free scans, no card. Your resume is never shared with employers.</span>
          <span className="hh-narrow">3 free scans · no card</span>
        </p>
      </div>
      <div className="hh-cta">
        <button type="button" className="hh-cta-primary" aria-disabled="true" title={NOT_LIVE}>
          Upload resume
        </button>
        <button type="button" className="hh-cta-ghost" aria-disabled="true" title={NOT_LIVE}>
          How scoring works
        </button>
      </div>
    </section>
  );
}
