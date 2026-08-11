import { useState } from "react";
import type { KanbanController } from "../../controller/useKanbanController";

interface Props {
  controller: KanbanController;
}

export function CreateTaskDialog({ controller }: Props) {
  const { state, actions } = controller;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState(1);
  const [workspace, setWorkspace] = useState<"scratch" | "worktree" | "dir">("scratch");
  const [dirPath, setDirPath] = useState("");
  const [skills, setSkills] = useState("");
  const [triage, setTriage] = useState(false);

  if (!state.createTaskOpen) return null;

  return (
    <div className="kanban-dialog-backdrop" onClick={() => actions.openCreateTask(false)}>
      <div className="kanban-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>New Task</h2>
        <div className="kanban-field">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="kanban-field">
          <label>Description</label>
          <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="kanban-field">
          <label>Assignee</label>
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} />
        </div>
        <div className="kanban-field">
          <label>Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          >
            {[0, 1, 2, 3].map((p) => (
              <option key={p} value={p}>
                P{p}
              </option>
            ))}
          </select>
        </div>
        <div className="kanban-field">
          <label>Workspace</label>
          <select
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value as typeof workspace)}
          >
            <option value="scratch">Scratch</option>
            <option value="worktree">Worktree</option>
            <option value="dir">Directory</option>
          </select>
        </div>
        {workspace === "dir" ? (
          <div className="kanban-field">
            <label>Directory</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ flex: 1 }}
                value={dirPath}
                onChange={(e) => setDirPath(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void actions.pickDirectory().then((p) => {
                    if (p) setDirPath(p);
                  })
                }
              >
                Browse
              </button>
            </div>
          </div>
        ) : null}
        <div className="kanban-field">
          <label>Skills (comma separated)</label>
          <input value={skills} onChange={(e) => setSkills(e.target.value)} />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={triage}
            onChange={(e) => setTriage(e.target.checked)}
          />
          Send to Triage
        </label>
        <div className="kanban-dialog-actions">
          <button type="button" className="btn" onClick={() => actions.openCreateTask(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!title.trim() || state.actionBusy !== null}
            onClick={() =>
              void actions.createTask({
                title: title.trim(),
                body: body.trim() || undefined,
                assignee: assignee.trim() || undefined,
                priority,
                workspace:
                  workspace === "dir"
                    ? dirPath
                      ? `dir:${dirPath}`
                      : undefined
                    : workspace,
                skills: skills
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                triage,
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
