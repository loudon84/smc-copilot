import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useExpertTeams } from "../../features/expert-team/useExpertTeams";
import { canSummonTeam } from "../../features/expert-call/canSummon";
import { useNavigateToRun } from "../../features/expert-call/useNavigateToRun";
import type { WorkExpertTeam } from "../../model/expert-team";
import { ExpertFilterBar } from "../Experts/components/ExpertFilterBar";
import { ExpertGrid } from "../Experts/components/ExpertGrid";
import {
  ExpertSummonDrawer,
  type ExpertSummonTarget,
} from "../Experts/components/ExpertSummonDrawer";
import { ExpertTeamCard } from "./components/ExpertTeamCard";
import { TeamDetailDrawer } from "./components/TeamDetailDrawer";

export default function HermesExpertTeamsPage() {
  const { t } = useTranslation();
  const navigateToRun = useNavigateToRun();
  const {
    teams,
    loading,
    error,
    category,
    setCategory,
    keyword,
    setKeyword,
    refresh,
  } = useExpertTeams();

  const [selected, setSelected] = useState<WorkExpertTeam | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<ExpertSummonTarget | null>(null);
  const [callOpen, setCallOpen] = useState(false);

  const openCall = (team: WorkExpertTeam) => {
    setCallTarget({
      slug: team.slug,
      kind: "expert_team",
      displayName: team.displayName,
      callableSkillCount: team.skillCount,
      starterPrompt: team.starterPrompts[0]?.prompt,
    });
    setCallOpen(true);
  };

  return (
    <div className="hermes-page hermes-expert-teams-page">
      <header className="hermes-page__header">
        <div>
          <h2>{t("workspaces.nav.expertTeams")}</h2>
          <p className="hermes-page__subtitle">{t("workspaces.hermes.expertTeams.subtitle")}</p>
        </div>
        <button type="button" className="hermes-btn-ghost" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "hermes-spin" : undefined} />
          {t("workspaces.hermes.common.refresh")}
        </button>
      </header>

      <ExpertFilterBar
        keyword={keyword}
        category={category}
        onKeywordChange={setKeyword}
        onCategoryChange={setCategory}
        ariaLabel="Team categories"
      />

      {error ? (
        <div className="hermes-page__error">
          <p>{error}</p>
          <button type="button" className="hermes-btn-ghost" onClick={() => void refresh()}>
            {t("workspaces.hermes.chat.retry")}
          </button>
        </div>
      ) : null}

      {loading && teams.length === 0 ? (
        <p className="hermes-page__loading">{t("workspaces.hermes.common.loading")}</p>
      ) : null}

      {!loading && teams.length === 0 ? (
        <p className="hermes-page__empty">{t("workspaces.hermes.expertTeams.empty")}</p>
      ) : (
        <ExpertGrid>
          {teams.map((team) => (
            <ExpertTeamCard
              key={team.id}
              team={team}
              canSummon={canSummonTeam(team)}
              onView={(item) => {
                setSelected(item);
                setDrawerOpen(true);
              }}
              onSummon={openCall}
            />
          ))}
        </ExpertGrid>
      )}

      <TeamDetailDrawer
        team={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSummon={openCall}
      />
      <ExpertSummonDrawer
        target={callTarget?.kind === "expert_team" ? callTarget : null}
        open={callOpen}
        onClose={() => setCallOpen(false)}
        onSuccess={(runId) => {
          setDrawerOpen(false);
          navigateToRun(runId);
        }}
      />
    </div>
  );
}
