// The only module that knows what a PDF is. Everything downstream sees text
// and numbered lines.
//
// Never throws: callers are user-facing and must distinguish "your file is a
// picture" (a real finding about the resume) from "our parser broke" (our
// problem, and not chargeable to the user's quota).
import { extractTextItems, getDocumentProxy } from "unpdf";

export const LIMITS = { maxBytes: 2000000, maxPages: 10 };

// --- Layout reconstruction --------------------------------------------------
// A PDF has no notion of "line" or "column" - pdfjs only hands back
// positioned glyph runs (`transform = [a,b,c,d,x,y]`, `fontName`, `width`,
// `height`). `extractText({mergePages:true})` used to read those off in
// whatever order the content stream happened to emit them, which for a
// two-column resume interleaves the columns mid-sentence: a left-column
// bullet gets a right-column heading welded onto it
// ("...reusable serviceFRONTEND"). It also throws away indentation, so a
// bulleted achievement line looks identical to a section heading.
//
// This reconstructs lines the way github.com/xitanggg/open-resume does (same
// technique, no shared dependency): cluster each page's items into 1 or 2
// columns by x, read each column top-to-bottom, and join items into lines by
// y so a wrapped sentence comes back as one line instead of one row per
// glyph run. See docs/superpowers/... parser-evidence.md for the measurements
// this is based on.
const Y_TOLERANCE = 2; // pt; items within this of each other are one visual line
const COLUMN_GAP_MIN = 60; // pt; a real column gap, well above a bullet's indent
const COLUMN_MIN_ITEMS = 4; // both sides of a gap need real content, not one stray item
const SPACE_GAP_MIN = 1; // pt; bigger than kerning inside one glyph run

// Two clusters of x, or one if there's no gap wide enough (and populated
// enough on both sides) to be a second column rather than noise.
function detectColumnBoundary(items) {
  if (items.length < COLUMN_MIN_ITEMS * 2) return null;
  const xs = items.map((it) => it.x).sort((a, b) => a - b);
  let bestGap = 0, bestIdx = -1;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (gap > bestGap) { bestGap = gap; bestIdx = i; }
  }
  if (bestIdx < 0 || bestGap < COLUMN_GAP_MIN) return null;
  if (bestIdx < COLUMN_MIN_ITEMS || xs.length - bestIdx < COLUMN_MIN_ITEMS) return null;
  return (xs[bestIdx - 1] + xs[bestIdx]) / 2;
}

// Items on the same visual row, top to bottom then left to right within the row.
function groupIntoLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(item.y - last.y) <= Y_TOLERANCE) last.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines;
}

// Concatenate a line's glyph runs, inserting a space only where the x-gap
// between runs implies one (and not doubling up one already in the text).
function joinLine(items) {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let text = "";
  let prevRight = null;
  for (const item of sorted) {
    if (prevRight !== null) {
      const gap = item.x - prevRight;
      if (gap > SPACE_GAP_MIN && !text.endsWith(" ") && !item.str.startsWith(" ")) text += " ";
    }
    text += item.str;
    prevRight = item.x + item.width;
  }
  return text.replace(/[ \t]+/g, " ").trim();
}

// One page's positioned items -> ordered lines with the position data
// downstream needs: x (indentation => bullet), x2 (right edge => did this
// line run out of room and wrap, regardless of punctuation or line
// spacing?), h (hierarchy => heading), y (line-to-line spacing => where one
// bullet ends and the next begins) and col (which of this page's 1-2
// columns the line belongs to, so a consumer can group lines by their OWN
// column's margin instead of re-deriving column membership from x values
// alone, which is exactly what let a right-column line get measured against
// the left column's margin).
function reconstructPage(rawItems) {
  // pdfjs (and Chrome's own PDF export) emit zero-width placeholder items
  // (e.g. end-of-line markers) with no visible content; they carry no
  // position signal worth keeping.
  const items = rawItems.filter((it) => it.str && it.str.trim() && it.width > 0);
  if (!items.length) return [];

  const boundary = detectColumnBoundary(items);
  const columns = boundary === null
    ? [items]
    : [items.filter((it) => it.x < boundary), items.filter((it) => it.x >= boundary)];

  const out = [];
  columns.forEach((colItems, col) => {
    if (!colItems.length) return;
    for (const line of groupIntoLines(colItems)) {
      const text = joinLine(line.items);
      if (!text) continue;
      out.push({
        text,
        x: Math.min(...line.items.map((it) => it.x)),
        x2: Math.max(...line.items.map((it) => it.x + it.width)),
        h: Math.max(...line.items.map((it) => it.height || 0)),
        y: line.y,
        col,
      });
    }
  });
  return out;
}

export async function parseResume(buffer, filename = "") {
  if (!buffer || buffer.length === 0) {
    // A zero-byte or missing upload is a client error, not a server fault:
    // it genuinely is not a PDF, so it stays within the five contractual
    // reason values and maps to the same 422 as the other client-side
    // rejections instead of a 500.
    return { ok: false, reason: "not-pdf", detail: "empty file" };
  }
  if (buffer.length > LIMITS.maxBytes) {
    return { ok: false, reason: "too-large", detail: `${(buffer.length / 1e6).toFixed(1)} MB` };
  }
  // Sniff the magic bytes. The extension is caller-controlled, so a renamed
  // .docx must not reach the parser.
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { ok: false, reason: "not-pdf", detail: filename.split(".").pop() || "unknown" };
  }

  let pages, lines;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    pages = pdf.numPages;
    if (pages > LIMITS.maxPages) {
      return { ok: false, reason: "too-many-pages", detail: `${pages} pages` };
    }
    const { items: pageItems } = await extractTextItems(pdf);
    lines = [];
    let n = 0;
    pageItems.forEach((rawItems, pageIdx) => {
      for (const line of reconstructPage(rawItems)) {
        n += 1;
        lines.push({ n, text: line.text, x: line.x, x2: line.x2, h: line.h, page: pageIdx + 1, y: line.y, col: line.col });
      }
    });
  } catch (error) {
    return { ok: false, reason: "unreadable", detail: error.message };
  }

  const cleaned = lines.map((l) => l.text).join("\n");
  // An image-only PDF yields nothing to reconstruct. That is a finding, not
  // a failure: every ATS receiving it reads nothing either.
  if (cleaned.trim().length < 40) {
    return { ok: false, reason: "no-text", detail: `0 characters extracted from ${pages} pages` };
  }

  return { ok: true, text: cleaned, pages, lines };
}
