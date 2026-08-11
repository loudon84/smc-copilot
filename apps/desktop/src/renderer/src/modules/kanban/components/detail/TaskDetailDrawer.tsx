import { useState } from "react";
import type { KanbanController } from "../../controller/useKanbanController";
import { STATUS_TONE } from "../../types/kanban";

interface Props {
  controller: KanbanController;
}

export function TaskDetailDrawer({ controller }: Props) {
  const { state, actions } = controller;
  const detail = state.selectedTaskDetail;
  const [comment, setComment] = useState("");

  if (!state.selectedTaskId || !detail) return null;
  const task = detail.task;

  return (
    <>
      <div className="kanban-drawer-backdrop" onClick={() => void actions.selectTask(null)} />
      <aside className="kanban-drawer">
        <div className="kanban-drawer-header">
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>#{task.id}</div>
            <strong>{task.title}</strong>
          </div>
          <button type="button" className="btn" onClick={() => void actions.selectTask(null)}>
            ×
          </button>
        </div>
        <div className="kanban-drawer-body">
          <section className="kanban-section">
            <h3>Overview</h3>
            <div className="kanban-card-meta">
              <span className="kanban-pill kanban-pill-status">
                <span
                  className="kanban-column-dot"
                  data-tone={STATUS_TONE[task.status] || "neutral"}
                />
                {task.status}
              </span>
              <span className="kanban-pill">P{task.priority}</span>
              {task.assignee ? <span className="kanban-pill">{task.assignee}</span> : null}
              {task.tenant ? <span className="kanban-pill">{task.tenant}</span> : null}
              <span className="kanban-pill">{task.workspaceKind}</span>
            </div>
            {task.body ? <p style={{ whiteSpace: "pre-wrap" }}>{task.body}</p> : null}
            {task.skills?.length ? (
              <div className="kanban-card-meta">
                {task.skills.map((s) => (
                  <span key={s} className="kanban-pill">
                    {s}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="kanban-section">
            <h3>Dependencies</h3>
            <div>Parents: {detail.parents.join(", ") || "—"}</div>
            <div>Children: {detail.children.join(", ") || "—"}</div>
          </section>

          <section className="kanban-section">
            <h3>Runs</h3>
            {detail.runs.length === 0 ? (
              <div style={{ opacity: 0.6 }}>No runs</div>
            ) : (
              detail.runs.map((run) => (
                <div key={run.id} style={{ marginBottom: 6 }}>
                  #{run.id} {run.status || "—"} {run.outcome ? `· ${run.outcome}` : ""}
                </div>
              ))
            )}
            {detail.latestSummary ? (
              <p style={{ opacity: 0.8 }}>{detail.latestSummary}</p>
            ) : null}
          </section>

          <section className="kanban-section">
            <h3>Comments</h3>
            {detail.comments.map((c) => (
              <div key={c.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  {c.author || "user"} · {new Date(c.createdAt * (c.createdAt < 1e12 ? 1000 : 1)).toLocaleString()}
                </div>
                <div>{c.body}</div>
              </div>
            ))}
            <div className="kanban-field">
              <textarea
                rows={3}
                placeholder="Add comment…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!comment.trim()}
              onClick={() => {
                const text = comment.trim();
                setComment("");
                void actions.addComment(task.id, text);
              }}
            >
              Add comment
            </button>
          </section>

          <section className="kanban-section">
            <h3>Events</h3>
            {detail.events.length === 0 ? (
              <div style={{ opacity: 0.6 }}>No events</div>
            ) : (
              detail.events.map((ev) => (
                <div key={ev.id} style={{ marginBottom: 6, fontSize: 12 }}>
                  {ev.kind}
                </div>
              ))
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
