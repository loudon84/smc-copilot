import { useTranslation } from "react-i18next";

export function SkillsPanel({ skillIds }: { skillIds: string[] }) {
  const { t } = useTranslation();
  if (skillIds.length === 0) {
    return <p className="hermes-task-panel__empty">{t("workspaces.hermes.tasks.rightPanel.noSkills")}</p>;
  }
  return (
    <ul className="hermes-task-panel__list">
      {skillIds.map((id) => (
        <li key={id}>{id}</li>
      ))}
    </ul>
  );
}
