import Link from "next/link";
import InertButton from "@/components/InertButton";

// C Resume Errors (spec lines 572-606). The design shows all four cards
// side by side "for comparison" (its own caption says so) — that is a
// design-system demo, not a real state: an actual scan attempt fails for
// exactly one reason, so this renders a single card for the given `reason`.
//
// too-large and too-many-pages share a card (both are "too big to read");
// scanner, storage and bad-request share the outage card, whose green
// "No scan used" tag is the literal promise the scan route keeps — no
// request that reaches these reasons ever writes a scan row. "quota" is not
// a card here at all: it hands off to <UpgradePanel>, matching C Upgrade.
//
// Anything else (e.g. "unreadable", or a reason this UI does not know about)
// falls back to a generic, honest card rather than guessing — never a blank
// screen, never a fabricated specific claim.
const CARDS = {
  "not-pdf": {
    glyph: "✕", tone: "bad", tag: "Not scanned",
    title: "That file is a Word document",
    body: "We only read PDF, because that is what most ATS software receives. In Word, choose File → Save as → PDF, then upload the PDF.",
    cta: "Upload a PDF instead",
  },
  "too-large": {
    glyph: "✕", tone: "bad", tag: "Not scanned",
    title: "That file is too big to read",
    body: "The limit is 2 MB and 10 pages. Large files are usually scanned images or embedded graphics, which an ATS cannot read either. Export a text-based PDF and try again.",
    cta: "Upload a smaller PDF",
  },
  "no-text": {
    glyph: "!", tone: "warn", tag: "Worth fixing",
    title: "No readable text in this PDF",
    body: "This file is a picture of a resume, not text. An ATS receiving it reads nothing and scores you zero, so this is a real finding rather than an upload problem. Export from your original document instead of scanning or screenshotting it.",
    cta: "Upload a text-based PDF",
  },
  scanner: {
    glyph: "↻", tone: "neutral", tag: "No scan used", tagTone: "ok",
    title: "Scanner is temporarily unavailable",
    body: "Something broke on our side, not with your file. Your free scans are untouched and your resume was not stored. Try again in a few minutes.",
    cta: "Try again",
  },
};
CARDS["too-many-pages"] = CARDS["too-large"];
CARDS.storage = CARDS.scanner;
CARDS["bad-request"] = CARDS.scanner;

const FALLBACK = {
  glyph: "✕", tone: "bad", tag: "Not scanned",
  title: "That file could not be read",
  body: "Something about this file stopped the scan before it started. Your free scans are untouched — try a different export of the same resume.",
  cta: "Try again",
};

export default function ResumeError({ reason, detail, quota, onRetry, bare = false }) {
  if (reason === "quota") return <UpgradePanel quota={quota} bare={bare} />;

  const card = CARDS[reason] || FALLBACK;
  const content = (
    <div className="re-row">
      <span className={`re-icon is-${card.tone}`}>{card.glyph}</span>
      <div className="re-main">
        <div className="re-head">
          <span className="re-title">{card.title}</span>
          <span className={`re-tag is-${card.tagTone || card.tone}`}>{card.tag}</span>
        </div>
        <div className="re-body">{card.body}</div>
        {detail && <div className="re-detail mono">{detail}</div>}
        <div className="re-actions">
          <button type="button" className="re-cta" onClick={onRetry}>{card.cta}</button>
        </div>
      </div>
    </div>
  );

  if (bare) return content;
  return <div className="re-card">{content}</div>;
}

// C Upgrade (spec lines 401-420). Presentational only — "Start Pro" is an
// InertButton because there is no payment wiring in this plan; "Not now"
// is a real link back to matches, because that page exists and works.
export function UpgradePanel({ quota, onDismiss, bare = false }) {
  const used = quota?.used ?? quota?.quota ?? 3;
  const total = quota?.quota ?? 3;
  const content = (
    <div className="rs-upgrade-card">
      <div className="rs-upgrade-head">
        <div className="rs-upgrade-pips">{used} of {total} free scans used</div>
        <h2 className="rs-upgrade-title">This scan needs Pro.</h2>
        <p className="rs-upgrade-sub">
          Your matches, saved jobs and search stay free. Pro removes the scan limit and turns on auto-apply.
        </p>
      </div>
      <div className="rs-upgrade-plans">
        <div className="rs-upgrade-plan">
          <div className="rs-upgrade-plan-name">Free</div>
          <div className="rs-upgrade-plan-price">$0</div>
          <ul>
            <li>3 ATS scans total</li>
            <li>Roles ranked by fit</li>
            <li>Saved jobs and weekly alerts</li>
            <li className="is-muted">No auto-apply</li>
          </ul>
        </div>
        <div className="rs-upgrade-plan is-pro">
          <div className="rs-upgrade-plan-name">Pro</div>
          <div className="rs-upgrade-plan-price">$9<span> /month</span></div>
          <ul>
            <li>Unlimited scans and rescans</li>
            <li>Matches refreshed daily</li>
            <li>Auto-apply, up to 50 per week</li>
            <li>Tailored cover letters, instant alerts</li>
          </ul>
        </div>
      </div>
      <div className="rs-upgrade-foot">
        {onDismiss ? (
          <button type="button" className="rs-upgrade-back" onClick={onDismiss}>Not now, keep current scan</button>
        ) : (
          <Link href="/matches" className="rs-upgrade-back">Not now, back to matches</Link>
        )}
        <div className="rs-upgrade-buy inert-note-row">
          <span className="rs-upgrade-cancel">Cancel any time</span>
          <InertButton className="rs-upgrade-cta" note="Upgrading isn't live yet">Start Pro · $9/mo</InertButton>
        </div>
      </div>
    </div>
  );

  if (bare) return content;
  return (
    <div className="rs-upgrade-overlay">
      {content}
    </div>
  );
}
