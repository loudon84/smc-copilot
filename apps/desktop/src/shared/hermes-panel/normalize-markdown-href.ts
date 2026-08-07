/** Decode HTML entities in assistant markdown links before navigation. */
export function normalizeMarkdownHref(href: string): string {
  return href
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/&#x26;/gi, "&")
    .replace(/&#38;/g, "&");
}
