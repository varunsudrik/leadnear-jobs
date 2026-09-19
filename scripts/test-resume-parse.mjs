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
