// The HTML source rendered (via headless Chrome) into resume-no-periods.pdf.
// Kept as its own module, separate from make-fixtures.mjs's generation
// script, so tests can import NO_PERIODS_HTML and count its <li> elements as
// an exact, independently-checkable ground truth for bullet detection,
// without re-running the Chrome render as a side effect of the import (same
// pattern as two-column-template.mjs).
//
// This is the adversarial case that exposed the wrap-merge regression: five
// independent <li> bullets, NONE ending in terminal punctuation and all set
// at uniform line-height, so neither the punctuation signal nor the y-gap
// signal can tell them apart from a single wrapped achievement - only the
// right-edge signal (does a line actually reach its block's established
// edge?) can. None of these five bullets are long enough to wrap even once;
// the correct read is five separate one-line bullets, not one merged blob.
export const NO_PERIODS_HTML = `<style>body{font:10.5pt/1.45 Arial,sans-serif;margin:50px}
h2{font-size:11pt;border-bottom:1px solid #666;margin:14px 0 6px}
ul{margin:4px 0 0 20px;padding:0}li{margin-bottom:5px}</style>
<h1 style="font-size:18pt;margin:0">Riley Chen</h1>
<p>Seattle, WA | riley.chen@example.com | 555-0100</p>
<h2>EXPERIENCE</h2>
<p><b>Northwind Labs — Senior Engineer</b> 2022–Present</p>
<ul>
<li>Built and maintained distributed services handling high request volume across regions</li>
<li>Reduced p99 latency from 480ms to 190ms across twelve downstream services</li>
<li>Owned the internal API gateway and its authentication middleware layer</li>
<li>Grew the platform team from three engineers to nine over eighteen months</li>
<li>Coordinated release engineering and on-call rotation for the whole group</li>
</ul>`;
