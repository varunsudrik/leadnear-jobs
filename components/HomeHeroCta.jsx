"use client";
import { useState } from "react";

// The hero's two CTAs (spec lines 72-74). Extracted from components/HomeHero.jsx
// purely so that file can stay a server component: this is the only part of
// the hero that needs state.
//
// Both are inert — resume scanning is not built. They used to carry
// aria-disabled plus a `title` and no handler, which is fine with a mouse and
// silent on touch: `title` has no tooltip on a phone, and at 640px the primary
// CTA is full-width, 46px tall and the hero's only call to action, so tapping
// it did nothing with no way to find out why.
//
// The approved decision was "aria-disabled with a title explaining scoring
// isn't live". The title WAS the explanation; this just makes the same
// explanation reachable by tap. Because they now respond, aria-disabled comes
// off — a control that answers you is not disabled — and cursor: pointer plus
// the mock's :hover states become honest rather than the lie the old
// cursor: default comment warned about. `title` stays for pointer users.
//
// Still no `disabled` attribute: it suppresses the tooltip and drops the
// control out of the tab order, and these must measure exactly like the mock's
// live buttons.
const NOT_LIVE = "Resume scoring isn't live yet";

export default function HomeHeroCta() {
  const [note, setNote] = useState("");

  return (
    <div className="hh-cta">
      <button type="button" className="hh-cta-primary" title={NOT_LIVE} onClick={() => setNote(NOT_LIVE)}>
        Upload resume
      </button>
      <button type="button" className="hh-cta-ghost" title={NOT_LIVE} onClick={() => setNote(NOT_LIVE)}>
        How scoring works
      </button>
      {/* Always rendered, never display:none, so it is in the accessibility
          tree before the text lands in it — a live region that appears at the
          same moment as its content is not reliably announced. Empty it has no
          line box and no margin, so idle layout is byte-identical to before. */}
      <p className="hh-cta-note" role="status" aria-live="polite">{note}</p>
    </div>
  );
}
