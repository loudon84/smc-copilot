import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { workspacesApi } from "../api/workspacesApi";
import { STORAGE_KEYS, type NavItemKey } from "../constants";
import { useProfileRuntime, type ProfileRuntimeHandle } from "../hooks/useProfileRuntime";
import { useProfileSessions } from "../hooks/useProfileSessions";
import type { AIOSProfile, AIOSSession, RightInspectorTab } from "../types";

export interface WorkspacesContextValue {
  activeProfileId: string | null;
  activeSessionId: string | null;
  activeRightTab: RightInspectorTab;
  rightPanelCollapsed: boolean;
  leftPanelCollapsed: boolean;
  activeNavItem: NavItemKey;
  profiles: AIOSProfile[];
  setProfiles: Dispatch<SetStateAction<AIOSProfile[]>>;
  setActiveProfileId: (id: string | null) => void;
  setActiveSessionId: (id: string | null) => void;
  setActiveRightTab: (tab: RightInspectorTab) => void;
  setRightPanelCollapsed: (collapsed: boolean) => void;
  setLeftPanelCollapsed: (collapsed: boolean) => void;
  setActiveNavItem: (key: NavItemKey) => void;
  activeProfile: AIOSProfile | null;
  sessionsRefreshNonce: number;
  refreshSessions: () => void;
  runtime: ProfileRuntimeHandle;
  sessions: AIOSSession[];
  sessionsLoading: boolean;
  sessionsKeyword: string;
  setSessionsKeyword: (keyword: string) => void;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
}

const WorkspacesContext = createContext<WorkspacesContextValue | null>(null);

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function normalizeNavItem(value: string | undefined): NavItemKey {
  if (
    value === "chat" ||
    value === "sessions" ||
    value === "skills" ||
    value === "tools" ||
    value === "memory" ||
    value === "providers" ||
    value === "models"
  ) {
    return value;
  }
  if (value === "settings") {
    return "chat";
  }
  return "chat";
}

export interface WorkspacesProviderProps {
  children: ReactNode;
  initialProfileId?: string;
  initialNavItem?: string;
  onNavItemChange?: (key: NavItemKey) => void;
}

export function WorkspacesProvider({
  children,
  initialProfileId,
  initialNavItem,
  onNavItemChange,
}: WorkspacesProviderProps): React.JSX.Element {
  const [profiles, setProfiles] = useState<AIOSProfile[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(() => {
    return readStorage(STORAGE_KEYS.activeProfileId) ?? initialProfileId ?? null;
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeRightTab, setActiveRightTabState] = useState<RightInspectorTab>(() => {
    const saved = readStorage(STORAGE_KEYS.activeRightTab);
    if (saved === "workspace" || saved === "skills" || saved === "memory" || saved === "runtime") {
      return saved;
    }
    return "runtime";
  });
  const [rightPanelCollapsed, setRightPanelCollapsedState] = useState(() => {
    return readStorage(STORAGE_KEYS.collapsedRightPanel) === "true";
  });
  const [leftPanelCollapsed, setLeftPanelCollapsedState] = useState(() => {
    return readStorage(STORAGE_KEYS.collapsedLeftPanel) === "true";
  });
  const [sessionsRefreshNonce, setSessionsRefreshNonce] = useState(0);
  const [sessionsKeyword, setSessionsKeyword] = useState("");
  const [activeNavItem, setActiveNavItemState] = useState<NavItemKey>(() => {
    if (initialNavItem) {
      return normalizeNavItem(initialNavItem);
    }
    const saved = readStorage(STORAGE_KEYS.activeNavItem);
    return normalizeNavItem(saved ?? undefined);
  });

  const refreshSessions = useCallback(() => {
    setSessionsRefreshNonce((n) => n + 1);
  }, []);

  const runtime = useProfileRuntime(activeProfileId, profiles, setProfiles);
  const sessionsHandle = useProfileSessions(activeProfileId, sessionsKeyword, sessionsRefreshNonce);

  const setActiveProfileId = useCallback((id: string | null) => {
    void workspacesApi.abortChat();
    if (activeProfileId) {
      void window.workspaceChat.abort(activeProfileId);
    }
    setActiveProfileIdState(id);
    if (id) writeStorage(STORAGE_KEYS.activeProfileId, id);
    setActiveSessionId(null);
    setSessionsKeyword("");
  }, [activeProfileId]);

  const setActiveRightTab = useCallback((tab: RightInspectorTab) => {
    setActiveRightTabState(tab);
    writeStorage(STORAGE_KEYS.activeRightTab, tab);
  }, []);

  const setRightPanelCollapsed = useCallback((collapsed: boolean) => {
    setRightPanelCollapsedState(collapsed);
    writeStorage(STORAGE_KEYS.collapsedRightPanel, String(collapsed));
  }, []);

  const setLeftPanelCollapsed = useCallback((collapsed: boolean) => {
    setLeftPanelCollapsedState(collapsed);
    writeStorage(STORAGE_KEYS.collapsedLeftPanel, String(collapsed));
  }, []);

  const setActiveNavItem = useCallback(
    (key: NavItemKey) => {
      setActiveNavItemState(key);
      writeStorage(STORAGE_KEYS.activeNavItem, key);
      onNavItemChange?.(key);
    },
    [onNavItemChange],
  );

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId],
  );

  const value = useMemo(
    (): WorkspacesContextValue => ({
      activeProfileId,
      activeSessionId,
      activeRightTab,
      rightPanelCollapsed,
      leftPanelCollapsed,
      activeNavItem,
      profiles,
      setProfiles,
      setActiveProfileId,
      setActiveSessionId,
      setActiveRightTab,
      setRightPanelCollapsed,
      setLeftPanelCollapsed,
      setActiveNavItem,
      activeProfile,
      sessionsRefreshNonce,
      refreshSessions,
      runtime,
      sessions: sessionsHandle.sessions,
      sessionsLoading: sessionsHandle.loading,
      sessionsKeyword,
      setSessionsKeyword,
      renameSession: sessionsHandle.renameSession,
      deleteSession: sessionsHandle.deleteSession,
    }),
    [
      activeProfile,
      activeProfileId,
      activeRightTab,
      activeSessionId,
      activeNavItem,
      profiles,
      rightPanelCollapsed,
      leftPanelCollapsed,
      runtime,
      sessionsHandle.deleteSession,
      sessionsHandle.loading,
      sessionsHandle.renameSession,
      sessionsHandle.sessions,
      sessionsKeyword,
      sessionsRefreshNonce,
      refreshSessions,
      setActiveProfileId,
      setActiveRightTab,
      setRightPanelCollapsed,
      setLeftPanelCollapsed,
      setActiveNavItem,
    ],
  );

  return (
    <WorkspacesContext.Provider value={value}>{children}</WorkspacesContext.Provider>
  );
}

export function useWorkspaces(): WorkspacesContextValue {
  const ctx = useContext(WorkspacesContext);
  if (!ctx) {
    throw new Error("useWorkspaces must be used within WorkspacesProvider");
  }
  return ctx;
}
