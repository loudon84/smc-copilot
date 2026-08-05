/**
 * Structure-aware text chunking for FTS indexing (PRD §18.2).
 * Prefer heading → paragraph → newline → sentence → character boundaries.
 */

/** Split text into overlapping chunks, preferring structural boundaries. */
export function chunkText(
  text: string,
  chunkChars: number,
  overlapChars: number,
): string[] {
  const body = text || "";
  if (!body) return [];
  const size = Math.max(64, chunkChars || 4000);
  const overlap = Math.max(0, Math.min(overlapChars || 0, size - 1));
  const chunks: string[] = [];
  let start = 0;
  while (start < body.length) {
    const hardEnd = Math.min(body.length, start + size);
    let end = hardEnd;
    if (hardEnd < body.length) {
      end = pickBoundary(body, start, hardEnd) ?? hardEnd;
      if (end <= start) end = hardEnd;
    }
    chunks.push(body.slice(start, end));
    if (end >= body.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

/**
 * Prefer the latest structural break in [start, hardEnd).
 * Order: markdown heading line, blank paragraph, newline, sentence end.
 */
function pickBoundary(
  body: string,
  start: number,
  hardEnd: number,
): number | null {
  const window = body.slice(start, hardEnd);
  const heading = lastIndexOfRegex(window, /\n#{1,6}\s[^\n]*$/m);
  if (heading != null && heading > 0) return start + heading;

  const para = window.lastIndexOf("\n\n");
  if (para > 0) return start + para + 2;

  const nl = window.lastIndexOf("\n");
  if (nl > 0) return start + nl + 1;

  const sentence = lastIndexOfRegex(window, /[.!?]["')\]]?\s+/g);
  if (sentence != null && sentence > 0) return start + sentence;

  return null;
}

function lastIndexOfRegex(haystack: string, re: RegExp): number | null {
  let last: number | null = null;
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  let m: RegExpExecArray | null;
  while ((m = global.exec(haystack)) !== null) {
    last = m.index + m[0].length;
    if (m[0].length === 0) global.lastIndex += 1;
  }
  return last;
}
