/**
 * Combines adjacent html / css / javascript fences into one artifact document
 * with a restrictive CSP (PRD §13.5).
 */

export const ARTIFACT_COMBINED_CSP =
  "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; font-src data:;";

export interface ArtifactFenceParts {
  html?: string;
  css?: string;
  js?: string;
}

/** True when at least one of html/css/js is present. */
export function hasArtifactParts(parts: ArtifactFenceParts): boolean {
  return Boolean(
    (parts.html && parts.html.trim()) ||
      (parts.css && parts.css.trim()) ||
      (parts.js && parts.js.trim()),
  );
}

/**
 * Build a single HTML document from fence parts. Empty parts are omitted.
 * Always injects CSP meta for defense in depth alongside iframe sandbox.
 */
export function combineArtifactFences(parts: ArtifactFenceParts): string {
  const css = parts.css?.trim() ?? "";
  const js = parts.js?.trim() ?? "";
  let body = parts.html?.trim() ?? "";

  // If the html part looks like a full document, inject style/script before </body>.
  if (/<html[\s>]/i.test(body)) {
    let doc = body;
    if (css) {
      const style = `<style>\n${css}\n</style>`;
      if (/<\/head>/i.test(doc)) {
        doc = doc.replace(/<\/head>/i, `${style}</head>`);
      } else {
        doc = style + doc;
      }
    }
    if (js) {
      const script = `<script>\n${js}\n</script>`;
      if (/<\/body>/i.test(doc)) {
        doc = doc.replace(/<\/body>/i, `${script}</body>`);
      } else {
        doc = doc + script;
      }
    }
    if (!/Content-Security-Policy/i.test(doc)) {
      const csp = `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_COMBINED_CSP}"/>`;
      if (/<head[^>]*>/i.test(doc)) {
        doc = doc.replace(/<head([^>]*)>/i, `<head$1>${csp}`);
      } else {
        doc = csp + doc;
      }
    }
    return doc;
  }

  const styleBlock = css ? `<style>\n${css}\n</style>\n` : "";
  const scriptBlock = js ? `<script>\n${js}\n</script>\n` : "";
  const bodyInner = body || "";
  return `<!doctype html><html><head><meta charset="utf-8"/><meta http-equiv="Content-Security-Policy" content="${ARTIFACT_COMBINED_CSP}"/>${styleBlock}</head><body>${bodyInner}${scriptBlock}</body></html>`;
}

const FENCE_RE =
  /```(html|css|javascript|js)\s*\n([\s\S]*?)```/gi;

/**
 * Extract the first html/css/js fence trio from a markdown-ish source string.
 * Later fences of the same language overwrite earlier ones.
 */
export function extractArtifactFences(source: string): ArtifactFenceParts {
  const parts: ArtifactFenceParts = {};
  let m: RegExpExecArray | null;
  const re = new RegExp(FENCE_RE.source, FENCE_RE.flags);
  while ((m = re.exec(source)) !== null) {
    const lang = m[1].toLowerCase();
    const code = m[2] ?? "";
    if (lang === "html") parts.html = code;
    else if (lang === "css") parts.css = code;
    else parts.js = code;
  }
  return parts;
}

/** Extract + combine when multiple language fences are present. */
export function buildCombinedArtifactHtml(source: string): string | null {
  const parts = extractArtifactFences(source);
  if (!hasArtifactParts(parts)) return null;
  // Single html fence with no css/js — return raw html (ArtifactBlock path).
  if (parts.html && !parts.css && !parts.js) return parts.html.trim();
  return combineArtifactFences(parts);
}
