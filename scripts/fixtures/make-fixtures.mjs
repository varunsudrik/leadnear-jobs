// Hand-built minimal PDFs so the fixtures are reviewable text, not opaque
// binaries checked into the repo.
import { writeFileSync } from "node:fs";

const LINES = [
  "ARJUN MEHTA",
  "Bengaluru, India | arjun.mehta@mail.com | +91 98000 00000 | linkedin.com/in/arjunmehta",
  "SUMMARY",
  "Backend engineer with 7 years building distributed systems in Go and Python.",
  "SKILLS",
  "Languages and tools include Go, Python, PostgreSQL, Redis and Terraform across several teams.",
  "EXPERIENCE",
  "Northwind Labs - Senior Engineer   Jan 2022 - Present",
  "- Worked on the ingestion pipeline and improved performance",
  "- Responsible for the internal API gateway",
  "- Reduced p99 latency from 480ms to 190ms across 12 services",
  "Solvent - Backend Engineer   Jun 2019 - Dec 2021",
  "- Owned the Redis caching layer",
];

// `pages` repeats the page object N times, all sharing one content stream
// and font — enough to make numPages > 1 without needing N distinct
// content streams. Defaults to 1, which reproduces the original single-page
// layout exactly (object numbers 1-5, same as before this parameter existed).
function pdf(lines, { pages = 1 } = {}) {
  const content = lines
    .map((t, i) => `BT /F1 11 Tf 40 ${740 - i * 18} Td (${t.replace(/[()\\]/g, "")}) Tj ET`)
    .join("\n");

  const pageCount = Math.max(1, pages);
  const contentObjNum = 3 + pageCount;
  const fontObjNum = contentObjNum + 1;
  const pageObjs = Array.from(
    { length: pageCount },
    () => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >>`
  );
  const kids = pageObjs.map((_, i) => `${3 + i} 0 R`).join(" ");

  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
    ...pageObjs,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

const here = (n) => new URL(n, import.meta.url);
writeFileSync(here("resume-normal.pdf"), pdf(LINES), "latin1");
// No text operators at all: stands in for a scanned or screenshotted page.
writeFileSync(here("resume-image-only.pdf"), pdf([]), "latin1");
// One more page than LIMITS.maxPages (10): exercises the too-many-pages guard.
writeFileSync(here("resume-too-many-pages.pdf"), pdf([], { pages: 11 }), "latin1");
console.log("fixtures written");
