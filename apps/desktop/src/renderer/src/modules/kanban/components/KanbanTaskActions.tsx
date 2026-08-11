import type { KanbanTask, KanbanTaskAction } from "../types/kanban";

interface Props {
  task: KanbanTask;
  busy: boolean;
  onAction: (action: KanbanTaskAction) => void;
}

const QUICK: KanbanTaskAction[] = [
  "specify",
  "promote",
  "complete",
  "block",
  "unblock",
  "reclaim",
  "archive",
];

export function KanbanTaskActions({ task, busy, onAction }: Props) {
  const allowed = new Set(task.allowedActions ?? []);
  return (
    <div className="kanban-card-actions">
      {QUICK.filter((a) => allowed.has(a)).map((action) => (
        <button
          key={action}
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onAction(action);
          }}
        >
          {action}
        </button>
      ))}
    </div>
  );
}
