import { useEffect, useRef } from "react";
import Link from "next/link";
import InertButton from "@/components/InertButton";

// Shared by every modal-ish overlay in the resume flow: components/ResumeScan.jsx's
// replace-confirm and delete-confirm dialogs, and <UpgradePanel> below. One
// hook rather than three copies (review finding).
//
// `active` is the open/closed signal. It covers two different real shapes:
//  - ResumeScan's two dialogs stay mounted the whole time and toggle a
//    boolean prop (`replaceModalOpen`, `deleteStage !== "idle"`).
//  - <UpgradePanel> is conditionally mounted/unmounted instead, so it calls
//    this with a constant `active={true}` and relies on React always running
//    an effect's cleanup on unmount (not just on a dependency change) to get
//    the same "restore focus on close" behaviour for free.
// That is also why the trap/trigger-capture effect below depends only on
// `active` (never on `restoreKey`): a `restoreKey` change (e.g. the replace
// dialog moving from "confirm" to "scanning" to "error") must NOT tear down
// and re-run that effect, or its cleanup would restore focus to the ORIGINAL
// trigger mid-dialog, as if the whole thing had closed.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalFocusTrap(active, containerRef, restoreKey, onEscape) {
  const triggerRef = useRef(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  // Owns trigger capture, the Tab/Escape listener, and restoring focus —
  // exactly once per open/close, regardless of how many `restoreKey` values
  // the dialog passes through while it stays open.
  useEffect(() => {
    if (!active) return undefined;
    triggerRef.current = document.activeElement;

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusables = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el.getClientRects().length > 0
      );
      if (!focusables.length) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;
      // `activeEl === container` covers the instant after open, before the
      // user has tabbed anywhere: focus sits on the dialog itself (see the
      // effect below), which is not in `focusables` (tabIndex={-1}), so
      // without this a leading Shift+Tab would escape the trap backward.
      if (e.shiftKey && (activeEl === first || activeEl === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const trigger = triggerRef.current;
      triggerRef.current = null;
      trigger?.focus?.();
    };
  }, [active, containerRef]);

  // Moves focus into the dialog on open, and again whenever its content
  // changes shape under a still-open dialog (confirm -> scanning -> error),
  // so focus never lands on `document.body` because the button it was on
  // just unmounted.
  useEffect(() => {
    if (!active) return;
    containerRef.current?.focus();
  }, [active, restoreKey, containerRef]);
}

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
const CARDS = {
  // parseResume returns this reason for ANY non-PDF upload, not only Word
  // docs — a dropped PNG or a zero-byte file lands here too, and drag-and-
  // drop isn't gated by the file input's `accept` attribute. The headline
  // must therefore stay generic; the Word-to-PDF steps still belong in the
  // body since that's the single most common case.
  "not-pdf": {
    glyph: "✕", tone: "bad", tag: "Not scanned",
    title: "That file isn't a PDF",
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
  // The file passed the "%PDF-" sniff (so it isn't `not-pdf`) and still
  // failed to parse — a corrupt file or an encoding pdfjs doesn't support.
  // Not the outage card: this is a real property of the file the user sent.
  unreadable: {
    glyph: "✕", tone: "bad", tag: "Not scanned",
    title: "We couldn't read that PDF",
    body: "This PDF may be corrupted, or use an encoding we don't support. Re-exporting it from the original document usually fixes this — for example, printing to PDF again rather than re-uploading the same file.",
    cta: "Upload a different PDF",
  },
  scanner: {
    glyph: "↻", tone: "neutral", tag: "No scan used", tagTone: "ok",
    title: "Scanner is temporarily unavailable",
    body: "Something broke on our side, not with your file. Your free scans are untouched and your resume was not stored. Try again in a few minutes.",
    cta: "Try again",
  },
  // A session can expire mid-upload. Nothing was consumed and nothing about
  // the file is in question, so this gets the same neutral/"No scan used"
  // treatment as the outage card, not the red "Not scanned" one.
  "signed-out": {
    glyph: "↻", tone: "neutral", tag: "No scan used", tagTone: "ok",
    title: "Your session expired",
    body: "The scan was not started, and no free scan was used. Sign in again to continue.",
    cta: "Sign in again",
    href: { pathname: "/signin", query: { callbackUrl: "/resume" } },
  },
};
CARDS["too-many-pages"] = CARDS["too-large"];
CARDS.storage = CARDS.scanner;
CARDS["bad-request"] = CARDS.scanner;

// Any reason neither this table nor the route's contract anticipated.
// Neutral, not the red "Not scanned" treatment: that treatment asserts
// something specific about the user's file, which an unrecognised reason
// does not actually tell us — the honest default is "we don't know what
// happened, but it wasn't chargeable and it wasn't necessarily your file".
const FALLBACK = {
  glyph: "↻", tone: "neutral", tag: "No scan used", tagTone: "ok",
  title: "That scan didn't go through",
  body: "Something unexpected stopped the scan before it started. Your free scans are untouched — try again.",
  cta: "Try again",
};

export default function ResumeError({ reason, detail, filename, quota, onRetry, bare = false }) {
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
        {(filename || detail) && (
          <div className="re-detail mono">
            {filename && <span className="re-detail-file">{filename}</span>}
            {detail && <span className={`re-detail-text is-${card.tone}`}>{detail}</span>}
          </div>
        )}
        <div className="re-actions">
          {card.href ? (
            <Link href={card.href} className="re-cta">{card.cta}</Link>
          ) : (
            <button type="button" className="re-cta" onClick={onRetry}>{card.cta}</button>
          )}
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
  const cardRef = useRef(null);
  // See the hook's own comment: this component is mounted/unmounted rather
  // than toggled, so `active` is a constant `true` and the trap's cleanup —
  // which always runs on unmount — is what restores focus on close.
  useModalFocusTrap(true, cardRef, null, onDismiss);

  const content = (
    <div className="rs-upgrade-card" ref={cardRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Upgrade to Pro">
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
