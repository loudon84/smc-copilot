import { useTranslation } from "react-i18next";
import type { WorkTaskEvent } from "../../../../../../../../shared/work/work-event-contract";

export function GovernancePanel({ events }: { events: WorkTaskEvent[] }) {
  const { t } = useTranslation();
  const approvals = events.filter(
    (e) =>
      e.type === "approval.required" ||
      e.type === "approval.granted" ||
      e.type === "approval.rejected",
  );
  const errors = events.filter((e) => e.type === "error" || e.type === "task.failed");

  if (approvals.length === 0 && errors.length === 0) {
    return <p className="hermes-task-panel__empty">{t("workspaces.hermes.tasks.rightPanel.noGovernance")}</p>;
  }

  return (
    <div className="hermes-task-governance">
      {approvals.map((e) => (
        <div key={e.id} className="hermes-task-governance__item">
          {e.type === "approval.required" ? (
            <>
              <strong>{e.actionName}</strong>
              <p>{e.target}</p>
            </>
          ) : (
            <span>{e.type}</span>
          )}
        </div>
      ))}
      {errors.map((e) => (
        <div key={e.id} className="hermes-task-governance__item is-error">
          {e.type === "error" ? e.error.message : String(e.payload?.message ?? e.type)}
        </div>
      ))}
    </div>
  );
}
