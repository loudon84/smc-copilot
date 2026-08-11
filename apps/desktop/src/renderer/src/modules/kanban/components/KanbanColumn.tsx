import type { KanbanColumnDef, KanbanTask, KanbanTaskAction } from "../types/kanban";
import { isValidDragTransition } from "../controller/kanbanTransitions";
import { KanbanTaskCard } from "./KanbanTaskCard";

interface Props {
  column: KanbanColumnDef;
  tasks: KanbanTask[];
  dragOver: boolean;
  draggingTask: KanbanTask | null;
  actionBusy: string | null;
  onOpenTask: (taskId: string) => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  onDragOver: (column: string | null) => void;
  onDrop: (task: KanbanTask, column: string) => void;
  onAction: (task: KanbanTask, action: KanbanTaskAction) => void;
}

export function KanbanColumn({
  column,
  tasks,
  dragOver,
  draggingTask,
  actionBusy,
  onOpenTask,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onAction,
}: Props) {
  return (
    <section
      className={`kanban-column${dragOver ? " drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (
          draggingTask &&
          isValidDragTransition(draggingTask.status, column.key, draggingTask.allowedActions)
        ) {
          onDragOver(column.key);
        }
      }}
      onDragLeave={() => onDragOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        onDragOver(null);
        if (draggingTask) onDrop(draggingTask, column.key);
      }}
    >
      <div className="kanban-column-header">
        <span className="kanban-column-dot" data-tone={column.tone} />
        <span>{column.key}</span>
        <span>{tasks.length}</span>
      </div>
      <div className="kanban-column-body">
        {tasks.length === 0 ? (
          <div className="empty-column">No tasks</div>
        ) : (
          tasks.map((task) => (
            <KanbanTaskCard
              key={task.id}
              task={task}
              busy={actionBusy !== null}
              onOpen={() => onOpenTask(task.id)}
              onDragStart={() => onDragStart(task.id)}
              onDragEnd={onDragEnd}
              onAction={(action) => onAction(task, action)}
            />
          ))
        )}
      </div>
    </section>
  );
}
