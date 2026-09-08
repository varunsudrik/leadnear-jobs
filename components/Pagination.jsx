"use client";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";

export default function Pagination({ total, pageSize = 20 }) {
  const sp       = useSearchParams();
  const pathname = usePathname();
  const page     = parseInt(sp.get("page") || "1");
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const href = (n) => {
    const next = new URLSearchParams(sp.toString());
    next.delete("token");
    next.set("page", n);
    return `${pathname}?${next.toString()}`;
  };

  const delta = 2;
  const range = [];
  for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) range.push(i);

  return (
    <nav className="pagination" aria-label="Pagination">
      {page > 1 && <Link href={href(page - 1)} className="page-btn">← Prev</Link>}

      {range[0] > 1 && (
        <>
          <Link href={href(1)} className="page-btn">1</Link>
          {range[0] > 2 && <span style={{ color: "var(--text3)", padding: "0 .25rem" }}>…</span>}
        </>
      )}

      {range.map((n) => (
        <Link key={n} href={href(n)} className={`page-btn${n === page ? " active" : ""}`}>{n}</Link>
      ))}

      {range[range.length - 1] < totalPages && (
        <>
          {range[range.length - 1] < totalPages - 1 && (
            <span style={{ color: "var(--text3)", padding: "0 .25rem" }}>…</span>
          )}
          <Link href={href(totalPages)} className="page-btn">{totalPages}</Link>
        </>
      )}

      {page < totalPages && <Link href={href(page + 1)} className="page-btn">Next →</Link>}
    </nav>
  );
}
