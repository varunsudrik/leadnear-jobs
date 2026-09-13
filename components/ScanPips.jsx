// The three-dot scan quota. Rendered in the site header (inside a link) and
// again in the Resume scan page header (bare), so it lives here rather than
// being inlined twice.
export default function ScanPips({ used, quota }) {
  return (
    <span className="scan-pips">
      <span className="pips" aria-hidden="true">
        {Array.from({ length: quota }, (_, i) => (
          <span key={i} className={i < used ? "pip used" : "pip"} />
        ))}
      </span>
      <span className="mono">{quota - used}</span>/{quota} free scans
    </span>
  );
}
