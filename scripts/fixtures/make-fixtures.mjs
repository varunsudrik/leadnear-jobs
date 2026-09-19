// Hand-built minimal PDFs so the fixtures are reviewable text, not opaque
// binaries checked into the repo.
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TWO_COLUMN_HTML } from "./two-column-template.mjs";
import { NO_PERIODS_HTML } from "./no-periods-template.mjs";

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

// --- Two-column fixture, rendered with headless Chrome -------------------
// The hand-built `pdf()` above emits one Tj per line in top-to-bottom order,
// which can never reproduce the real defect: a genuine two-column PDF whose
// content stream lists text in DOM/row order, not visual reading order. A
// resume template that lays out side-by-side categories as a <table> (a
// common pattern in real resume-builder output) does that naturally - each
// row's left and right cells are adjacent in the content stream - and is
// exactly what welded "...reusable serviceFRONTEND" together in production
// (see docs/superpowers/.../parser-evidence.md). Chrome's print-to-PDF is
// used to get real pdfjs position data instead of hand-rolling PDF operators
// that wouldn't exercise the same code path. The HTML itself lives in
// two-column-template.mjs so tests can import it and count its <li>
// elements without re-running this generator as a side effect.
const CHROME_PATH = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function renderPdfWithChrome(html, outPath) {
  const dir = mkdtempSync(join(tmpdir(), "resume-fixture-"));
  const htmlPath = join(dir, "source.html");
  writeFileSync(htmlPath, html, "utf8");
  try {
    execFileSync(CHROME_PATH, [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--no-pdf-header-footer",
      `--print-to-pdf=${outPath}`,
      `file://${htmlPath}`,
    ], { stdio: "pipe" });
    return true;
  } catch (error) {
    console.warn(`Skipping headless-Chrome fixture (${outPath}): ${error.message}`);
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

renderPdfWithChrome(TWO_COLUMN_HTML, here("resume-two-column.pdf").pathname);
console.log("two-column fixture written (or skipped if Chrome is unavailable)");

// --- No-periods fixture, rendered with headless Chrome -------------------
// A permanent regression test for the wrap-merge fix: five independent
// achievement bullets, none ending in terminal punctuation, all at uniform
// line-height - a resume that defeats both the punctuation and y-gap
// continuation signals at once and relies entirely on the right-edge
// signal (lib/resume/format-checks.mjs's makeRightEdgeLookup) to tell that
// none of them actually wrap. The HTML lives in no-periods-template.mjs so
// tests can import NO_PERIODS_HTML and count its <li> elements directly.
renderPdfWithChrome(NO_PERIODS_HTML, here("resume-no-periods.pdf").pathname);
console.log("no-periods fixture written (or skipped if Chrome is unavailable)");
