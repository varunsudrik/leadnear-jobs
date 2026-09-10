"use client";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";

// Direction C's pager (spec line 103): the range on the left in mono, two
// round arrows on the right. The numbered page list the old pager rendered
// does not appear anywhere in the design.
//
// Unlike the old one, this renders whenever there are results at all rather
// than only past page 2 — the range reading "1-20 of 128,431" is the point of
// the row, and on a single-page result set it still tells you the count.
export default function Pagination({ total, pageSize = 20 }) {
  const sp = useSearchParams();
  const pathname = usePathname();

  if (!total) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Clamp the parsed page to [1, totalPages]. A stale bookmark or hand-edited
  // URL might carry a page beyond the end; clamping keeps the range coherent
  // instead of letting it invert (e.g. first=101, last=100 when page > totalPages).
  const page = Math.max(1, Math.min(parseInt(sp.get("page") || "1", 10) || 1, totalPages));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const href = (n) => {
    const next = new URLSearchParams(sp.toString());
    next.delete("token");
    next.set("page", String(n));
    return `${pathname}?${next.toString()}`;
  };

  // At an edge the arrow becomes a real disabled <button>, not a styled-dead
  // <Link>: it must not be focusable and must not navigate.
  const arrow = (targetPage, enabled, label, glyph) =>
    enabled ? (
      <Link href={href(targetPage)} className="pager-btn" aria-label={label}>{glyph}</Link>
    ) : (
      <button type="button" className="pager-btn" disabled aria-label={label}>{glyph}</button>
    );

  return (
    <nav className="pager" aria-label="Pagination">
      {/* En-dash (U+2013) between the bounds, per the design. */}
      <span className="pager-range">{first}–{last} of {total.toLocaleString()}</span>
      <div className="pager-arrows">
        {arrow(page - 1, page > 1, "Previous page", "‹")}
        {arrow(page + 1, page < totalPages, "Next page", "›")}
      </div>
    </nav>
  );
}
