import type { ChatTaskStatus } from "../types/chat-task-window";

type Props = {
  status: ChatTaskStatus;
  title: string;
  durationMs: number;
  documentCount?: number;
};

function summaryText(status: ChatTaskStatus, durationMs: number, documentCount: number): string {
  const duration = durationMs > 0 ? ` · ${Math.max(1, Math.round(durationMs / 1000))}s` : "";
  const docs = documentCount > 0 ? ` · ${documentCount} 个输出文件` : "";

  if (status === "completed") return `任务已完成${duration}${docs}`;
  if (status === "failed") return `任务失败${duration}`;
  if (status === "cancelled") return `任务已取消${duration}`;
  return "";
}

export function TaskLifecycleCard({
  status,
  title,
  durationMs,
  documentCount = 0,
}: Props): React.JSX.Element | null {
  if (status !== "completed" && status !== "failed" && status !== "cancelled") {
    return null;
  }

  const summary = summaryText(status, durationMs, documentCount);
  if (!summary) return null;

  return (
    <div className={`hermes-webchat-task-lifecycle is-${status}`}>
      <span className="hermes-webchat-task-lifecycle__title">{title}</span>
      <span className="hermes-webchat-task-lifecycle__summary">{summary}</span>
    </div>
  );
}
