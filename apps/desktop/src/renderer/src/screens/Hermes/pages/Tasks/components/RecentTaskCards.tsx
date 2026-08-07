import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WorkTask } from "../../../../../../../shared/work/work-task-contract";
import { workTaskApi } from "../../../api/workTaskApi";
import { useWorkTaskStore } from "../../../features/task-store/useWorkTaskStore";

type Props = {
  onContinue: () => void;
};

export function RecentTaskCards({ onContinue }: Props) {
  const { t } = useTranslation();
  const { resumeTask } = useWorkTaskStore();
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void workTaskApi.listRecentTasks().then((items) => {
      if (!cancelled) {
        setTasks(items);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const recent = tasks.slice(0, 6);
  if (loading || recent.length === 0) return null;

  return (
    <section className="hermes-task-recent">
      <h3>{t("workspaces.hermes.tasks.recentTasks", { defaultValue: "Recent tasks" })}</h3>
      <div className="hermes-task-recent__grid">
        {recent.map((task) => (
          <button
            key={task.id}
            type="button"
            className="hermes-task-recent__card"
            onClick={() => {
              void resumeTask(task.id).then((resumed) => {
                if (resumed) onContinue();
              });
            }}
          >
            <strong>{task.title}</strong>
            <span>{task.status}</span>
            <span className="hermes-task-recent__action">
              {t("workspaces.hermes.tasks.continueTask", { defaultValue: "Continue" })}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
