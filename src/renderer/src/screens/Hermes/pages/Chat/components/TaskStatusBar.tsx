import type { ChatTaskStatus } from "../types/chat-task-window";

type Props = {
  title: string;
  status: ChatTaskStatus;
  expertName?: string;
  skillName?: string;
  profileId: string;
  durationMs: number;
  toolLabel?: string;
};

function statusLabel(status: ChatTaskStatus): string {
  switch (status) {
    case "draft":
      return "草稿";
    case "ready":
      return "就绪";
    case "creating":
      return "创建中";
    case "running":
      return "运行中";
    case "waiting_tool":
      return "工具执行";
    case "waiting_approval":
      return "等待审批";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}m ${sec}s`;
  return `${sec}s`;
}

export function TaskStatusBar({
  title,
  status,
  expertName,
  skillName,
  profileId,
  durationMs,
  toolLabel,
}: Props): React.JSX.Element | null {
  if (status === "draft") return null;

  const showDuration =
    status === "creating" ||
    status === "running" ||
    status === "waiting_tool" ||
    status === "waiting_approval" ||
    durationMs > 0;

  return (
    <div className="hermes-webchat-task-status" role="status" aria-live="polite">
      <div className="hermes-webchat-task-status__main">
        <span className="hermes-webchat-task-status__title" title={title}>
          {title}
        </span>
        <span className={`hermes-webchat-task-status__badge is-${status}`}>
          {statusLabel(status)}
        </span>
      </div>
      <div className="hermes-webchat-task-status__meta">
        <span className="hermes-webchat-task-status__chip">Profile: {profileId}</span>
        {expertName ? (
          <span className="hermes-webchat-task-status__chip">Expert: {expertName}</span>
        ) : null}
        {skillName ? (
          <span className="hermes-webchat-task-status__chip">Skill: {skillName}</span>
        ) : null}
        {toolLabel ? (
          <span className="hermes-webchat-task-status__chip" title={toolLabel}>
            Tool: {toolLabel}
          </span>
        ) : null}
        {showDuration ? (
          <span className="hermes-webchat-task-status__chip">{formatDuration(durationMs)}</span>
        ) : null}
      </div>
    </div>
  );
}
