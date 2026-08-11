import type { KanbanTask, KanbanTaskAction } from "../types/kanban";
import { KanbanTaskActions } from "./KanbanTaskActions";

interface Props {
  task: KanbanTask;
  busy: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onAction: (action: KanbanTaskAction) => void;
}

function ageLabel(createdAt?: number | null): string {
  if (!createdAt) return "";
  const ms = Date.now() - createdAt * (createdAt < 1e12 ? 1000 : 1);
  const h = Math.max(0, Math.floor(ms / 3600000));
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function KanbanTaskCard({
  task,
  busy,
  onOpen,
  onDragStart,
  onDragEnd,
  onAction,
}: Props) {
  return (
    <article
      className="kanban-card"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
    >
      <div className="kanban-card-top">
        <span>
          {task.status === "running" ? <span className="live-dot" /> : null} #
          {task.id}
        </span>
        <span>
          P{task.priority} · {ageLabel(task.createdAt)}
        </span>
      </div>
      <div className="kanban-card-title">{task.title}</div>
      <div className="kanban-card-meta">
        {task.assignee ? <span className="kanban-pill">{task.assignee}</span> : null}
        {task.tenant ? <span className="kanban-pill">{task.tenant}</span> : null}
        {task.skills?.length ? (
          <span className="kanban-pill">{task.skills.length} skills</span>
        ) : null}
      </div>
      <KanbanTaskActions task={task} busy={busy} onAction={onAction} />
    </article>
  );
}
