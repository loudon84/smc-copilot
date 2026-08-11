/**
 * Map IPC / createFromMessage failures to user-facing copy.
 */

export function isIpcHandlerMissingError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err ?? "");
  return /No handler registered/i.test(message) || /IPC_HANDLER_NOT_REGISTERED/i.test(message);
}

export function formatDocumentActionError(err: unknown): string {
  if (isIpcHandlerMissingError(err)) {
    return "文件服务未初始化";
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return "报告文件创建失败，请重试";
}
