import { useEffect, useState } from "react";
import type { ChatRunExecutionState } from "../../workspace/ChatRunRecord";
import type { ChatUsage } from "@shared/chat-runtime/chat-runtime-events";

type Props = {
  runState: ChatRunExecutionState;
  toolLabel?: string | null;
  usage?: ChatUsage | null;
  /** Cumulative usage across turns — shown in tooltip. */
  cumulativeUsage?: ChatUsage | null;
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

function isBusyState(runState: ChatRunExecutionState): boolean {
  return (
    runState === "creating" ||
    runState === "streaming" ||
    runState === "waiting_approval" ||
    runState === "waiting_clarify"
  );
}

/**
 * Conditional task status — visible for busy/failed states;
 * completed auto-hides after 3s. Duration ticks every second while busy.
 */
export function ChatRunStatus({
  runState,
  toolLabel,
  usage,
  cumulativeUsage,
  durationMs,
  startedAt,
}: Props): React.JSX.Element | null {
  const [showCompleted, setShowCompleted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (runState !== "completed") {
      setShowCompleted(false);
      return;
    }
    setShowCompleted(true);
    const t = window.setTimeout(() => setShowCompleted(false), 3000);
    return () => window.clearTimeout(t);
  }, [runState]);

  useEffect(() => {
    if (!isBusyState(runState) || !startedAt) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [runState, startedAt]);

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
    (startedAt ? Math.max(0, now - startedAt) : 0);

  const tokens =
    usage?.totalTokens ??
    ((usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0) || null);

  const cumTokens =
    cumulativeUsage?.totalTokens ??
    ((cumulativeUsage?.promptTokens ?? 0) +
      (cumulativeUsage?.completionTokens ?? 0) ||
      null);

  const usageTitle =
    cumTokens != null && cumTokens > 0
      ? `This turn: ${tokens?.toLocaleString() ?? 0} · Session: ${cumTokens.toLocaleString()}`
      : undefined;

  return (
    <div
      className={`chat-run-status is-${runState}`}
      role="status"
      aria-live="polite"
      data-testid="chat-run-status"
      title={usageTitle}
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
        <span className="chat-run-status-chip" title={usageTitle}>
          {tokens.toLocaleString()} tokens
        </span>
      ) : null}
    </div>
  );
}
