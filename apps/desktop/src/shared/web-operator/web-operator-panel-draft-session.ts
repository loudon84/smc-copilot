/** WebOperator Hermes panel draft resume id (shared Main + Renderer). */
export const WEB_OPERATOR_PANEL_DRAFT_SESSION_ID = "draft_weboperator" as const;

/** Task-scoped draft for「新建会话」. Uses `_` separator — Windows paths forbid `:`. */
export function buildWebOperatorPanelDraftSessionId(taskId: string): string {
  return `${WEB_OPERATOR_PANEL_DRAFT_SESSION_ID}_${taskId.trim()}`;
}

export function isWebOperatorPanelDraftSession(sessionId: string | undefined): boolean {
  const id = sessionId?.trim();
  if (!id) return false;
  return (
    id === WEB_OPERATOR_PANEL_DRAFT_SESSION_ID ||
    id.startsWith(`${WEB_OPERATOR_PANEL_DRAFT_SESSION_ID}_`)
  );
}
