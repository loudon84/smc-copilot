import { useTranslation } from "react-i18next";

import type { KanbanController } from "../controller/useKanbanController";

interface Props {
  controller: KanbanController;
}

export function KanbanHeader({ controller }: Props) {
  const { t } = useTranslation();
  const { state, actions } = controller;
  return (
    <div className="kanban-header">
      <h1>{t("kanban.title")}</h1>
      <div className="kanban-header-actions">
        <button
          type="button"
          className="btn"
          onClick={() => void actions.refresh()}
          disabled={state.actionBusy !== null}
        >
          {state.refreshing ? t("kanban.refreshing") : t("kanban.refresh")}
        </button>
        <button type="button" className="btn" onClick={actions.toggleArchived}>
          {state.showArchived ? t("kanban.hideArchived") : t("kanban.showArchived")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void actions.dispatch(false)}
          disabled={!state.selectedBoardSlug || state.actionBusy !== null}
        >
          {t("kanban.dispatch")}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => actions.openCreateTask(true)}
          disabled={!state.selectedBoardSlug}
        >
          + {t("kanban.newTask")}
        </button>
      </div>
    </div>
  );
}
