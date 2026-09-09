// lib/sanitize.js — HTML sanitisation for ATS-sourced job descriptions.
// Pure functions (no server-only APIs), so this is safe to import from both
// a server component (app/[slug]/page.jsx) and a "use client" component
// (components/JobPreview.jsx). Extracted from app/[slug]/page.jsx so the
// split-pane preview applies exactly the same rules rather than a second,
// possibly-drifting copy.

// Decode HTML entities (handles double-encoded descriptions from ATS)
export function decodeEntities(str = "") {
  // One pass: decode &amp;lt; → &lt; → <
  let s = str;
  // First decode &amp; to & so that &amp;lt; → &lt;
  s = s.replace(/&amp;/g, "&");
  // Then decode all standard entities
  return s
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// Sanitise HTML (strip scripts/events, keep formatting)
export function sanitiseHtml(html = "") {
  // Decode entities first — many ATS sources double-encode the HTML
  const decoded = decodeEntities(html);
  return decoded
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .trim();
}
