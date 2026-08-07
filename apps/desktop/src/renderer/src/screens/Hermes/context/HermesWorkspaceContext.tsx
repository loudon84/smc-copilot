import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { HERMES_DEFAULT_PROFILE, STORAGE_KEYS } from "../constants";

export type HermesActiveWorkspaceMode = "default" | "expert" | "team";

export type HermesWorkMode = "ask" | "plan" | "craft";

export type HermesWorkspaceState = {
  mode: HermesActiveWorkspaceMode;
  activeProfileId: string;
  activeExpertId?: string;
  activeTeamId?: string;
  activeRunId?: string;
  activeSessionId: string | null;
  workMode: HermesWorkMode;
};

type HermesWorkspaceContextValue = HermesWorkspaceState & {
  setMode: (mode: HermesActiveWorkspaceMode) => void;
  setActiveProfileId: (profileId: string) => void;
  setActiveExpertId: (expertId: string | undefined) => void;
  setActiveTeamId: (teamId: string | undefined) => void;
  setActiveRunId: (runId: string | undefined) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  setWorkMode: (mode: HermesWorkMode) => void;
  resetToDefault: () => void;
  bindExpert: (input: {
    expertId: string;
    profileId: string;
    runId?: string;
    sessionId?: string | null;
  }) => void;
  bindTeam: (input: {
    teamId: string;
    leaderProfileId: string;
    runId?: string;
    sessionId?: string | null;
  }) => void;
};

const DEFAULT_WORKSPACE: HermesWorkspaceState = {
  mode: "default",
  activeProfileId: HERMES_DEFAULT_PROFILE,
  activeExpertId: undefined,
  activeTeamId: undefined,
  activeRunId: undefined,
  activeSessionId: null,
  workMode: "ask",
};

function readWorkspace(): HermesWorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.workspaceState);
    if (!raw) return DEFAULT_WORKSPACE;
    return { ...DEFAULT_WORKSPACE, ...JSON.parse(raw) } as HermesWorkspaceState;
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

function writeWorkspace(state: HermesWorkspaceState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.workspaceState, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

const HermesWorkspaceContext = createContext<HermesWorkspaceContextValue | null>(null);

export function HermesWorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HermesWorkspaceState>(readWorkspace);

  const patch = useCallback((partial: Partial<HermesWorkspaceState>) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      writeWorkspace(next);
      return next;
    });
  }, []);

  const setMode = useCallback((mode: HermesActiveWorkspaceMode) => patch({ mode }), [patch]);
  const setActiveProfileId = useCallback(
    (activeProfileId: string) => patch({ activeProfileId }),
    [patch],
  );
  const setActiveExpertId = useCallback(
    (activeExpertId: string | undefined) => patch({ activeExpertId }),
    [patch],
  );
  const setActiveTeamId = useCallback(
    (activeTeamId: string | undefined) => patch({ activeTeamId }),
    [patch],
  );
  const setActiveRunId = useCallback(
    (activeRunId: string | undefined) => patch({ activeRunId }),
    [patch],
  );
  const setActiveSessionId = useCallback(
    (activeSessionId: string | null) => patch({ activeSessionId }),
    [patch],
  );
  const setWorkMode = useCallback((workMode: HermesWorkMode) => patch({ workMode }), [patch]);

  const resetToDefault = useCallback(() => {
    const next = { ...DEFAULT_WORKSPACE };
    writeWorkspace(next);
    setState(next);
  }, []);

  const bindExpert = useCallback(
    (input: {
      expertId: string;
      profileId: string;
      runId?: string;
      sessionId?: string | null;
    }) => {
      patch({
        mode: "expert",
        activeExpertId: input.expertId,
        activeTeamId: undefined,
        activeProfileId: input.profileId,
        activeRunId: input.runId,
        activeSessionId: input.sessionId ?? null,
      });
    },
    [patch],
  );

  const bindTeam = useCallback(
    (input: {
      teamId: string;
      leaderProfileId: string;
      runId?: string;
      sessionId?: string | null;
    }) => {
      patch({
        mode: "team",
        activeTeamId: input.teamId,
        activeExpertId: undefined,
        activeProfileId: input.leaderProfileId,
        activeRunId: input.runId,
        activeSessionId: input.sessionId ?? null,
      });
    },
    [patch],
  );

  const value = useMemo(
    () => ({
      ...state,
      setMode,
      setActiveProfileId,
      setActiveExpertId,
      setActiveTeamId,
      setActiveRunId,
      setActiveSessionId,
      setWorkMode,
      resetToDefault,
      bindExpert,
      bindTeam,
    }),
    [
      state,
      setMode,
      setActiveProfileId,
      setActiveExpertId,
      setActiveTeamId,
      setActiveRunId,
      setActiveSessionId,
      setWorkMode,
      resetToDefault,
      bindExpert,
      bindTeam,
    ],
  );

  return (
    <HermesWorkspaceContext.Provider value={value}>{children}</HermesWorkspaceContext.Provider>
  );
}

export function useHermesWorkspace(): HermesWorkspaceContextValue {
  const ctx = useContext(HermesWorkspaceContext);
  if (!ctx) {
    throw new Error("useHermesWorkspace must be used within HermesWorkspaceProvider");
  }
  return ctx;
}
