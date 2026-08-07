import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkTaskEvent, ToolEvent } from "../../../../../../../../shared/work/work-event-contract";

function isToolEvent(ev: WorkTaskEvent): ev is ToolEvent {
  return (
    ev.type === "tool.started" ||
    ev.type === "tool.progress" ||
    ev.type === "tool.completed" ||
    ev.type === "tool.failed"
  );
}

export function ToolCallBlock({ events }: { events: WorkTaskEvent[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const toolEvents = events.filter(isToolEvent);
  const latest = toolEvents[toolEvents.length - 1];
  if (!latest) return null;

  const failed = latest.type === "tool.failed";
  const completed = latest.type === "tool.completed";

  return (
    <div className={`hermes-stream-block hermes-stream-block--tool${failed ? " is-failed" : ""}`}>
      <button type="button" className="hermes-stream-block__toggle" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{t("workspaces.hermes.tasks.stream.toolCall")}: {latest.displayName ?? latest.toolName}</span>
        <span className={`hermes-task-status-dot ${completed ? "is-completed" : failed ? "is-failed" : "is-running"}`} />
      </button>
      {open ? (
        <div className="hermes-stream-block__body">
          {latest.inputSummary ? <p>输入：{latest.inputSummary}</p> : null}
          {latest.outputSummary ? <p>输出：{latest.outputSummary}</p> : null}
          {failed && latest.error ? <p className="hermes-stream-block__error">{latest.error.message}</p> : null}
          {failed ? (
            <button type="button" className="hermes-btn-ghost hermes-stream-block__retry">
              {t("workspaces.hermes.tasks.stream.retry")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
