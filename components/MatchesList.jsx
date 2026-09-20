import JobCard from "@/components/JobCard";
import { matchReason } from "@/lib/resume/match.mjs";
import { fmtDate } from "@/lib/format";

const TIER_LABEL = { strong: "Strong", good: "Good", low: "Low" };

function TierGroup({ tier, rows, skills }) {
  if (!rows.length) return null;
  const head = (
    <div className="match-group-head">
      <span className="match-group-label">
        <span className={`match-group-dot ${tier}`} aria-hidden="true" />
        {TIER_LABEL[tier]}
        <span className="match-group-count">{rows.length}</span>
      </span>
    </div>
  );
  const list = (
    <div className="match-rows">
      {rows.map((row) => (
        <JobCard
          key={row.db_id}
          job={{ ...row, fit: row.fit }}
          reason={matchReason(row, skills)}
        />
      ))}
    </div>
  );

  // Low-fit roles are the least actionable of the three tiers and, on a real
  // resume with a broad skill list, usually the largest group by far —
  // collapsed by default (Direction C's own "C Matches" screen draws Low the
  // same way) so the page opens on the roles worth a look, not a wall of
  // noise. A native <details>/<summary> needs no client JS for this.
  if (tier === "low") {
    return (
      <details className="match-group match-group-low">
        <summary>{head}</summary>
        {list}
      </details>
    );
  }
  return (
    <div className="match-group">
      {head}
      {list}
    </div>
  );
}

export default function MatchesList({ scan, buckets, skills, quota }) {
  const total = buckets.strong.length + buckets.good.length + buckets.low.length;
  return (
    <div className="console-shell">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 className="rs-title">{total} matches</h1>
          <span style={{ fontSize: 12.5, color: "var(--text3)" }}>
            from {scan.filename} · scanned {fmtDate(scan.createdAt)}
          </span>
        </div>
        {quota.remaining > 0 && (
          <div className="ru-hint mono" style={{ marginTop: 0 }}>{quota.remaining} of {quota.quota} free scans left</div>
        )}
      </div>

      {total === 0 ? (
        <div className="empty-box">
          <div className="em-icon">🎯</div>
          <p>No matches found</p>
          <p style={{ color: "var(--text3)", marginTop: ".5rem", fontSize: ".9rem" }}>
            None of the live postings we checked share any of the {skills.length} skills on your
            resume. This can happen with a niche or very short skill list.
          </p>
        </div>
      ) : (
        <>
          <TierGroup tier="strong" rows={buckets.strong} skills={skills} />
          <TierGroup tier="good" rows={buckets.good} skills={skills} />
          <TierGroup tier="low" rows={buckets.low} skills={skills} />
        </>
      )}
    </div>
  );
}
