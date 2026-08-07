import { useTranslation } from "react-i18next";
import { WorkTaskStoreProvider, useWorkTaskStore } from "../../features/task-store/useWorkTaskStore";
import { TaskHomeEntry } from "./components/TaskHomeEntry";
import { TaskWindow } from "./components/TaskWindow";

function WorkTasksPageInner() {
  const { t } = useTranslation();
  const { activeTaskId } = useWorkTaskStore();

  return (
    <div className="hermes-page hermes-tasks-page">
      {!activeTaskId ? (
        <header className="hermes-page__header">
          <div>
            <h2>{t("workspaces.hermes.tasks.title", { defaultValue: "Tasks" })}</h2>
            <p className="hermes-page__subtitle">
              {t("workspaces.hermes.tasks.subtitle", { defaultValue: "Hermes session-bound work tasks" })}
            </p>
          </div>
        </header>
      ) : null}

      {activeTaskId ? <TaskWindow /> : <TaskHomeEntry onTaskStarted={() => undefined} />}
    </div>
  );
}

export default function WorkTasksPage() {
  return (
    <WorkTaskStoreProvider>
      <WorkTasksPageInner />
    </WorkTaskStoreProvider>
  );
}
