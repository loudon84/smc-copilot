/**
 * Detects whether a fenced code block's source region is still streaming
 * (the closing ``` hasn't arrived yet). Used to keep Mermaid/SVG/HTML
 * artifact blocks from running/rendering partial, still-growing source.
 */

/**
 * `source` is the full markdown string; `start`/`end` are the code node's
 * character offsets within it (from remark's `node.position`). A closed
 * fence's sliced region ends with a line of only backticks (the same
 * pattern react-markdown/remark parses); an unclosed one (still streaming)
 * runs to the end of the document without one.
 */
export function isFenceClosed(
  source: string,
  start: number | undefined,
  end: number | undefined,
): boolean {
  if (start == null || end == null) return true;
  const region = source.slice(start, end);
  const lines = region.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === "") continue;
    return /^`{3,}$/.test(line);
  }
  return false;
}
