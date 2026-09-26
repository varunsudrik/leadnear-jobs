"use client";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageWindow } from "@/lib/pagination.mjs";

// Numbered pager, centred — Previous · up to ten page numbers · Next — with
// the range ("21–40 of 234 jobs", mono) beneath it. Modelled on naukri.com so a
// viewer can jump straight to a page. This replaces Direction C's two bare
// arrows (spec line 103), which only ever moved one page at a time.
//
// Renders whenever there are results at all: on a single page the range still
// tells you the count.

// Where space is short only the pages within this distance of the current one
// show ("far" are hidden); on the narrowest screens the "edge" ones go too.
const NEAR = 2;

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

  // At an edge Previous/Next become real disabled <button>s, not styled-dead
  // <Link>s: they must not be focusable and must not navigate.
  const step = (targetPage, enabled, label, children) =>
    enabled ? (
      <Link href={href(targetPage)} className="pager-step" aria-label={label}>{children}</Link>
    ) : (
      <button type="button" className="pager-step" disabled aria-label={label}>{children}</button>
    );

  return (
    <nav className="pager" aria-label="Pagination">
      <div className="pager-controls">
        {step(page - 1, page > 1, "Previous page", (
          <>
            <ChevronLeft size={16} aria-hidden="true" />
            <span className="pager-step-label">Previous</span>
          </>
        ))}
        {totalPages > 1 && pageWindow(page, totalPages).map((n) => {
          const distance = Math.abs(n - page);
          const far = distance > NEAR ? " far" : distance === NEAR ? " edge" : "";
          return n === page ? (
            <span key={n} className={`pager-num current${far}`} aria-current="page">{n}</span>
          ) : (
            <Link key={n} href={href(n)} className={`pager-num${far}`} aria-label={`Page ${n}`}>{n}</Link>
          );
        })}
        {step(page + 1, page < totalPages, "Next page", (
          <>
            <span className="pager-step-label">Next</span>
            <ChevronRight size={16} aria-hidden="true" />
          </>
        ))}
      </div>
      {/* En-dash (U+2013) between the bounds, per the design. */}
      <span className="pager-range">{first}–{last} of {total.toLocaleString()} jobs</span>
    </nav>
  );
}
