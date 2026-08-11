/**
 * Heuristics for treating an Assistant Message as a document (report).
 * Controls UI affordances only — never writes files or mutates content.
 */

/** True when content looks like a long structured Markdown document. */
export function isDocumentLikeMessage(content: string): boolean {
  const text = content.trim();

  if (text.length < 300) {
    return false;
  }

  const hasHeading = /^#{1,6}\s+/m.test(text);
  const hasMarkdownTable = /\|.+\|[\r\n]+\|[-:\s|]+\|/.test(text);
  const paragraphCount = text.split(/\n\s*\n/).filter(Boolean).length;

  return hasHeading || hasMarkdownTable || paragraphCount >= 4;
}

/**
 * Prefer an explicit title, else the first Markdown heading, else fallback.
 */
export function extractDocumentTitle(
  content: string,
  suggestedTitle?: string,
  sessionTitle?: string,
): string {
  const explicit = suggestedTitle?.trim();
  if (explicit) return explicit;

  const heading = content.match(/^#{1,6}\s+(.+)$/m);
  if (heading?.[1]?.trim()) {
    return heading[1].trim().slice(0, 120);
  }

  const session = sessionTitle?.trim();
  if (session) return session.slice(0, 120);

  return "generated-report";
}
