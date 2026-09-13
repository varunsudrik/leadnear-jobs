// Rendered by /resume and /matches when NEXT_PUBLIC_DEMO_FIT=false. Both
// screens are entirely demo content, so the switch leaves nothing to show —
// but the routes still exist, and a blank page is not an explanation.
//
// Two feature names, used verbatim everywhere they appear: "Resume scoring"
// (app/resume/page.jsx, components/HomeHeroCta.jsx and the second line below)
// and "Match ranking" (app/matches/page.jsx and the same line). This panel
// used to be handed "Resume scanning" and then say "Resume scoring" one line
// later, which read as two different unfinished features.
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
