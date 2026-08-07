import { useTranslation } from "react-i18next";
import type { WorkExpertTeam } from "../../../model/expert-team";
import { ExpertTeamMemberList } from "./ExpertTeamMemberList";
import { ExpertStarterPrompts } from "../../Experts/components/ExpertStarterPrompts";

type Props = {
  team: WorkExpertTeam | null;
  open: boolean;
  onClose: () => void;
  onSummon: (team: WorkExpertTeam) => void;
};

export function TeamDetailDrawer({ team, open, onClose, onSummon }: Props) {
  const { t } = useTranslation();
  if (!open || !team) return null;

  return (
    <div className="hermes-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="hermes-drawer hermes-expert-drawer hermes-team-drawer"
        role="dialog"
        aria-label={team.displayName}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hermes-drawer__header">
          <h2>{team.displayName}</h2>
          <button type="button" className="hermes-icon-button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="hermes-drawer__body">
          <p>{team.description}</p>
          {team.toolName ? (
            <section>
              <h3>{t("workspaces.hermes.experts.toolName", { defaultValue: "MCP tool" })}</h3>
              <code>{team.toolName}</code>
            </section>
          ) : null}
          {team.leaderRoleName ? (
            <section>
              <h3>{t("workspaces.hermes.expertTeams.leader")}</h3>
              <p>{team.leaderRoleName}</p>
            </section>
          ) : null}
          <ExpertTeamMemberList members={team.members} />
          <section>
            <h3>{t("workspaces.hermes.expertTeams.orchestration")}</h3>
            <p className="hermes-muted">
              {t("workspaces.hermes.expertTeams.serverManaged", {
                defaultValue: "Team orchestration is managed by the remote Expert MCP server.",
              })}
            </p>
          </section>
          <ExpertStarterPrompts prompts={team.starterPrompts} onSelect={() => onSummon(team)} />
        </div>
        <footer className="hermes-drawer__footer">
          <button type="button" className="hermes-btn-primary" onClick={() => onSummon(team)}>
            {t("workspaces.hermes.expertTeams.summonTeam")}
          </button>
        </footer>
      </aside>
    </div>
  );
}

/** @deprecated use TeamDetailDrawer */
export function ExpertTeamDetailModal({
  team,
  open,
  onClose,
  onSummon,
}: {
  team: WorkExpertTeam | null;
  open: boolean;
  onClose: () => void;
  onSummon: (team: WorkExpertTeam) => void;
}) {
  return <TeamDetailDrawer team={team} open={open} onClose={onClose} onSummon={onSummon} />;
}
