import Link from "next/link";
import ScanPips from "@/components/ScanPips";
import InertButton from "@/components/InertButton";

const UPLOAD_NOT_LIVE = "Uploading a revised resume isn't live yet";

export default function ResumeScan({ data, scansUsed, quota }) {
  const { scan, score, parts, issues, found, missing, scoredAgainst, headline, subline } = data;
  const trialExhausted = scansUsed >= quota;

  return (
    <div className="console-shell">
      <div className="rs-head">
        <div className="rs-head-main">
          <h1 className="rs-title">Resume scan</h1>
          <span className="rs-meta">
            {scan.filename} · {scan.pages} pages · scanned {scan.scannedAt} in{" "}
            <span className="mono">{scan.durationSeconds}s</span>
          </span>
        </div>
        <div className="rs-actions">
          <ScanPips used={scansUsed} quota={quota} />
          {/* The design gates this on the trial being spent. At 2 of 3 it never
              renders; the branch stays so the Upgrade plan has its hook. */}
          {trialExhausted ? <span className="rs-upgrade">Unlock unlimited</span> : null}
          <InertButton className="rs-upload" note={UPLOAD_NOT_LIVE}>Upload revised</InertButton>
          <Link href="/matches" className="rs-view-matches">View matches →</Link>
        </div>
      </div>

      <div className="rs-body">
        <div className="rs-col">
          <div className="rs-card">
            <div className="rs-card-head"><span>Preview</span><span className="mono">page 1 / {scan.pages}</span></div>
            {/* The mock draws this placeholder itself — rasterising a PDF and
                mapping issues to page coordinates is a backend job. Shipping
                the design's own grey box is the honest reproduction. */}
            <div className="rs-preview">rendered resume page<br />with flagged regions highlighted</div>
          </div>
          <div className="rs-card">
            <label className="rs-label" htmlFor="scored-against">Scored against</label>
            <select id="scored-against" className="rs-select" defaultValue={scoredAgainst[0]}>
              {scoredAgainst.map((o) => <option key={o}>{o}</option>)}
            </select>
            <div className="rs-caption">Keywords weighted by how often they appear in current postings for this title.</div>
          </div>
        </div>

        <div className="rs-col">
          <div className="rs-score">
            <div
              className="rs-donut"
              aria-hidden="true"
              style={{ background: `conic-gradient(var(--accent) 0 ${score}%, var(--border) ${score}% 100%)` }}
            >
              <div className="rs-donut-inner">
                <span className="rs-donut-score">{score}</span>
                <span className="rs-donut-label">ATS SCORE</span>
              </div>
            </div>
            <div className="rs-score-copy">
              <div className="rs-headline">{headline}</div>
              <div className="rs-subline">{subline}</div>
              <div className="rs-parts">
                {parts.map((p) => (
                  <div key={p.label}>
                    <div className="rs-part-head"><span>{p.label}</span><span className="mono">{p.value}</span></div>
                    <div className="rs-track"><i style={{ width: `${p.value}%`, background: p.color }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rs-fixes">
            <div className="rs-fixes-head"><span>Fixes · {issues.length} open</span><span>Est. impact</span></div>
            {issues.map((i) => (
              <label className="rs-fix" key={i.issue}>
                <input type="checkbox" />
                <span className={`rs-sev ${i.sev.toLowerCase()}`}>{i.sev}</span>
                <span className="rs-fix-text"><b>{i.issue}</b><span> — {i.fix}</span></span>
                <span className="rs-impact">{i.impact}</span>
              </label>
            ))}
          </div>

          <div className="rs-keywords">
            <div className="rs-chip-card">
              <div className="rs-chip-head">Keywords found · {found.length}</div>
              <div className="rs-chips">
                {found.map((k) => <span className="rs-chip found" key={k}>{k}</span>)}
              </div>
            </div>
            <div className="rs-chip-card">
              <div className="rs-chip-head">Missing · {missing.length}</div>
              <div className="rs-chips">
                {missing.map((m) => (
                  <span className="rs-chip missing" key={m.term}>{m.term} · <span className="mono">{m.share}%</span></span>
                ))}
              </div>
              <div className="rs-caption">Share of current postings that mention the term.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
