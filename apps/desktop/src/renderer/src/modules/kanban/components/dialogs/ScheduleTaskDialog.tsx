import { useState } from "react";
import type { KanbanController } from "../../controller/useKanbanController";

interface Props {
  controller: KanbanController;
}

export function ScheduleTaskDialog({ controller }: Props) {
  const { state, actions } = controller;
  const [reason, setReason] = useState("");
  if (!state.scheduleDialogTaskId) return null;

  return (
    <div
      className="kanban-dialog-backdrop"
      onClick={() => actions.openScheduleDialog(null)}
    >
      <div className="kanban-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Schedule Task</h2>
        <div className="kanban-field">
          <label>Reason</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="kanban-dialog-actions">
          <button
            type="button"
            className="btn"
            onClick={() => actions.openScheduleDialog(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!reason.trim()}
            onClick={() => {
              const taskId = state.scheduleDialogTaskId!;
              actions.openScheduleDialog(null);
              void actions.executeAction(taskId, {
                action: "schedule",
                reason: reason.trim(),
              });
            }}
          >
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
