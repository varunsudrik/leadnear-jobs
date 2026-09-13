import { DEMO_FIT } from "@/lib/demo-fit";

// Both /resume and /matches present numbers that look like findings. The
// resume score, its fixes and its keyword shares are fixtures
// (lib/demo-resume.js); the match tiers are a hash of the job slug
// (lib/demo-fit.js). On /matches those tiers are attached to real, named
// employers and their real postings, and most of the cohort is labelled as
// having little overlap with what the posting asks for. Nothing else on either
// screen says the ranking is not real — and both are reachable from the nav,
// the hero, the footer and the header pips.
//
// So each screen opens with one line saying so. It is gated on the same switch
// as the content it describes: with NEXT_PUBLIC_DEMO_FIT=false there are no
// fabricated values left to disclaim, and DemoOffPanel says so instead.
export default function DemoDisclosure() {
  if (!DEMO_FIT) return null;
  return (
    <p className="demo-disclosure">
      Demo screen: no resume was read. Every score and ranking here is a
      placeholder, not a real assessment of anyone or of these roles.
    </p>
  );
}
