import assert from "node:assert/strict";
import { PAGE_WINDOW, pageWindow } from "../lib/pagination.mjs";

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

assert.equal(PAGE_WINDOW, 10);
// Near the start the window is anchored at page 1 (naukri: page 2 shows 1-10).
assert.deepEqual(pageWindow(1, 12), range(1, 10));
assert.deepEqual(pageWindow(2, 12), range(1, 10));
assert.deepEqual(pageWindow(5, 12), range(1, 10));
// In the middle it slides: four pages before the current one, five after.
assert.deepEqual(pageWindow(6, 12), range(2, 11));
assert.deepEqual(pageWindow(12, 34), range(8, 17));
// At the end it is anchored at the last page.
assert.deepEqual(pageWindow(34, 34), range(25, 34));
assert.deepEqual(pageWindow(31, 34), range(25, 34));
// Fewer pages than the window: all of them.
assert.deepEqual(pageWindow(3, 4), range(1, 4));
assert.deepEqual(pageWindow(1, 1), [1]);
// Out-of-range and garbage input is clamped, never an empty or inverted list.
assert.deepEqual(pageWindow(99, 5), range(1, 5));
assert.deepEqual(pageWindow(0, 5), range(1, 5));
assert.deepEqual(pageWindow(NaN, 5), range(1, 5));
assert.deepEqual(pageWindow(3, 0), [1]);
// A custom window size (the pager's phone layout shows fewer).
assert.deepEqual(pageWindow(10, 20, 5), range(8, 12));
// The current page is always inside the window.
for (let total = 1; total <= 40; total += 1) {
  for (let page = 1; page <= total; page += 1) {
    const pages = pageWindow(page, total);
    assert.ok(pages.includes(page), `page ${page} of ${total}`);
    assert.equal(pages.length, Math.min(PAGE_WINDOW, total));
  }
}

console.log("pagination ok");
