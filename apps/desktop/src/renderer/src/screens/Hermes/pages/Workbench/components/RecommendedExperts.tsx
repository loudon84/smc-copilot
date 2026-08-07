import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { canSummonExpert } from "../../../features/expert-call/canSummon";
import type { WorkExpert } from "../../../model/expert";

type Props = {
  experts: WorkExpert[];
  onView: () => void;
  onViewExpert: (expert: WorkExpert) => void;
  onSummon: (expert: WorkExpert) => void;
};

export function RecommendedExperts({ experts, onView, onViewExpert, onSummon }: Props) {
  const { t } = useTranslation();

  return (
    <article className="hermes-workbench-card">
      <h3>
        <Users size={16} /> {t("workspaces.hermes.workbench.recommendedExperts")}
      </h3>
      {experts.length === 0 ? (
        <p className="hermes-muted">{t("workspaces.hermes.workbench.recommendedExpertsEmpty")}</p>
      ) : (
        <ul className="hermes-workbench-list hermes-workbench-recommended-list">
          {experts.map((expert) => {
            const summonable = canSummonExpert(expert);
            return (
              <li key={expert.id} className="hermes-workbench-recommended-item">
                <div>
                  <strong>{expert.displayName}</strong>
                  <span className="hermes-muted">
                    {expert.category} · {expert.skillCount} skills
                  </span>
                </div>
                <div className="hermes-workbench-recommended-item__actions">
                  <button type="button" className="hermes-btn-ghost" onClick={() => onViewExpert(expert)}>
                    {t("workspaces.hermes.experts.view")}
                  </button>
                  {summonable ? (
                    <button type="button" className="hermes-btn-primary" onClick={() => onSummon(expert)}>
                      {t("workspaces.hermes.experts.summon")}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="hermes-workbench-actions">
        <button type="button" className="hermes-btn-ghost" onClick={onView}>
          {t("workspaces.hermes.workbench.viewAllExperts")}
        </button>
      </div>
    </article>
  );
}
