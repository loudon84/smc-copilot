import { useTranslation } from "react-i18next";
import type { WorkContextRef } from "../../../../../../../../shared/work/work-context-contract";

export function ContextPanel({ contextRefs }: { contextRefs: WorkContextRef[] }) {
  const { t } = useTranslation();
  if (contextRefs.length === 0) {
    return <p className="hermes-task-panel__empty">{t("workspaces.hermes.tasks.rightPanel.noContext")}</p>;
  }
  return (
    <ul className="hermes-task-panel__list">
      {contextRefs.map((ref) => (
        <li key={ref.id}>
          <strong>{ref.title}</strong>
          <span className="hermes-task-panel__meta">{ref.type}</span>
          {ref.summary ? <p>{ref.summary}</p> : null}
        </li>
      ))}
    </ul>
  );
}
