import { useTranslation } from "react-i18next";
import type { WorkTaskEvent } from "../../../../../../../../shared/work/work-event-contract";

export function ApprovalBlock({ event }: { event: WorkTaskEvent }) {
  const { t } = useTranslation();
  if (event.type !== "approval.required") return null;
  return (
    <div className="hermes-stream-block hermes-stream-block--approval">
      <div className="hermes-stream-block__title">{t("workspaces.hermes.tasks.stream.approval")}</div>
      <p><strong>{event.actionName}</strong></p>
      {event.target ? <p>{event.target}</p> : null}
      {event.riskLevel ? <span className="hermes-task-risk">{event.riskLevel}</span> : null}
      <div className="hermes-stream-block__actions">
        <button type="button" className="hermes-btn-primary">{t("workspaces.hermes.tasks.stream.agree")}</button>
        <button type="button" className="hermes-btn-ghost">{t("workspaces.hermes.tasks.stream.reject")}</button>
      </div>
    </div>
  );
}
