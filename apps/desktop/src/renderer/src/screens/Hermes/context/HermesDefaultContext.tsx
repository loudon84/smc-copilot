import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { HERMES_NAV_ITEMS, STORAGE_KEYS, type HermesNavItemKey } from "../constants";
import { useHermesDefaultMemory } from "../hooks/useHermesDefaultMemory";
import { useHermesDefaultModels } from "../hooks/useHermesDefaultModels";
import { useHermesDefaultProfile } from "../hooks/useHermesDefaultProfile";
import { useHermesDefaultRuntime } from "../hooks/useHermesDefaultRuntime";
import { useHermesDefaultSessions } from "../hooks/useHermesDefaultSessions";
import { useHermesDefaultSkills } from "../hooks/useHermesDefaultSkills";
import { useHermesDefaultTools } from "../hooks/useHermesDefaultTools";
import type { HermesRightInspectorTab } from "../types";

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

type HermesDefaultContextValue = {
  activeNavItem: HermesNavItemKey;
  setActiveNavItem: (key: HermesNavItemKey) => void;
  pendingExpertRunId: string | null;
  setPendingExpertRunId: (id: string | null) => void;
  navigateToExpertRun: (runId: string) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  activeRightTab: HermesRightInspectorTab;
  setActiveRightTab: (tab: HermesRightInspectorTab) => void;
  leftPanelCollapsed: boolean;
  setLeftPanelCollapsed: (v: boolean) => void;
  rightPanelCollapsed: boolean;
  setRightPanelCollapsed: (v: boolean) => void;
  profile: ReturnType<typeof useHermesDefaultProfile>;
  runtime: ReturnType<typeof useHermesDefaultRuntime>;
  sessions: ReturnType<typeof useHermesDefaultSessions>;
  models: ReturnType<typeof useHermesDefaultModels>;
  memory: ReturnType<typeof useHermesDefaultMemory>;
  skills: ReturnType<typeof useHermesDefaultSkills>;
  tools: ReturnType<typeof useHermesDefaultTools>;
  navItems: typeof HERMES_NAV_ITEMS;
  startNewConversation: () => void;
};

const HermesDefaultContext = createContext<HermesDefaultContextValue | null>(null);

function readActiveNavItem(): HermesNavItemKey {
  const stored = readStorage<HermesNavItemKey>(STORAGE_KEYS.activeNavItem, "chat");
  if (stored === "tasks" || stored === "workbench") return "chat";
  return stored;
}

export function HermesDefaultProvider({ children }: { children: ReactNode }) {
  const [activeNavItem, setActiveNavItemState] = useState<HermesNavItemKey>(readActiveNavItem);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(() =>
    readStorage(STORAGE_KEYS.activeSessionId, null),
  );
  const [activeRightTab, setActiveRightTabState] = useState<HermesRightInspectorTab>(() =>
    readStorage(STORAGE_KEYS.activeRightTab, "runtime"),
  );
  const [leftPanelCollapsed, setLeftPanelCollapsedState] = useState(() =>
    readStorage(STORAGE_KEYS.collapsedLeftPanel, false),
  );
  const [rightPanelCollapsed, setRightPanelCollapsedState] = useState(() =>
    readStorage(STORAGE_KEYS.collapsedRightPanel, false),
  );
  const [pendingExpertRunId, setPendingExpertRunIdState] = useState<string | null>(null);

  const profile = useHermesDefaultProfile();
  const runtime = useHermesDefaultRuntime();
  const sessions = useHermesDefaultSessions();
  const models = useHermesDefaultModels();
  const memory = useHermesDefaultMemory();
  const skills = useHermesDefaultSkills();
  const tools = useHermesDefaultTools();

  const setActiveNavItem = useCallback((key: HermesNavItemKey) => {
    setActiveNavItemState(key);
    writeStorage(STORAGE_KEYS.activeNavItem, key);
  }, []);

  const setPendingExpertRunId = useCallback((id: string | null) => {
    setPendingExpertRunIdState(id);
  }, []);

  const navigateToExpertRun = useCallback(
    (runId: string) => {
      setPendingExpertRunIdState(runId);
      setActiveNavItemState("chat");
      writeStorage(STORAGE_KEYS.activeNavItem, "chat");
    },
    [],
  );

  const setActiveSessionId = useCallback((id: string | null) => {
    setActiveSessionIdState(id);
    writeStorage(STORAGE_KEYS.activeSessionId, id);
  }, []);

  const setActiveRightTab = useCallback((tab: HermesRightInspectorTab) => {
    setActiveRightTabState(tab);
    writeStorage(STORAGE_KEYS.activeRightTab, tab);
  }, []);

  const setLeftPanelCollapsed = useCallback((v: boolean) => {
    setLeftPanelCollapsedState(v);
    writeStorage(STORAGE_KEYS.collapsedLeftPanel, v);
  }, []);

  const setRightPanelCollapsed = useCallback((v: boolean) => {
    setRightPanelCollapsedState(v);
    writeStorage(STORAGE_KEYS.collapsedRightPanel, v);
  }, []);

  const startNewConversation = useCallback(() => {
    setActiveSessionIdState(null);
    writeStorage(STORAGE_KEYS.activeSessionId, null);
  }, []);

  const value = useMemo(
    () => ({
      activeNavItem,
      setActiveNavItem,
      pendingExpertRunId,
      setPendingExpertRunId,
      navigateToExpertRun,
      activeSessionId,
      setActiveSessionId,
      activeRightTab,
      setActiveRightTab,
      leftPanelCollapsed,
      setLeftPanelCollapsed,
      rightPanelCollapsed,
      setRightPanelCollapsed,
      profile,
      runtime,
      sessions,
      models,
      memory,
      skills,
      tools,
      navItems: HERMES_NAV_ITEMS,
      startNewConversation,
    }),
    [
      activeNavItem,
      setActiveNavItem,
      pendingExpertRunId,
      setPendingExpertRunId,
      navigateToExpertRun,
      activeSessionId,
      setActiveSessionId,
      activeRightTab,
      setActiveRightTab,
      leftPanelCollapsed,
      setLeftPanelCollapsed,
      rightPanelCollapsed,
      setRightPanelCollapsed,
      profile,
      runtime,
      sessions,
      models,
      memory,
      skills,
      tools,
      startNewConversation,
    ],
  );

  return <HermesDefaultContext.Provider value={value}>{children}</HermesDefaultContext.Provider>;
}

export function useHermesDefault(): HermesDefaultContextValue {
  const ctx = useContext(HermesDefaultContext);
  if (!ctx) {
    throw new Error("useHermesDefault must be used within HermesDefaultProvider");
  }
  return ctx;
}

