import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseResume, LIMITS } from "../lib/resume/parse.mjs";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url));

// A normal text PDF parses into numbered lines.
const ok = await parseResume(fx("resume-normal.pdf"), "resume-normal.pdf");
assert.equal(ok.ok, true);
assert.ok(ok.pages >= 1 && ok.pages <= 10);
assert.ok(ok.lines.length > 5, "expected several extracted lines");
assert.equal(ok.lines[0].n, 1, "line numbers are 1-based");
assert.ok(/ARJUN MEHTA/.test(ok.text), "expected the fixture's own content");

// The positional contract: every line carries x (indentation), x2 (right
// edge - did this line run out of room and wrap?), h (font height) and page
// in addition to the original {n, text}, so Tasks 3/5/8's {n, text}
// consumers keep working unchanged while format-checks can use the new
// fields.
for (const l of ok.lines) {
  assert.equal(typeof l.n, "number");
  assert.equal(typeof l.text, "string");
  assert.equal(typeof l.x, "number", `line ${l.n} missing x`);
  assert.equal(typeof l.x2, "number", `line ${l.n} missing x2`);
  assert.ok(l.x2 >= l.x, `line ${l.n} right edge must not be left of its own start`);
  assert.equal(typeof l.h, "number", `line ${l.n} missing h`);
  assert.equal(typeof l.page, "number", `line ${l.n} missing page`);
}
// resume-normal.pdf's bullets carry a literal "-" glyph at the same x as
// every other line (see make-fixtures.mjs), so this fixture predates and is
// unaffected by indentation-based bullet detection.
assert.ok(ok.lines.every((l) => l.x === ok.lines[0].x), "single-column fixture has one consistent left margin");

// A two-column PDF (rendered with headless Chrome from a <table>-based
// layout - the layout that actually produces the real defect, since its
// content stream lists text in row/DOM order, not visual order) must never
// interleave the columns: no line may weld text from both sides together,
// and the whole left column must be read before any of the right column.
const twoCol = await parseResume(fx("resume-two-column.pdf"), "resume-two-column.pdf");
assert.equal(twoCol.ok, true);
const welded = twoCol.lines.filter((l) => /BACKEND.*FRONTEND|DATABASES.*DEVOPS|service.*FRONTEND/i.test(l.text));
assert.equal(welded.length, 0, `expected no column-welded lines, got: ${JSON.stringify(welded)}`);
const frontendIdx = twoCol.lines.findIndex((l) => l.text === "FRONTEND");
const lastLeftIdx = twoCol.lines.findIndex((l) => l.text === "PostgreSQL MongoDB Redis");
assert.ok(frontendIdx > 0 && lastLeftIdx > 0, "expected both column markers in the reconstructed lines");
assert.ok(frontendIdx > lastLeftIdx, "the left column must be read in full before the right column starts");
// The same real defect, demonstrated directly: flat mergePages extraction
// welds the two columns' headings onto one line; this must fail if the
// extraction regresses back to that behaviour.
assert.ok(!twoCol.text.includes("BACKEND FRONTEND"), "must not reproduce the flat-extraction column weld");

// An image-only PDF is a FINDING, not a crash: no ATS could read it either.
const img = await parseResume(fx("resume-image-only.pdf"), "resume-image-only.pdf");
assert.equal(img.ok, false);
assert.equal(img.reason, "no-text");

// Rejected on content, not extension: a renamed .docx must not get through.
const docx = await parseResume(Buffer.from("PK not a pdf at all"), "cv.pdf");
assert.equal(docx.ok, false);
assert.equal(docx.reason, "not-pdf");

// Oversize is rejected before any parsing work happens.
const big = await parseResume(Buffer.alloc(LIMITS.maxBytes + 1), "big.pdf");
assert.equal(big.ok, false);
assert.equal(big.reason, "too-large");

// Too many pages is rejected before extraction, once the page count is known.
const many = await parseResume(fx("resume-too-many-pages.pdf"), "resume-too-many-pages.pdf");
assert.equal(many.ok, false);
assert.equal(many.reason, "too-many-pages");

// Never throws, whatever it is handed. A zero-byte or missing upload is a
// client error, not a server fault, so both pin to "not-pdf" (not
// "unreadable", which is reserved for a real parse failure).
const empty = await parseResume(Buffer.alloc(0), "empty.pdf");
assert.equal(empty.ok, false);
assert.equal(empty.reason, "not-pdf");
const nothing = await parseResume(null, "");
assert.equal(nothing.ok, false);
assert.equal(nothing.reason, "not-pdf");

console.log("resume-parse ok");
