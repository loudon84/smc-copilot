import { ArrowLeft, PanelRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HermesDefaultWebChatSurface } from "../../Chat/HermesDefaultWebChatSurface";
import { useWorkTaskSessionBinding } from "../../../hooks/useWorkTaskSessionBinding";
import { useWorkTaskStore } from "../../../features/task-store/useWorkTaskStore";
import { WorkTaskContextBar } from "./WorkTaskContextBar";
import { TaskRightPanel } from "./TaskRightPanel";

export function TaskWindow() {
  const { t } = useTranslation();
  const {
    activeTask,
    events,
    outputs,
    participants,
    rightPanelOpen,
    rightPanelTab,
    closeTask,
    setRightPanelTab,
    setRightPanelOpen,
  } = useWorkTaskStore();

  useWorkTaskSessionBinding(activeTask);

  if (!activeTask) return null;

  return (
    <div className="hermes-task-window hermes-task-window--v741">
      <div className="hermes-task-window__main">
        <header className="hermes-task-header">
          <button
            type="button"
            className="hermes-icon-button"
            title={t("workspaces.hermes.tasks.backHome", { defaultValue: "Back to tasks" })}
            onClick={() => closeTask()}
          >
            <ArrowLeft size={16} />
          </button>
          <div className="hermes-task-header__meta">
            <strong className="hermes-task-header__title">{activeTask.title}</strong>
            <span className="hermes-task-header__session">
              {activeTask.sessionId.slice(0, 8)}… · {activeTask.profile}
            </span>
          </div>
          <div className="hermes-task-header__actions">
            <span className={`hermes-task-status-dot is-${activeTask.status}`} />
            <button
              type="button"
              className="hermes-icon-button"
              title={t("workspaces.hermes.tasks.toggleRightPanel", { defaultValue: "Toggle panel" })}
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
            >
              <PanelRight size={16} />
            </button>
          </div>
        </header>
        <WorkTaskContextBar task={activeTask} />
        <div className="hermes-task-window__chat">
          <HermesDefaultWebChatSurface
            forcedSessionId={activeTask.sessionId}
            hideActiveExpertBar
          />
        </div>
      </div>
      {rightPanelOpen ? (
        <TaskRightPanel
          open={rightPanelOpen}
          tab={rightPanelTab}
          task={activeTask}
          events={events}
          outputs={outputs}
          participants={participants}
          onTabChange={setRightPanelTab}
          onClose={() => setRightPanelOpen(false)}
        />
      ) : null}
    </div>
  );
}
