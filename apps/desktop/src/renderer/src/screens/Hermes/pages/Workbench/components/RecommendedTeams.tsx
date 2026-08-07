import { UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { canSummonTeam } from "../../../features/expert-call/canSummon";
import type { WorkExpertTeam } from "../../../model/expert-team";

type Props = {
  teams: WorkExpertTeam[];
  onView: () => void;
  onViewTeam: (team: WorkExpertTeam) => void;
  onSummon: (team: WorkExpertTeam) => void;
};

export function RecommendedTeams({ teams, onView, onViewTeam, onSummon }: Props) {
  const { t } = useTranslation();

  return (
    <article className="hermes-workbench-card">
      <h3>
        <UsersRound size={16} /> {t("workspaces.hermes.workbench.recommendedTeams")}
      </h3>
      {teams.length === 0 ? (
        <p className="hermes-muted">{t("workspaces.hermes.workbench.recommendedTeamsEmpty")}</p>
      ) : (
        <ul className="hermes-workbench-list hermes-workbench-recommended-list">
          {teams.map((team) => {
            const summonable = canSummonTeam(team);
            return (
              <li key={team.id} className="hermes-workbench-recommended-item">
                <div>
                  <strong>{team.displayName}</strong>
                  <span className="hermes-muted">
                    {team.memberCount ?? team.members.length + 1}{" "}
                    {t("workspaces.hermes.expertTeams.members")}
                  </span>
                </div>
                <div className="hermes-workbench-recommended-item__actions">
                  <button type="button" className="hermes-btn-ghost" onClick={() => onViewTeam(team)}>
                    {t("workspaces.hermes.experts.view")}
                  </button>
                  {summonable ? (
                    <button type="button" className="hermes-btn-primary" onClick={() => onSummon(team)}>
                      {t("workspaces.hermes.expertTeams.summonTeam")}
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
          {t("workspaces.hermes.workbench.viewAllTeams")}
        </button>
      </div>
    </article>
  );
}
