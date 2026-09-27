import JobCard from "@/components/JobCard";
import { cardReason } from "@/lib/resume/match.mjs";
import { fmtDate } from "@/lib/format.mjs";

const TIER_LABEL = { strong: "Strong", good: "Good", low: "Low" };
// Low is collapsed and the least actionable tier; rendering all of it made the
// page ~590 KB of HTML on staging. The count still shows the full number.
const LOW_SHOWN = 40;

function TierGroup({ tier, rows }) {
  if (!rows.length) return null;
  const shown = tier === "low" ? rows.slice(0, LOW_SHOWN) : rows;
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
      {shown.map((row) => (
        <JobCard
          key={row.db_id}
          job={{ ...row, fit: row.fit }}
          reason={cardReason(row)}
        />
      ))}
      {shown.length < rows.length && (
        <p style={{ color: "var(--text3)", fontSize: ".85rem", margin: ".5rem 0 0" }}>
          {rows.length - shown.length} more low matches not shown.
        </p>
      )}
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
    return "Matching isn't ready yet: job skills are still being prepared. Your scan is saved, and matches will appear here once they are.";
  }
  if (!skills.length) {
    const n = unknownSkills.length;
    return `None of the ${n} skill${n === 1 ? "" : "s"} on your resume are in our skills list yet, so there is nothing to rank against.`;
  }
  return `None of the live postings list any of the ${skills.length} skills we recognised on your resume.`;
}

// `capped`: more jobs share the resume's skills than the ranking fetched, so
// the list is the top of them and the header says so, with the full count.
export default function MatchesList({ scan, buckets, skills, unknownSkills = [], available = true, candidateTotal = 0, capped = false, quota }) {
  const total = buckets.strong.length + buckets.good.length + buckets.low.length;
  return (
    <div className="console-shell">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 className="rs-title">{capped ? `Top ${total} matches` : `${total} matches`}</h1>
          <span style={{ fontSize: 12.5, color: "var(--text3)" }}>
            from {scan.filename} · scanned {fmtDate(scan.createdAt)} · {skills.length} skills recognised
            {capped ? ` · ${candidateTotal.toLocaleString()} jobs share your skills` : ""}
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
