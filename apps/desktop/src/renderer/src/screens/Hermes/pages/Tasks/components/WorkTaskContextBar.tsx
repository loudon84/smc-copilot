import { useTranslation } from "react-i18next";
import type { WorkTask } from "../../../../../../../shared/work/work-task-contract";

type Props = {
  task: WorkTask;
};

export function WorkTaskContextBar({ task }: Props) {
  const { t } = useTranslation();
  const chips: string[] = [];

  if (task.activeTeamId) {
    chips.push(`${t("workspaces.hermes.tasks.composer.team", { defaultValue: "Team" })}: ${task.activeTeamId}`);
  }
  if (task.mode) {
    chips.push(`${t("workspaces.hermes.tasks.composer.mode", { defaultValue: "Mode" })}: ${task.mode}`);
  }
  if (task.selectedExpertIds.length) {
    chips.push(`Experts: ${task.selectedExpertIds.length}`);
  }
  if (task.selectedSkillIds.length) {
    chips.push(`Skills: ${task.selectedSkillIds.length}`);
  }
  if (task.selectedAppIds.length) {
    chips.push(`Apps: ${task.selectedAppIds.length}`);
  }
  chips.push(
    t(`workspaces.hermes.tasks.permission.${task.permissionMode}`, {
      defaultValue: task.permissionMode,
    }),
  );

  if (chips.length === 0) return null;

  return (
    <div className="hermes-work-task-context-bar" role="toolbar" aria-label="Task context">
      {chips.map((chip) => (
        <span key={chip} className="hermes-task-chip">
          {chip}
        </span>
      ))}
    </div>
  );
}
