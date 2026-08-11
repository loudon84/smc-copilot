import type { KanbanController } from "../controller/useKanbanController";
import type { KanbanTaskAction } from "../types/kanban";
import { KanbanColumn } from "./KanbanColumn";

interface Props {
  controller: KanbanController;
}

export function KanbanBoard({ controller }: Props) {
  const { state, columns, tasksByStatus, actions } = controller;
  const draggingTask =
    state.tasks.find((t) => t.id === state.draggingTaskId) ?? null;

  return (
    <div className="kanban-board-scroll">
      <div className="kanban-columns">
        {columns.map((column) => (
          <KanbanColumn
            key={column.key}
            column={column}
            tasks={
              column.key === "unknown"
                ? tasksByStatus.unknown ?? []
                : tasksByStatus[column.key] ?? []
            }
            dragOver={state.dragOverColumn === column.key}
            draggingTask={draggingTask}
            actionBusy={state.actionBusy}
            onOpenTask={(taskId) => void actions.selectTask(taskId)}
            onDragStart={actions.setDragging}
            onDragEnd={() => actions.setDragging(null)}
            onDragOver={actions.setDragOver}
            onDrop={(task, col) => void actions.handleDrop(task, col)}
            onAction={(task, action: KanbanTaskAction) => {
              if (action === "block") {
                actions.openBlockDialog(task.id);
                return;
              }
              if (action === "schedule") {
                actions.openScheduleDialog(task.id);
                return;
              }
              void actions.executeAction(task.id, { action });
            }}
          />
        ))}
      </div>
    </div>
  );
}
