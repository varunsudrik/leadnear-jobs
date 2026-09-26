// lib/pagination.mjs — which page numbers the pager shows.
//
// A sliding window of up to PAGE_WINDOW consecutive pages around the current
// one, modelled on naukri.com's pager: page 2 of 12 shows 1-10, page 12 of 34
// shows 8-17, the last page shows the final ten. Pure, so it is tested
// directly (scripts/test-pagination.mjs); components/Pagination.jsx renders it.
export const PAGE_WINDOW = 10;

export function pageWindow(page, totalPages, size = PAGE_WINDOW) {
  const total = Math.max(1, Math.floor(Number(totalPages)) || 1);
  const current = Math.min(Math.max(1, Math.floor(Number(page)) || 1), total);
  const count = Math.min(Math.max(1, size), total);
  // Four pages before the current one and five after (for a window of ten),
  // shifted to stay inside [1, total].
  const start = Math.min(Math.max(1, current - Math.floor((count - 1) / 2)), total - count + 1);
  return Array.from({ length: count }, (_, i) => start + i);
}
