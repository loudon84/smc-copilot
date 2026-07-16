import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ToolProgressEntry } from "../types/chat-task-window";

export type { ToolProgressEntry } from "../types/chat-task-window";

type Props = {
  entries: ToolProgressEntry[];
  collapsed?: boolean;
};

function statusLabel(status: ToolProgressEntry["status"]): string {
  if (status === "completed") return "Completed";
  if (status === "error") return "Failed";
  if (status === "waiting_approval") return "Waiting approval";
  return "Running";
}

export function ToolProgressTimeline({
  entries,
  collapsed = false,
}: Props): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  const visibleEntries = useMemo(() => {
    if (!collapsed || expanded) return entries;
    const running = entries.filter((e) => e.status === "running" || e.status === "waiting_approval");
    if (running.length > 0) return running;
    const last = entries[entries.length - 1];
    return last ? [last] : [];
  }, [collapsed, entries, expanded]);

  if (entries.length === 0) return null;

  const completedCount = entries.filter((e) => e.status === "completed").length;
  const showCollapseToggle = collapsed && entries.length > 1;

  return (
    <div className="hermes-webchat-tool-timeline" aria-label="Tool progress timeline">
      {showCollapseToggle ? (
        <button
          type="button"
          className="hermes-webchat-tool-timeline__toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>
            {expanded
              ? "收起工具进度"
              : `工具进度 (${completedCount}/${entries.length} 已完成)`}
          </span>
        </button>
      ) : null}
      {visibleEntries.map((entry) => {
        const isCompact = entry.status === "completed" && collapsed && !expanded;
        return (
          <div
            key={entry.id}
            className={`hermes-tool-progress-timeline__item${isCompact ? " is-compact" : ""}${entry.status === "error" ? " is-error" : ""}`}
          >
            <div className="hermes-tool-progress-timeline__header">
              <span className="hermes-tool-progress-timeline__name">
                {entry.title ?? entry.name}
              </span>
              <span className="hermes-tool-progress-timeline__status">{statusLabel(entry.status)}</span>
            </div>
            {!isCompact && (entry.message ?? entry.resultPreview) ? (
              <pre className="hermes-tool-progress-timeline__body">
                {entry.message ?? entry.resultPreview}
              </pre>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
