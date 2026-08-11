/**
 * Rewrite adjacent ```html / ```css / ```js fences in markdown into a single
 * ```html fence containing the combined document (PRD §13.5).
 */

import {
  buildCombinedArtifactHtml,
  extractArtifactFences,
  hasArtifactParts,
} from "./artifact-source-parser";

const GROUP_RE =
  /```html\s*\n[\s\S]*?```(?:\s*```(?:css|javascript|js)\s*\n[\s\S]*?```)+/gi;

/**
 * Merge html+css+js fence groups so MarkdownCode routes one ArtifactBlock.
 */
export function mergeAdjacentArtifactFences(markdown: string): string {
  if (!markdown) return markdown;
  return markdown.replace(GROUP_RE, (block) => {
    const parts = extractArtifactFences(block);
    if (!hasArtifactParts(parts) || (!parts.css && !parts.js)) {
      return block;
    }
    const combined = buildCombinedArtifactHtml(block);
    if (!combined) return block;
    return `\`\`\`html\n${combined}\n\`\`\``;
  });
}
