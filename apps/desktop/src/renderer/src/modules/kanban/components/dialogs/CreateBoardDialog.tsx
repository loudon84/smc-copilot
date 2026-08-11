import { useState } from "react";
import type { KanbanController } from "../../controller/useKanbanController";

interface Props {
  controller: KanbanController;
}

export function CreateBoardDialog({ controller }: Props) {
  const { state, actions } = controller;
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");

  if (!state.createBoardOpen) return null;

  return (
    <div className="kanban-dialog-backdrop" onClick={() => actions.openCreateBoard(false)}>
      <div className="kanban-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>New Board</h2>
        <div className="kanban-field">
          <label>Slug</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </div>
        <div className="kanban-field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="kanban-dialog-actions">
          <button type="button" className="btn" onClick={() => actions.openCreateBoard(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!slug.trim() || state.actionBusy !== null}
            onClick={() =>
              void actions.createBoard({
                slug: slug.trim(),
                name: name.trim() || slug.trim(),
              })
            }
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
