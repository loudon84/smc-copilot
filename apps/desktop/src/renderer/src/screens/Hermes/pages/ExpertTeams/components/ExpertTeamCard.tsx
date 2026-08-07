import { UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkExpertTeam } from "../../../model/expert-team";

type Props = {
  team: WorkExpertTeam;
  canSummon: boolean;
  onView: (team: WorkExpertTeam) => void;
  onSummon: (team: WorkExpertTeam) => void;
};

export function ExpertTeamCard({ team, canSummon, onView, onSummon }: Props) {
  const { t } = useTranslation();
  const memberCount = team.memberCount ?? team.members.length + 1;

  return (
    <article className="hermes-expert-card hermes-team-card">
      <div className="hermes-expert-card__header">
        <div className="hermes-expert-card__avatar" aria-hidden>
          {team.avatar ? <img src={team.avatar} alt="" /> : <UsersRound size={20} />}
        </div>
        <div className="hermes-expert-card__title">
          <h3>{team.displayName}</h3>
          <span className="hermes-expert-card__provider">
            {t("workspaces.hermes.expertTeams.memberCount", { count: memberCount })}
          </span>
        </div>
      </div>
      <p className="hermes-expert-card__desc">{team.description}</p>
      {team.tags.length > 0 ? (
        <div className="hermes-expert-card__tags">
          {team.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="hermes-tag">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="hermes-expert-card__meta">
        {team.status ? <span className="hermes-badge">{team.status}</span> : null}
        <span className="hermes-badge hermes-badge--remote">
          {t("workspaces.hermes.expertTeams.remote", { defaultValue: "Remote team" })}
        </span>
        {team.skillCount != null ? (
          <span className="hermes-badge">
            {t("workspaces.hermes.experts.callableSkills", {
              defaultValue: "{{count}} callable",
              count: team.skillCount,
            })}
          </span>
        ) : null}
      </div>
      <div className="hermes-expert-card__actions">
        <button type="button" className="hermes-btn-ghost" onClick={() => onView(team)}>
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
          onClick={() => onSummon(team)}
        >
          {t("workspaces.hermes.expertTeams.summonTeam")}
        </button>
      </div>
    </article>
  );
}
