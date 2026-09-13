// Rendered by /resume and /matches when NEXT_PUBLIC_DEMO_FIT=false. Both
// screens are entirely demo content, so the switch leaves nothing to show —
// but the routes still exist, and a blank page is not an explanation.
export default function DemoOffPanel({ what }) {
  return (
    <div className="console-shell">
      <div className="empty-box">
        <p>{what} isn&apos;t enabled on this deployment.</p>
        <p style={{ color: "var(--text3)", marginTop: ".5rem", fontSize: ".9rem" }}>
          Resume scoring and match ranking are still being built.
        </p>
      </div>
    </div>
  );
}
