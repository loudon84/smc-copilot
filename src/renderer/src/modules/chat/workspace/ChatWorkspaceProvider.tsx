import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useChatWorkspaceManager } from "./useChatWorkspaceManager";
import type { ChatRunRegistryEntry } from "./chatRunRegistry";

type ChatWorkspaceContextValue = {
  runs: ChatRunRegistryEntry[];
  activeRunId: string | null;
  setActiveRunId: (runId: string) => void;
  openRun: (entry: {
    runId: string;
    sessionId?: string | null;
    profileId: string;
    title?: string;
    expertId?: string;
    teamId?: string;
    expertRunId?: string;
  }) => void;
  closeRun: (runId: string) => void;
  markUnread: (runId: string, unread?: boolean) => void;
  markCompleted: (runId: string) => void;
  setLoading: (runId: string, loading: boolean) => void;
};

const ChatWorkspaceContext = createContext<ChatWorkspaceContextValue | null>(
  null,
);

export function ChatWorkspaceProvider({
  children,
  initialActiveRunId = null,
}: {
  children: React.ReactNode;
  initialActiveRunId?: string | null;
}): React.JSX.Element {
  const [activeRunId, setActiveRunId] = useState<string | null>(
    initialActiveRunId,
  );
  const mgr = useChatWorkspaceManager(activeRunId ?? undefined);

  const openRun = useCallback(
    (entry: {
      runId: string;
      sessionId?: string | null;
      profileId: string;
      title?: string;
      expertId?: string;
      teamId?: string;
      expertRunId?: string;
    }) => {
      mgr.register({
        runId: entry.runId,
        sessionId: entry.sessionId ?? null,
        profileId: entry.profileId,
        expertRunId: entry.expertRunId,
        title: entry.title || "Chat",
        loading: false,
        unread: false,
        completed: false,
      });
      setActiveRunId(entry.runId);
    },
    [mgr],
  );

  const value = useMemo(
    () => ({
      runs: mgr.runs,
      activeRunId,
      setActiveRunId,
      openRun,
      closeRun: mgr.close,
      markUnread: mgr.markUnread,
      markCompleted: mgr.markCompleted,
      setLoading: mgr.setLoading,
    }),
    [mgr, activeRunId, openRun],
  );

  return (
    <ChatWorkspaceContext.Provider value={value}>
      {children}
    </ChatWorkspaceContext.Provider>
  );
}

export function useChatWorkspace(): ChatWorkspaceContextValue {
  const ctx = useContext(ChatWorkspaceContext);
  if (!ctx) {
    throw new Error("useChatWorkspace must be used within ChatWorkspaceProvider");
  }
  return ctx;
}
