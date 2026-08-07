import { useTranslation } from "react-i18next";
import type { WorkParticipant } from "../../../../../../../../shared/work/work-participant-contract";

export function ParticipantsPanel({ participants }: { participants: WorkParticipant[] }) {
  const { t } = useTranslation();
  if (participants.length === 0) {
    return <p className="hermes-task-panel__empty">{t("workspaces.hermes.tasks.rightPanel.noParticipants")}</p>;
  }
  return (
    <ul className="hermes-task-panel__list">
      {participants.map((p) => (
        <li key={p.id}>
          <strong>{p.name}</strong>
          {p.role ? <span className="hermes-task-panel__meta"> · {p.role}</span> : null}
          <div className="hermes-task-panel__meta">{p.status}</div>
          {p.currentAction ? <p>{p.currentAction}</p> : null}
        </li>
      ))}
    </ul>
  );
}
