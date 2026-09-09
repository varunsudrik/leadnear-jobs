// Single source of truth for the split-pane preview's "hide below this
// width" breakpoint (Task 8; Fix round 1 of the task-7-8 review). The
// declared value lives in app/globals.css as the --preview-breakpoint
// custom property on :root — see the comment there and on the @media rule
// it backs (CSS media queries can't reference custom properties, so that
// rule still needs its own literal, kept equal to this by hand).
//
// Both app/JobsSplitView.jsx (gates JobCard's selected/onSelect props and
// whether <JobPreview> renders at all) and components/JobPreview.jsx (skips
// its own fetch effect when it happens to mount on a narrow viewport — see
// the comment there) read the breakpoint through this one function instead
// of each hardcoding their own literal that could silently drift from the
// CSS or from each other.
export const PREVIEW_BREAKPOINT_FALLBACK_PX = 900;

export function getPreviewBreakpointQuery() {
  if (typeof window === "undefined") {
    return `(max-width: ${PREVIEW_BREAKPOINT_FALLBACK_PX}px)`;
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--preview-breakpoint")
    .trim();
  return `(max-width: ${raw || `${PREVIEW_BREAKPOINT_FALLBACK_PX}px`})`;
}
