import { useEffect, useState } from "react";
import type { ChatRunExecutionState } from "../../workspace/ChatRunRecord";
import type { ChatUsage } from "@shared/chat-runtime/chat-runtime-events";

type Props = {
  runState: ChatRunExecutionState;
  toolLabel?: string | null;
  usage?: ChatUsage | null;
  durationMs?: number;
  startedAt?: number;
};

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}m ${sec}s`;
  return `${sec}s`;
}

function statusText(runState: ChatRunExecutionState): string {
  switch (runState) {
    case "creating":
      return "Creating";
    case "streaming":
      return "Running";
    case "waiting_approval":
      return "Waiting approval";
    case "waiting_clarify":
      return "Waiting clarify";
    case "failed":
      return "Failed";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "interrupted":
      return "Interrupted";
    default:
      return "";
  }
}

/**
 * Conditional task status — visible for busy/failed states;
 * completed auto-hides after 3s. Does not repeat Expert/Skill/Profile.
 */
export function ChatRunStatus({
  runState,
  toolLabel,
  usage,
  durationMs,
  startedAt,
}: Props): React.JSX.Element | null {
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    if (runState !== "completed") {
      setShowCompleted(false);
      return;
    }
    setShowCompleted(true);
    const t = window.setTimeout(() => setShowCompleted(false), 3000);
    return () => window.clearTimeout(t);
  }, [runState]);

  const visible =
    runState === "creating" ||
    runState === "streaming" ||
    runState === "waiting_approval" ||
    runState === "waiting_clarify" ||
    runState === "failed" ||
    (runState === "completed" && showCompleted);

  if (!visible) return null;

  const elapsed =
    durationMs ??
    (startedAt ? Math.max(0, Date.now() - startedAt) : 0);

  const tokens =
    usage?.totalTokens ??
    ((usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0) || null);

  return (
    <div
      className={`chat-run-status is-${runState}`}
      role="status"
      aria-live="polite"
      data-testid="chat-run-status"
    >
      <span className="chat-run-status-main">
        {statusText(runState)}
        {elapsed > 0 ? ` · ${formatDuration(elapsed)}` : ""}
      </span>
      {toolLabel ? (
        <span className="chat-run-status-chip" title={toolLabel}>
          Tool: {toolLabel}
        </span>
      ) : null}
      {tokens != null && tokens > 0 ? (
        <span className="chat-run-status-chip">
          {tokens.toLocaleString()} tokens
        </span>
      ) : null}
    </div>
  );
}
