import type { KanbanController } from "./controller/useKanbanController";
import { BoardSwitcher } from "./components/BoardSwitcher";
import { KanbanBoard } from "./components/KanbanBoard";
import { KanbanHeader } from "./components/KanbanHeader";
import { TaskDetailDrawer } from "./components/detail/TaskDetailDrawer";
import { BlockTaskDialog } from "./components/dialogs/BlockTaskDialog";
import { CreateBoardDialog } from "./components/dialogs/CreateBoardDialog";
import { CreateTaskDialog } from "./components/dialogs/CreateTaskDialog";
import { ScheduleTaskDialog } from "./components/dialogs/ScheduleTaskDialog";
import "./styles/kanban.css";

interface Props {
  controller: KanbanController;
}

export function KanbanModule({ controller }: Props) {
  const { state, actions } = controller;

  return (
    <div className="smc-kanban">
      <KanbanHeader controller={controller} />
      <BoardSwitcher controller={controller} />
      {state.error ? (
        <div className="kanban-error" role="alert">
          {state.error}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginLeft: 8 }}
            onClick={actions.clearError}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="kanban-shell">
        {state.loading && state.tasks.length === 0 ? (
          <div className="empty-column" style={{ padding: 32 }}>
            Loading Kanban…
          </div>
        ) : (
          <KanbanBoard controller={controller} />
        )}
        <TaskDetailDrawer controller={controller} />
        <CreateTaskDialog controller={controller} />
        <CreateBoardDialog controller={controller} />
        <BlockTaskDialog controller={controller} />
        <ScheduleTaskDialog controller={controller} />
      </div>
    </div>
  );
}
