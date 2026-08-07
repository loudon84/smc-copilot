/** Normalize page URL for task_session lookup (Renderer-safe, no Node crypto). */

export function normalizeWebOperatorTaskPageUrl(pageUrl: string): string {
  return pageUrl.trim();
}

/** True when two URLs refer to the same WebOperator task (matches Main `page_url` / `taskId`). */
export function isSameWebOperatorTaskPageUrl(
  existingPageUrl: string | undefined,
  incomingPageUrl: string,
): boolean {
  if (!existingPageUrl?.trim()) return false;
  return (
    normalizeWebOperatorTaskPageUrl(existingPageUrl) ===
    normalizeWebOperatorTaskPageUrl(incomingPageUrl)
  );
}
