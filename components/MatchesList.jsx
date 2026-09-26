import JobCard from "@/components/JobCard";
import { cardReason } from "@/lib/resume/match.mjs";
import { fmtDate } from "@/lib/format";

const TIER_LABEL = { strong: "Strong", good: "Good", low: "Low" };

function TierGroup({ tier, rows }) {
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
          reason={cardReason(row)}
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

// Why there is nothing to show, in the order a viewer can act on it.
function emptyReason({ available, skills, unknownSkills }) {
  if (!available) {
    return "Job skills have not been extracted on this database yet. Your scan is saved; matches appear once they are.";
  }
  if (!skills.length) {
    const n = unknownSkills.length;
    return `None of the ${n} skill${n === 1 ? "" : "s"} on your resume are in our skills list yet, so there is nothing to rank against.`;
  }
  return `None of the live postings list any of the ${skills.length} skills we recognised on your resume.`;
}

export default function MatchesList({ scan, buckets, skills, unknownSkills = [], available = true, quota }) {
  const total = buckets.strong.length + buckets.good.length + buckets.low.length;
  return (
    <div className="console-shell">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 className="rs-title">{total} matches</h1>
          <span style={{ fontSize: 12.5, color: "var(--text3)" }}>
            from {scan.filename} · scanned {fmtDate(scan.createdAt)} · {skills.length} skills recognised
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
            {emptyReason({ available, skills, unknownSkills })}
          </p>
        </div>
      ) : (
        <>
          <TierGroup tier="strong" rows={buckets.strong} />
          <TierGroup tier="good" rows={buckets.good} />
          <TierGroup tier="low" rows={buckets.low} />
        </>
      )}
    </div>
  );
}
