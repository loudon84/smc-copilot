import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkExpert } from "../../../model/expert";

type Props = {
  experts: WorkExpert[];
  prompt: string;
  selectedExpert: WorkExpert | null;
  disabled?: boolean;
  onPromptChange: (value: string) => void;
  onSelectExpert: (expertId: string) => void;
  onSummon: () => void;
};

export function QuickTaskEntry({
  experts,
  prompt,
  selectedExpert,
  disabled,
  onPromptChange,
  onSelectExpert,
  onSummon,
}: Props) {
  const { t } = useTranslation();

  return (
    <article className="hermes-workbench-card hermes-workbench-quick-task">
      <h3>
        <Sparkles size={16} /> {t("workspaces.hermes.workbench.quickTask")}
      </h3>
      <p className="hermes-muted">{t("workspaces.hermes.workbench.quickTaskHint")}</p>
      <textarea
        className="hermes-workbench-quick-task__input"
        rows={3}
        value={prompt}
        placeholder={t("workspaces.hermes.workbench.quickTaskPlaceholder")}
        onChange={(e) => onPromptChange(e.target.value)}
        disabled={disabled}
      />
      {experts.length > 0 ? (
        <label className="hermes-workbench-quick-task__select">
          <span>{t("workspaces.hermes.workbench.quickTaskExpert")}</span>
          <select
            value={selectedExpert?.id ?? ""}
            onChange={(e) => onSelectExpert(e.target.value)}
            disabled={disabled}
          >
            {experts.map((expert) => (
              <option key={expert.id} value={expert.id}>
                {expert.displayName}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="hermes-muted">{t("workspaces.hermes.workbench.recommendedExpertsEmpty")}</p>
      )}
      <div className="hermes-workbench-actions">
        <button
          type="button"
          className="hermes-btn-primary"
          onClick={onSummon}
          disabled={disabled || !selectedExpert || !prompt.trim()}
        >
          {t("workspaces.hermes.workbench.quickTaskSubmit")}
        </button>
      </div>
    </article>
  );
}
