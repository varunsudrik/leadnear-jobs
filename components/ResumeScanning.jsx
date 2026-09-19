// C Resume Scanning (spec lines 551-568). Indeterminate only — the scan is a
// single synchronous request with no progress events, so a percentage would
// be fabricated. No "we will email you" / "safe to close the app" either:
// the request is tied to this tab, and neither promise is one the product
// can keep.
//
// `bare` drops the outer CARD so components/ResumeScan.jsx can reuse this
// exact indicator inside its own "Upload revised" modal instead of duplicating
// the markup and the breathing-dots animation — but it must not drop the
// live region that goes with it: a screen-reader user driving the replace
// flow is told nothing when the rescan starts, succeeds or fails otherwise
// (review finding). Both branches below render exactly one
// `role="status" aria-live="polite"` element; only the class (hence the
// chrome) differs.
export default function ResumeScanning({ filename, sizeLabel, bare = false }) {
  const content = (
    <>
      <div className="rsc-dots" aria-hidden="true">
        <span className="rsc-dot rsc-dot-outer" />
        <span className="rsc-dot rsc-dot-inner" />
      </div>
      <div className="rsc-title">Reading your resume</div>
      <div className="rsc-body">This usually takes 10 to 20 seconds.</div>
      <div className="rsc-track"><i /></div>
      {filename && (
        <div className="rsc-file">
          <span className="rsc-file-badge mono">PDF</span>
          <span className="rsc-file-name">{filename}</span>
          {sizeLabel && <span className="rsc-file-size mono">{sizeLabel}</span>}
        </div>
      )}
    </>
  );

  return (
    <div className={bare ? "rsc-live" : "rsc-card"} role="status" aria-live="polite">
      {content}
    </div>
  );
}
