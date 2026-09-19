"use client";
import Link from "next/link";

// The hero's two CTAs (spec lines 72-74). Extracted from components/HomeHero.jsx
// purely so that file can stay a server component.
//
// Resume scanning is real (Task 2-8), so both CTAs are plain links to it.
// This used to branch on the old fit-layer's on/off switch: with that layer
// off there was no resume-scan screen to send anyone to, so it fell back to
// an inert button plus a note. That switch, and the rest of the fabricated
// fit layer, are retired now — /resume always works, so the inert fallback
// no longer has a reason to exist.
export default function HomeHeroCta() {
  return (
    <div className="hh-cta">
      <Link href="/resume" className="hh-cta-primary">Upload resume</Link>
      <Link href="/resume" className="hh-cta-ghost">How scoring works</Link>
    </div>
  );
}
