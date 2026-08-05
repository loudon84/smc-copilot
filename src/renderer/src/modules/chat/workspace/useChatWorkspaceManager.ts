import { useEffect, useState, useCallback } from "react";
import {
  getChatRun,
  listChatRuns,
  patchChatRun,
  removeChatRun,
  subscribeChatRuns,
  upsertChatRun,
  type ChatRunRegistryEntry,
} from "./chatRunRegistry";

/**
 * React hook over ChatRunRegistry for multi-chat workspace shell.
 */
export function useChatWorkspaceManager(activeRunId?: string): {
  runs: ChatRunRegistryEntry[];
  active: ChatRunRegistryEntry | undefined;
  register: (entry: Omit<ChatRunRegistryEntry, "updatedAt">) => void;
  markUnread: (runId: string, unread?: boolean) => void;
  markCompleted: (runId: string) => void;
  setLoading: (runId: string, loading: boolean) => void;
  bindSession: (runId: string, sessionId: string | null) => void;
  close: (runId: string) => void;
} {
  const [runs, setRuns] = useState(listChatRuns);

  useEffect(() => subscribeChatRuns(() => setRuns(listChatRuns())), []);

  const register = useCallback(
    (entry: Omit<ChatRunRegistryEntry, "updatedAt">) => {
      upsertChatRun(entry);
    },
    [],
  );

  const markUnread = useCallback((runId: string, unread = true) => {
    patchChatRun(runId, { unread });
  }, []);

  const markCompleted = useCallback((runId: string) => {
    patchChatRun(runId, {
      completed: true,
      loading: false,
      unread: true,
    });
  }, []);

  const setLoading = useCallback((runId: string, loading: boolean) => {
    patchChatRun(runId, { loading });
  }, []);

  const bindSession = useCallback((runId: string, sessionId: string | null) => {
    patchChatRun(runId, { sessionId });
  }, []);

  const close = useCallback((runId: string) => {
    removeChatRun(runId);
  }, []);

  return {
    runs,
    active: activeRunId ? getChatRun(activeRunId) : undefined,
    register,
    markUnread,
    markCompleted,
    setLoading,
    bindSession,
    close,
  };
}
