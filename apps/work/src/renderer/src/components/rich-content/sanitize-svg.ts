/**
 * Strips executable/exfiltration-capable content from untrusted SVG source
 * before it's ever attached to the DOM: `<script>`, `<foreignObject>`,
 * `on*` event handlers, external `href`/`xlink:href` references, and
 * `javascript:` URLs. Uses DOMPurify configured for SVG documents rather
 * than a hand-rolled regex parser.
 */

import DOMPurify from "dompurify";

const FORBID_TAGS = ["script", "foreignObject", "iframe", "embed", "object"];
const FORBID_ATTR = ["onload", "onerror", "onclick", "onmouseover"];

/** Returns sanitized SVG markup, or null when the input isn't an `<svg>`. */
export function sanitizeSvg(source: string): string | null {
  const trimmed = (source || "").trim();
  if (!trimmed) return null;

  const clean = DOMPurify.sanitize(trimmed, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS,
    FORBID_ATTR,
    // Every `on*` handler is stripped regardless of name (belt-and-suspenders
    // on top of FORBID_ATTR, which only lists the common ones).
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });

  // Reject anything that isn't an SVG root after sanitization (plain text,
  // fragments, or fully-stripped empty markup).
  if (!/^<svg[\s>]/i.test(clean)) return null;

  // DOMPurify's default hook set already rejects javascript: URLs in
  // href/xlink:href/style; strip any remaining external references so a
  // rendered SVG can't beacon out or load remote content.
  return clean
    .replace(/\s(?:xlink:)?href\s*=\s*"(https?:)?\/\/[^"]*"/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*'(https?:)?\/\/[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "");
}
