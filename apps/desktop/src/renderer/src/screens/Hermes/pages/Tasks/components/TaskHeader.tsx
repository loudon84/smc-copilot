import { ArrowLeft, PanelRight, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkTask } from "../../../../../../../shared/work/work-task-contract";

type Props = {
  task: WorkTask;
  onRename: (title: string) => void;
  onBack: () => void;
  onToggleRightPanel: () => void;
};

export function TaskHeader({ task, onRename, onBack, onToggleRightPanel }: Props) {
  const { t } = useTranslation();
  return (
    <header className="hermes-task-header">
      <button type="button" className="hermes-btn-ghost" onClick={onBack}>
        <ArrowLeft size={14} />
        {t("workspaces.hermes.tasks.window.back")}
      </button>
      <input
        className="hermes-task-header__title"
        value={task.title}
        onChange={(e) => onRename(e.target.value)}
      />
      <span className={`hermes-task-status-badge hermes-task-status-badge--${task.status}`}>
        {task.status}
      </span>
      <div className="hermes-task-header__actions">
        <button type="button" className="hermes-icon-button" title={t("workspaces.hermes.tasks.window.search")}>
          <Search size={16} />
        </button>
        <button
          type="button"
          className="hermes-icon-button"
          title={t("workspaces.hermes.tasks.window.togglePanel")}
          onClick={onToggleRightPanel}
        >
          <PanelRight size={16} />
        </button>
      </div>
    </header>
  );
}
