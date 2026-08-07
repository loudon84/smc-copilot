import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ExpertCatalogSource,
  ExpertTeamCatalogQuery,
} from "../../../../../../shared/hermes-experts/hermes-experts-contract";
import { workApi, mapHermesExpertTeam } from "../../api/workApi";
import type { WorkExpertTeam } from "../../model/expert-team";
import { MOCK_EXPERT_TEAMS } from "../../pages/Experts/mock/expert-mock-data";

function filterTeams(items: WorkExpertTeam[], query?: ExpertTeamCatalogQuery): WorkExpertTeam[] {
  let result = items;
  if (query?.category && query.category !== "all") {
    result = result.filter((t) => t.category === query.category);
  }
  if (query?.keyword?.trim()) {
    const q = query.keyword.trim().toLowerCase();
    result = result.filter(
      (t) =>
        t.displayName.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }
  return result;
}

export function useExpertTeams(initialQuery?: ExpertTeamCatalogQuery) {
  const [teams, setTeams] = useState<WorkExpertTeam[]>(() =>
    MOCK_EXPERT_TEAMS.map(mapHermesExpertTeam),
  );
  const [catalogSource, setCatalogSource] = useState<ExpertCatalogSource>("mock");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(initialQuery?.category ?? "all");
  const [keyword, setKeyword] = useState(initialQuery?.keyword ?? "");

  const refresh = useCallback(
    async (query?: ExpertTeamCatalogQuery) => {
      setLoading(true);
      setError(null);
      const effectiveQuery = {
        category: query?.category ?? category,
        keyword: query?.keyword ?? keyword,
      };

      try {
        if (!window.hermesExperts) {
          setTeams(filterTeams(MOCK_EXPERT_TEAMS.map(mapHermesExpertTeam), effectiveQuery));
          setCatalogSource("mock");
          return;
        }
        const page = await workApi.teams.listPage(effectiveQuery);
        setTeams(page.items);
        setCatalogSource(page.source);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setTeams(filterTeams(MOCK_EXPERT_TEAMS.map(mapHermesExpertTeam), effectiveQuery));
        setCatalogSource("mock");
      } finally {
        setLoading(false);
      }
    },
    [category, keyword],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(
    () => filterTeams(teams, { category, keyword }),
    [teams, category, keyword],
  );

  return {
    teams: filtered,
    catalogSource,
    loading,
    error,
    category,
    setCategory,
    keyword,
    setKeyword,
    refresh,
  };
}
