// Replaces the design's un-buildable "rendered resume page" panel (spec
// section 9): rasterising a PDF and mapping issues to page coordinates is a
// backend job nothing here does. Showing the text exactly as the parser read
// it is the honest reproduction, and it is the product's own promise — this
// is what an ATS receives. Lines carrying a fault are highlighted.
//
// `lines` is already the capped preview window buildScan returns (spec D11:
// only the window shown is retained), so `words` below counts exactly what
// is on screen, not the full resume.
export default function ParsedTextView({ lines = [], pages = 1 }) {
  const words = lines.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0);
  const hasBad = lines.some((l) => l.flag === "bad");
  const hasWarn = lines.some((l) => l.flag === "warn");

  return (
    <div className="rs-card">
      <div className="rs-card-head">
        <span>What the parser read</span>
        <span className="mono">{pages} {pages === 1 ? "page" : "pages"} · {words} words</span>
      </div>
      <div className="rs-caption">
        Plain text exactly as an ATS extracts it. Highlighted lines are the ones costing you points.
      </div>
      <div className="rs-parsed">
        {lines.map((l) => (
          <div key={l.n} className={l.flag ? `rs-parsed-line is-${l.flag}` : "rs-parsed-line"}>
            <span className="rs-parsed-n mono">{l.n}</span>
            <span className="rs-parsed-t">{l.text}</span>
          </div>
        ))}
      </div>
      {(hasBad || hasWarn) && (
        <div className="rs-parsed-legend">
          {hasBad && <span className="rs-parsed-legend-item"><span className="rs-parsed-swatch is-bad" />Parsed wrong</span>}
          {hasWarn && <span className="rs-parsed-legend-item"><span className="rs-parsed-swatch is-warn" />Weak content</span>}
        </div>
      )}
    </div>
  );
}
