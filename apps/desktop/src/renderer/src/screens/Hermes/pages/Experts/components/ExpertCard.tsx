import { UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkExpert } from "../../../model/expert";

type Props = {
  expert: WorkExpert;
  canSummon: boolean;
  onView: (expert: WorkExpert) => void;
  onSummon: (expert: WorkExpert) => void;
};

export function ExpertCard({ expert, canSummon, onView, onSummon }: Props) {
  const { t } = useTranslation();
  const isRemote = expert.executionMode === "remote_mcp" || expert.profileId === "remote";

  return (
    <article className="hermes-expert-card">
      <div className="hermes-expert-card__header">
        <div className="hermes-expert-card__avatar" aria-hidden>
          {expert.avatar ? <img src={expert.avatar} alt="" /> : <UserRound size={20} />}
        </div>
        <div className="hermes-expert-card__title">
          <h3>{expert.displayName}</h3>
          <span className="hermes-expert-card__provider">{expert.provider}</span>
        </div>
      </div>
      <p className="hermes-expert-card__desc">{expert.description}</p>
      <div className="hermes-expert-card__tags">
        {expert.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="hermes-tag">
            {tag}
          </span>
        ))}
      </div>
      <div className="hermes-expert-card__meta">
        {expert.status ? <span className="hermes-badge">{expert.status}</span> : null}
        {expert.riskLevel ? <span className="hermes-badge">{expert.riskLevel}</span> : null}
        {isRemote ? (
          <span className="hermes-badge hermes-badge--trust-trusted">
            {t("workspaces.hermes.experts.remoteMcp", { defaultValue: "Remote MCP" })}
          </span>
        ) : expert.trustStatus ? (
          <span className={`hermes-badge hermes-badge--trust-${expert.trustStatus}`}>
            {t(`workspaces.hermes.experts.trust.${expert.trustStatus}`, {
              defaultValue: expert.trustStatus,
            })}
          </span>
        ) : null}
        {expert.skillCount != null ? (
          <span className="hermes-badge">
            {t("workspaces.hermes.experts.callableSkills", {
              defaultValue: "{{count}} callable",
              count: expert.skillCount,
            })}
          </span>
        ) : null}
      </div>
      <div className="hermes-expert-card__actions">
        <button type="button" className="hermes-btn-ghost" onClick={() => onView(expert)}>
          {t("workspaces.hermes.experts.view")}
        </button>
        <button
          type="button"
          className="hermes-btn-primary"
          disabled={!canSummon}
          title={
            !canSummon
              ? t("workspaces.hermes.experts.summonDisabled", {
                  defaultValue: "Not ready or no callable skills",
                })
              : undefined
          }
          onClick={() => onSummon(expert)}
        >
          {t("workspaces.hermes.experts.summon")}
        </button>
      </div>
    </article>
  );
}
