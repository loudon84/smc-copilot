import {

  createContext,

  useCallback,

  useContext,

  useMemo,

  useState,

  type ReactNode,

} from "react";

import type {

  HermesExpert,

  ExpertCatalogQuery,

  ExpertCatalogSource,

} from "../../../../../shared/hermes-experts/hermes-experts-contract";

import type { HermesExpertTeam, ExpertTeamCatalogQuery } from "../types/hermes-expert-teams";

import { workApi } from "../api/workApi";

import { MOCK_EXPERTS, MOCK_EXPERT_TEAMS } from "../pages/Experts/mock/expert-mock-data";



export type HermesExpertsCatalogSource = ExpertCatalogSource;



type HermesExpertsContextValue = {

  experts: HermesExpert[];

  teams: HermesExpertTeam[];

  catalogSource: HermesExpertsCatalogSource;

  loading: boolean;

  error: string | null;

  refreshExperts: (query?: ExpertCatalogQuery) => Promise<void>;

  refreshTeams: (query?: ExpertTeamCatalogQuery) => Promise<void>;

  getExpertById: (expertId: string) => HermesExpert | undefined;

  getTeamById: (teamId: string) => HermesExpertTeam | undefined;

};



const HermesExpertsContext = createContext<HermesExpertsContextValue | null>(null);



function filterExperts(items: HermesExpert[], query?: ExpertCatalogQuery): HermesExpert[] {

  let result = items;

  if (query?.category && query.category !== "all") {

    result = result.filter((e) => e.category === query.category);

  }

  if (query?.keyword?.trim()) {

    const q = query.keyword.trim().toLowerCase();

    result = result.filter(

      (e) =>

        e.name.toLowerCase().includes(q) ||

        e.description.toLowerCase().includes(q) ||

        e.tags.some((t) => t.toLowerCase().includes(q)),

    );

  }

  return result;

}



function filterTeams(items: HermesExpertTeam[], query?: ExpertTeamCatalogQuery): HermesExpertTeam[] {

  let result = items;

  if (query?.category && query.category !== "all") {

    result = result.filter((t) => t.category === query.category);

  }

  if (query?.keyword?.trim()) {

    const q = query.keyword.trim().toLowerCase();

    result = result.filter(

      (t) =>

        t.name.toLowerCase().includes(q) ||

        t.description.toLowerCase().includes(q) ||

        (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),

    );

  }

  return result;

}



export function HermesExpertsProvider({ children }: { children: ReactNode }) {

  const [experts, setExperts] = useState<HermesExpert[]>(MOCK_EXPERTS);

  const [teams, setTeams] = useState<HermesExpertTeam[]>(MOCK_EXPERT_TEAMS);

  const [catalogSource, setCatalogSource] = useState<HermesExpertsCatalogSource>("mock");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);



  const loadFromApi = useCallback(async () => {

    if (!window.hermesExperts) {

      return false;

    }

    try {

      const [expertPage, teamPage] = await Promise.all([

        workApi.experts.listRawPage(),

        workApi.teams.listRawPage(),

      ]);

      setExperts(expertPage.items);

      setTeams(teamPage.items);

      setCatalogSource(expertPage.source ?? "remote");

      return true;

    } catch {

      return false;

    }

  }, []);



  const refreshExperts = useCallback(

    async (query?: ExpertCatalogQuery) => {

      setLoading(true);

      setError(null);

      try {

        const ok = await loadFromApi();

        if (!ok) {

          setExperts(filterExperts(MOCK_EXPERTS, query));

          setCatalogSource("mock");

        } else if (query) {

          setExperts((prev) => filterExperts(prev, query));

        }

      } catch (e) {

        setError(e instanceof Error ? e.message : String(e));

        setExperts(filterExperts(MOCK_EXPERTS, query));

        setCatalogSource("mock");

      } finally {

        setLoading(false);

      }

    },

    [loadFromApi],

  );



  const refreshTeams = useCallback(

    async (query?: ExpertTeamCatalogQuery) => {

      setLoading(true);

      setError(null);

      try {

        const ok = await loadFromApi();

        if (!ok) {

          setTeams(filterTeams(MOCK_EXPERT_TEAMS, query));

          setCatalogSource("mock");

        } else if (query) {

          setTeams((prev) => filterTeams(prev, query));

        }

      } catch (e) {

        setError(e instanceof Error ? e.message : String(e));

        setTeams(filterTeams(MOCK_EXPERT_TEAMS, query));

        setCatalogSource("mock");

      } finally {

        setLoading(false);

      }

    },

    [loadFromApi],

  );



  const getExpertById = useCallback(

    (expertId: string) => experts.find((e) => e.expertId === expertId),

    [experts],

  );



  const getTeamById = useCallback(

    (teamId: string) => teams.find((t) => t.teamId === teamId),

    [teams],

  );



  const value = useMemo(

    () => ({

      experts,

      teams,

      catalogSource,

      loading,

      error,

      refreshExperts,

      refreshTeams,

      getExpertById,

      getTeamById,

    }),

    [

      experts,

      teams,

      catalogSource,

      loading,

      error,

      refreshExperts,

      refreshTeams,

      getExpertById,

      getTeamById,

    ],

  );



  return (

    <HermesExpertsContext.Provider value={value}>{children}</HermesExpertsContext.Provider>

  );

}



export function useHermesExpertsCatalog(): HermesExpertsContextValue {

  const ctx = useContext(HermesExpertsContext);

  if (!ctx) {

    throw new Error("useHermesExpertsCatalog must be used within HermesExpertsProvider");

  }

  return ctx;

}

