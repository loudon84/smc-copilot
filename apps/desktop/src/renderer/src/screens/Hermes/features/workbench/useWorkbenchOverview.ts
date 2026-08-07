import { useCallback, useEffect, useState } from "react";
import type {
  ExpertCatalogSource,
  ExpertGatewayDiagnostics,
  ExpertHealthResponse,
} from "../../../../../../shared/hermes-experts/hermes-experts-contract";
import { mapHermesExpert, mapHermesExpertTeam, workApi } from "../../api/workApi";
import type { WorkArtifact } from "../../model/artifact";
import type { WorkExpert } from "../../model/expert";
import type { WorkExpertTeam } from "../../model/expert-team";
import type { WorkRun } from "../../model/run";
import { MOCK_EXPERTS, MOCK_EXPERT_TEAMS } from "../../pages/Experts/mock/expert-mock-data";
import { pickRecommendedExperts, pickRecommendedTeams } from "./workbenchRecommend";

const RECENT_RUNS_LIMIT = 5;
const RECENT_ARTIFACTS_LIMIT = 5;
const RECOMMENDED_EXPERTS_LIMIT = 4;
const RECOMMENDED_TEAMS_LIMIT = 3;

export function useWorkbenchOverview() {
  const [gatewayHealth, setGatewayHealth] = useState<ExpertHealthResponse | null>(null);
  const [diagnostics, setDiagnostics] = useState<ExpertGatewayDiagnostics | null>(null);
  const [syncRegistered, setSyncRegistered] = useState(false);
  const [catalogSource, setCatalogSource] = useState<ExpertCatalogSource>("mock");
  const [recommendedExperts, setRecommendedExperts] = useState<WorkExpert[]>([]);
  const [recommendedTeams, setRecommendedTeams] = useState<WorkExpertTeam[]>([]);
  const [recentRuns, setRecentRuns] = useState<WorkRun[]>([]);
  const [recentArtifacts, setRecentArtifacts] = useState<WorkArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!window.hermesExperts) {
        const mockExperts = MOCK_EXPERTS.map(mapHermesExpert);
        const mockTeams = MOCK_EXPERT_TEAMS.map(mapHermesExpertTeam);
        setCatalogSource("mock");
        setRecommendedExperts(pickRecommendedExperts(mockExperts, RECOMMENDED_EXPERTS_LIMIT));
        setRecommendedTeams(pickRecommendedTeams(mockTeams, RECOMMENDED_TEAMS_LIMIT));
        setRecentRuns([]);
        setRecentArtifacts([]);
        setGatewayHealth(null);
        setDiagnostics(null);
        setSyncRegistered(false);
        return;
      }

      const [expertsPage, teamsPage, runs, artifacts, sync, health, diag] = await Promise.all([
        workApi.experts.listPage({ category: "all" }),
        workApi.teams.listPage({ category: "all" }),
        workApi.runs.list({ limit: RECENT_RUNS_LIMIT }),
        workApi.artifacts.listLocal(RECENT_ARTIFACTS_LIMIT),
        workApi.gateway.desktopSyncStatus(),
        workApi.gateway.health(),
        workApi.gateway.diagnostics(),
      ]);

      setCatalogSource(expertsPage.source);
      setRecommendedExperts(pickRecommendedExperts(expertsPage.items, RECOMMENDED_EXPERTS_LIMIT));
      setRecommendedTeams(pickRecommendedTeams(teamsPage.items, RECOMMENDED_TEAMS_LIMIT));
      setRecentRuns(runs);
      setRecentArtifacts(artifacts);
      setGatewayHealth(health);
      setDiagnostics(diag);
      setSyncRegistered(Boolean(sync.ok && sync.data?.registered));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    gatewayHealth,
    diagnostics,
    syncRegistered,
    catalogSource,
    gatewayOnline: Boolean(gatewayHealth?.ok),
    recommendedExperts,
    recommendedTeams,
    recentRuns,
    recentArtifacts,
    loading,
    error,
    refresh,
  };
}
