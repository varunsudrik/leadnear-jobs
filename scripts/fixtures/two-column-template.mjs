// The HTML source rendered (via headless Chrome) into resume-two-column.pdf.
// Kept as its own module, separate from make-fixtures.mjs's generation
// script, so tests can import TWO_COLUMN_HTML and count its <li> elements as
// an exact, independently-checkable ground truth for bullet detection,
// without re-running the Chrome render as a side effect of the import.
//
// The achievement list is a real <ul><li> (not a hand-indented <p>) so the
// number of <li> tags below is the ground truth a test can grep for. One
// bullet is written long enough to wrap across two PDF lines, so a naive
// "one reconstructed line = one bullet" count would fail while the actual
// <li> count stays the real answer.
export const TWO_COLUMN_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:11pt/1.45 Arial,sans-serif;margin:48px;color:#111}
h1{font-size:20pt;margin:0 0 4px}
.contact{font-size:9.5pt;color:#444;margin-bottom:12px}
h2{font-size:15pt;text-transform:uppercase;margin:14px 0 6px;font-weight:bold}
.role{font-weight:bold;margin:6px 0 2px}
ul.bullets{list-style:none;margin:2px 0 2px 26px;padding:0}
ul.bullets li{margin:2px 0}
table{width:100%;border-collapse:collapse;margin-top:2px}
td{vertical-align:top;padding:0;width:50%}
td.r{padding-left:24px}
td p{margin:2px 0}
</style></head><body>
<h1>Morgan Ellis</h1>
<div class="contact">morgan.ellis@example.com | +1 555 0142 | linkedin.com/in/morganellis</div>
<h2>Experience</h2>
<p class="role">Senior Backend Engineer, Fenwick Systems</p>
<p class="role">Mar 2021 - Present</p>
<ul class="bullets">
<li>Design and build scalable REST APIs and backend services using Node.js, Express, and TypeScript for high-volume marketing and promotion platforms.</li>
<li>Lead code reviews and mentor engineers on architecture decisions and best practices.</li>
<li>Own the deployment pipeline and coordinate releases across four product teams.</li>
<li>Reduced average API latency from 420ms to 110ms across core services.</li>
<li>Cut infrastructure costs by 18% by consolidating redundant services.</li>
</ul>
<h2>Technical Skills</h2>
<table>
<tr><td><b>BACKEND</b></td><td class="r"><b>FRONTEND</b></td></tr>
<tr><td><p>Node.js Express TypeScript</p></td><td class="r"><p>React HTML CSS</p></td></tr>
<tr><td><b>DATABASES</b></td><td class="r"><b>DEVOPS AND CLOUD</b></td></tr>
<tr><td><p>PostgreSQL MongoDB Redis</p></td><td class="r"><p>Docker AWS Jenkins</p></td></tr>
</table>
</body></html>`;
