import { Plus } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { WorkTask } from "../../../../../../../shared/work/work-task-contract";

type Props = {
  tasks: WorkTask[];
  activeTaskId: string | null;
  onSelect: (taskId: string) => void;
  onNewTask: () => void;
};

function groupTasks(tasks: WorkTask[]) {
  const running = tasks.filter((t) =>
    ["running", "dispatching", "planning", "merging"].includes(t.status),
  );
  const approval = tasks.filter((t) => t.status === "waiting_approval");
  const completed = tasks.filter((t) => t.status === "completed" || t.status === "output_ready");
  const other = tasks.filter(
    (t) =>
      !running.includes(t) &&
      !approval.includes(t) &&
      !completed.includes(t),
  );
  return { running, approval, completed, other };
}

function TaskGroup({
  label,
  items,
  activeTaskId,
  onSelect,
}: {
  label: string;
  items: WorkTask[];
  activeTaskId: string | null;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="hermes-task-list__group">
      <div className="hermes-task-list__group-label">{label}</div>
      {items.map((task) => (
        <button
          key={task.id}
          type="button"
          className={`hermes-task-list__item${activeTaskId === task.id ? " is-active" : ""}`}
          onClick={() => onSelect(task.id)}
        >
          <span className="hermes-task-list__title">{task.title}</span>
          <span className="hermes-task-list__status">{task.status}</span>
        </button>
      ))}
    </div>
  );
}

export function TaskListPanel({ tasks, activeTaskId, onSelect, onNewTask }: Props) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupTasks(tasks), [tasks]);

  return (
    <aside className="hermes-task-list-panel">
      <div className="hermes-task-list-panel__header">
        <button type="button" className="hermes-btn-primary hermes-task-list-panel__new" onClick={onNewTask}>
          <Plus size={14} />
          {t("workspaces.hermes.tasks.newTask")}
        </button>
      </div>
      <div className="hermes-task-list-panel__scroll">
        {tasks.length === 0 ? (
          <p className="hermes-task-list__empty">{t("workspaces.hermes.tasks.list.empty")}</p>
        ) : (
          <>
            <TaskGroup
              label={t("workspaces.hermes.tasks.list.running")}
              items={groups.running}
              activeTaskId={activeTaskId}
              onSelect={onSelect}
            />
            <TaskGroup
              label={t("workspaces.hermes.tasks.list.approval")}
              items={groups.approval}
              activeTaskId={activeTaskId}
              onSelect={onSelect}
            />
            <TaskGroup
              label={t("workspaces.hermes.tasks.list.recent")}
              items={[...groups.other, ...groups.completed]}
              activeTaskId={activeTaskId}
              onSelect={onSelect}
            />
          </>
        )}
      </div>
    </aside>
  );
}
