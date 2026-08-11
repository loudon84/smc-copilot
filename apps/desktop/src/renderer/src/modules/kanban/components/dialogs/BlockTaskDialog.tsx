import { useState } from "react";
import type { KanbanController } from "../../controller/useKanbanController";

interface Props {
  controller: KanbanController;
}

export function BlockTaskDialog({ controller }: Props) {
  const { state, actions } = controller;
  const [reason, setReason] = useState("");
  if (!state.blockDialogTaskId) return null;

  return (
    <div className="kanban-dialog-backdrop" onClick={() => actions.openBlockDialog(null)}>
      <div className="kanban-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Block Task</h2>
        <div className="kanban-field">
          <label>Reason</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="kanban-dialog-actions">
          <button type="button" className="btn" onClick={() => actions.openBlockDialog(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!reason.trim()}
            onClick={() => {
              const taskId = state.blockDialogTaskId!;
              actions.openBlockDialog(null);
              void actions.executeAction(taskId, { action: "block", reason: reason.trim() });
            }}
          >
            Block
          </button>
        </div>
      </div>
    </div>
  );
}
