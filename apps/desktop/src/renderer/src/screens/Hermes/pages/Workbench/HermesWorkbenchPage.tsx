import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useHermesDefault } from "../../context/HermesDefaultContext";
import { useNavigateToRun } from "../../features/expert-call/useNavigateToRun";
import { useQuickTaskEntry } from "../../features/workbench/useQuickTaskEntry";
import { useWorkbenchOverview } from "../../features/workbench/useWorkbenchOverview";
import type { WorkExpert } from "../../model/expert";
import type { WorkExpertTeam } from "../../model/expert-team";
import type { WorkArtifact } from "../../model/artifact";
import {
  ExpertSummonDrawer,
  type ExpertSummonTarget,
} from "../Experts/components/ExpertSummonDrawer";
import { ConnectionStatusCard } from "./components/ConnectionStatusCard";
import { QuickTaskEntry } from "./components/QuickTaskEntry";
import { RecentArtifacts } from "./components/RecentArtifacts";
import { RecentRuns } from "./components/RecentRuns";
import { RecommendedExperts } from "./components/RecommendedExperts";
import { RecommendedTeams } from "./components/RecommendedTeams";

export default function HermesWorkbenchPage() {
  const { t } = useTranslation();
  const { setActiveNavItem } = useHermesDefault();
  const navigateToRun = useNavigateToRun();
  const {
    gatewayHealth,
    diagnostics,
    syncRegistered,
    catalogSource,
    gatewayOnline,
    recommendedExperts,
    recommendedTeams,
    recentRuns,
    recentArtifacts,
    loading,
    error,
    refresh,
  } = useWorkbenchOverview();

  const { prompt, setPrompt, selectedExpert, selectExpert, reset: resetQuickTask } = useQuickTaskEntry(
    recommendedExperts,
  );

  const [summonOpen, setSummonOpen] = useState(false);
  const [summonTarget, setSummonTarget] = useState<ExpertSummonTarget | null>(null);

  const openExpertSummon = useCallback(
    (expert: WorkExpert, starterPrompt?: string) => {
      setSummonTarget({
        slug: expert.slug,
        kind: "expert",
        displayName: expert.displayName,
        callableSkillCount: expert.skillCount,
        starterPrompt: starterPrompt ?? expert.starterPrompts[0]?.prompt,
      });
      setSummonOpen(true);
    },
    [],
  );

  const openTeamSummon = useCallback((team: WorkExpertTeam) => {
    setSummonTarget({
      slug: team.slug,
      kind: "expert_team",
      displayName: team.displayName,
      callableSkillCount: team.skillCount,
      starterPrompt: team.starterPrompts[0]?.prompt,
    });
    setSummonOpen(true);
  }, []);

  const handleQuickTaskSummon = () => {
    if (!selectedExpert || !prompt.trim()) return;
    openExpertSummon(selectedExpert, prompt.trim());
  };

  const handleSummonSuccess = useCallback(
    (runId: string) => {
      setSummonOpen(false);
      setSummonTarget(null);
      resetQuickTask();
      navigateToRun(runId);
      void refresh();
    },
    [navigateToRun, refresh, resetQuickTask],
  );

  const handleArtifactPreview = (_artifact: WorkArtifact) => {
    setActiveNavItem("artifacts");
  };

  return (
    <div className="hermes-page hermes-workbench-page">
      <header className="hermes-page__header">
        <div>
          <h2>{t("workspaces.hermes.workbench.title")}</h2>
          <p className="hermes-page__subtitle">{t("workspaces.hermes.workbench.subtitle")}</p>
        </div>
        <button type="button" className="hermes-btn-ghost" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "hermes-spin" : undefined} />
          {t("workspaces.hermes.common.refresh")}
        </button>
      </header>

      {error ? (
        <div className="hermes-page__error">
          <p>{error}</p>
          <button type="button" className="hermes-btn-ghost" onClick={() => void refresh()}>
            {t("workspaces.hermes.chat.retry")}
          </button>
        </div>
      ) : null}

      <section className="hermes-workbench-grid">
        <ConnectionStatusCard
          catalogSource={catalogSource}
          syncRegistered={syncRegistered}
          gatewayHealth={gatewayHealth}
          diagnostics={diagnostics}
          gatewayOnline={gatewayOnline}
          onOpenMcpGateway={() => setActiveNavItem("mcpGateway")}
        />

        <QuickTaskEntry
          experts={recommendedExperts}
          prompt={prompt}
          selectedExpert={selectedExpert}
          disabled={loading || !gatewayOnline}
          onPromptChange={setPrompt}
          onSelectExpert={selectExpert}
          onSummon={handleQuickTaskSummon}
        />

        <RecommendedExperts
          experts={recommendedExperts}
          onView={() => setActiveNavItem("experts")}
          onViewExpert={() => setActiveNavItem("experts")}
          onSummon={openExpertSummon}
        />

        <RecommendedTeams
          teams={recommendedTeams}
          onView={() => setActiveNavItem("expertTeams")}
          onViewTeam={() => setActiveNavItem("expertTeams")}
          onSummon={openTeamSummon}
        />

        <RecentRuns
          runs={recentRuns}
          onOpenRun={navigateToRun}
          onViewAll={() => setActiveNavItem("expertRuns")}
        />

        <RecentArtifacts
          artifacts={recentArtifacts}
          onPreview={handleArtifactPreview}
          onOpenRun={navigateToRun}
          onViewAll={() => setActiveNavItem("artifacts")}
        />
      </section>

      <ExpertSummonDrawer
        open={summonOpen}
        target={summonTarget}
        onClose={() => {
          setSummonOpen(false);
          setSummonTarget(null);
        }}
        onSuccess={handleSummonSuccess}
      />
    </div>
  );
}
