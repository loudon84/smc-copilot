import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  ChatRunRecord,
  DeepPartial,
  OpenChatRunInput,
} from "./ChatRunRecord";
import { ensureCreatedOrderAtLeast } from "./ChatRunRecord";
import {
  chatWorkspaceReducer,
  createInitialChatWorkspaceState,
  getRunById,
  type ChatWorkspaceState,
} from "./chatWorkspaceReducer";
import {
  loadPersistentChatWorkspace,
  subscribeChatWorkspaceChanged,
} from "./usePersistentChatWorkspace";
import { DEFAULT_CHAT_WORKSPACE_ID } from "@shared/chat-workspace/chat-workspace-contract";

export type ControllerStateSnapshot = {
  runId: string;
  sessionId: string | null;
  runState: ChatRunRecord["execution"]["runState"];
  selectedModelId: string | null;
  firstUserPrompt?: string;
  sessionTitle?: string | null;
};

type ChatWorkspaceContextValue = {
  runs: ChatRunRecord[];
  activeRunId: string | null;
  activeRun: ChatRunRecord | undefined;
  restoring: boolean;
  setActiveRunId: (runId: string | null) => void;
  openRun: (input: OpenChatRunInput, activate?: boolean) => void;
  openSession: (input: {
    profileId: string;
    sessionId: string;
    title?: string;
    forceNewTab?: boolean;
  }) => Promise<{ runId: string; created: boolean }>;
  closeRun: (runId: string) => void;
  patchRun: (runId: string, patch: DeepPartial<ChatRunRecord>) => void;
  renameRun: (runId: string, title: string) => void;
  returnDefault: (runId: string) => void;
  markUnread: (runId: string, unread?: boolean) => void;
  applyControllerSnapshot: (
    snapshot: ControllerStateSnapshot,
    active: boolean,
  ) => void;
  getRun: (runId: string) => ChatRunRecord | undefined;
};

const ChatWorkspaceContext = createContext<ChatWorkspaceContextValue | null>(
  null,
);

function seedCreatedOrder(state: ChatWorkspaceState): void {
  const max = state.runs.reduce(
    (acc, r) => Math.max(acc, r.identity.createdOrder),
    0,
  );
  ensureCreatedOrderAtLeast(max);
}

function tryNotifyBackgroundComplete(run: ChatRunRecord): void {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification("Chat completed", {
        body: run.presentation.title || "Background chat finished",
      });
    } else if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    /* ignore — in-app unread is enough */
  }
}

function hasApi(): boolean {
  return typeof window !== "undefined" && Boolean(window.chatWorkspace);
}

export function ChatWorkspaceProvider({
  children,
  initialActiveRunId = null,
  persist = true,
  workspaceId = DEFAULT_CHAT_WORKSPACE_ID,
}: {
  children: React.ReactNode;
  initialActiveRunId?: string | null;
  persist?: boolean;
  workspaceId?: string;
}): React.JSX.Element {
  const [state, dispatch] = useReducer(
    chatWorkspaceReducer,
    undefined,
    () =>
      createInitialChatWorkspaceState({
        activeRunId: initialActiveRunId,
      }),
  );
  const [restoring, setRestoring] = useState(persist && hasApi());
  const prevRunsRef = useRef(state.runs);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!persist || !hasApi()) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { state: loaded } = await loadPersistentChatWorkspace(workspaceId);
        if (cancelled) return;
        seedCreatedOrder(loaded);
        dispatch({ type: "restore", state: loaded });
        hydratedRef.current = true;
      } catch (err) {
        console.warn("[ChatWorkspaceProvider] hydrate failed:", err);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persist, workspaceId]);

  useEffect(() => {
    if (!persist || !hasApi()) return;
    return subscribeChatWorkspaceChanged((next) => {
      seedCreatedOrder(next);
      dispatch({ type: "restore", state: next });
    }, workspaceId);
  }, [persist, workspaceId]);

  useEffect(() => {
    const prev = prevRunsRef.current;
    for (const run of state.runs) {
      if (run.runId === state.activeRunId) continue;
      const before = prev.find((r) => r.runId === run.runId);
      if (!before) continue;
      const becameComplete =
        before.execution.runState !== "completed" &&
        run.execution.runState === "completed" &&
        run.presentation.unread;
      if (becameComplete) tryNotifyBackgroundComplete(run);
    }
    prevRunsRef.current = state.runs;
  }, [state.runs, state.activeRunId]);

  const openRun = useCallback(
    (input: OpenChatRunInput, activate = true) => {
      dispatch({ type: "openRun", input, activate });
      if (persist && hasApi()) {
        void window.chatWorkspace
          .open({
            workspaceId,
            runId: input.runId,
            profileId: input.profileId,
            sessionId: input.sessionId,
            title: input.title,
            mode: input.mode,
            expertId: input.expertId,
            expertName: input.expertName,
            teamId: input.teamId,
            teamName: input.teamName,
            skillName: input.skillName,
            skillDisplayName: input.skillDisplayName,
            workMode: input.workMode,
            permissionMode: input.permissionMode,
            modelId: input.selectedModelId,
            activate,
          })
          .catch((err) =>
            console.warn("[ChatWorkspaceProvider] open failed:", err),
          );
      }
    },
    [persist, workspaceId],
  );

  const openSession = useCallback(
    async (input: {
      profileId: string;
      sessionId: string;
      title?: string;
      forceNewTab?: boolean;
    }) => {
      if (!hasApi()) {
        const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        openRun(
          {
            runId,
            profileId: input.profileId,
            sessionId: input.sessionId,
            title: input.title || "New Chat",
          },
          true,
        );
        return { runId, created: true };
      }
      const result = await window.chatWorkspace.openSession({
        workspaceId,
        profileId: input.profileId,
        sessionId: input.sessionId,
        title: input.title,
        forceNewTab: input.forceNewTab,
      });
      return { runId: result.runId, created: result.created };
    },
    [openRun, workspaceId],
  );

  const closeRun = useCallback(
    (runId: string) => {
      dispatch({ type: "closeRun", runId });
      if (persist && hasApi()) {
        void window.chatWorkspace
          .closeRun({ workspaceId, runId })
          .catch((err) =>
            console.warn("[ChatWorkspaceProvider] close failed:", err),
          );
      }
    },
    [persist, workspaceId],
  );

  const setActiveRunId = useCallback(
    (runId: string | null) => {
      dispatch({ type: "setActive", runId });
      if (runId) {
        dispatch({ type: "markUnread", runId, unread: false });
      }
      if (persist && hasApi()) {
        void window.chatWorkspace
          .setActive({ workspaceId, runId })
          .catch((err) =>
            console.warn("[ChatWorkspaceProvider] setActive failed:", err),
          );
      }
    },
    [persist, workspaceId],
  );

  const patchRun = useCallback(
    (runId: string, patch: DeepPartial<ChatRunRecord>) => {
      dispatch({ type: "patchRun", runId, patch });
      if (persist && hasApi()) {
        void window.chatWorkspace
          .patchRun({
            workspaceId,
            runId,
            patch: {
              profileId: patch.identity?.profileId,
              sessionId: patch.identity?.sessionId,
              title: patch.presentation?.title,
              titleSource: patch.presentation?.titleSource,
              mode: patch.context?.mode,
              expertId: patch.context?.expertId,
              expertName: patch.context?.expertName,
              teamId: patch.context?.teamId,
              teamName: patch.context?.teamName,
              skillName: patch.context?.skillName,
              skillDisplayName: patch.context?.skillDisplayName,
              workMode: patch.context?.workMode,
              permissionMode: patch.context?.permissionMode,
              modelId: patch.presentation?.selectedModelId,
              runState: patch.execution?.runState,
              draft: patch.presentation?.draft,
              filesVisible: patch.presentation?.sessionFilesVisible,
              previewFileId: patch.presentation?.previewFileId,
              previewMaximized: patch.presentation?.previewMaximized,
            },
          })
          .catch((err) =>
            console.warn("[ChatWorkspaceProvider] patch failed:", err),
          );
      }
    },
    [persist, workspaceId],
  );

  const renameRun = useCallback(
    (runId: string, title: string) => {
      dispatch({ type: "renameRun", runId, title });
      if (persist && hasApi()) {
        void window.chatWorkspace
          .patchRun({
            workspaceId,
            runId,
            patch: { title, titleSource: "user" },
          })
          .catch((err) =>
            console.warn("[ChatWorkspaceProvider] rename failed:", err),
          );
      }
    },
    [persist, workspaceId],
  );

  const returnDefault = useCallback(
    (runId: string) => {
      dispatch({ type: "returnDefault", runId });
      if (persist && hasApi()) {
        void window.chatWorkspace
          .patchRun({
            workspaceId,
            runId,
            patch: {
              mode: "default",
              expertId: null,
              expertName: null,
              teamId: null,
              teamName: null,
              skillName: null,
              skillDisplayName: null,
              permissionMode: "default",
            },
          })
          .catch((err) =>
            console.warn("[ChatWorkspaceProvider] returnDefault failed:", err),
          );
      }
    },
    [persist, workspaceId],
  );

  const markUnread = useCallback((runId: string, unread = true) => {
    dispatch({ type: "markUnread", runId, unread });
  }, []);

  const applyControllerSnapshot = useCallback(
    (snapshot: ControllerStateSnapshot, active: boolean) => {
      dispatch({
        type: "applyControllerSnapshot",
        runId: snapshot.runId,
        active,
        snapshot: {
          sessionId: snapshot.sessionId,
          runState: snapshot.runState,
          selectedModelId: snapshot.selectedModelId,
          firstUserPrompt: snapshot.firstUserPrompt,
          sessionTitle: snapshot.sessionTitle,
        },
      });
      if (persist && hasApi()) {
        void window.chatWorkspace
          .patchRun({
            workspaceId,
            runId: snapshot.runId,
            patch: {
              sessionId: snapshot.sessionId,
              runState: snapshot.runState,
              modelId: snapshot.selectedModelId,
              ...(snapshot.sessionTitle
                ? { title: snapshot.sessionTitle, titleSource: "session" as const }
                : snapshot.firstUserPrompt
                  ? {
                      title: snapshot.firstUserPrompt.slice(0, 40),
                      titleSource: "first_prompt" as const,
                    }
                  : {}),
            },
          })
          .catch((err) =>
            console.warn(
              "[ChatWorkspaceProvider] applyControllerSnapshot failed:",
              err,
            ),
          );
      }
    },
    [persist, workspaceId],
  );

  const getRun = useCallback(
    (runId: string) => getRunById(state, runId),
    [state],
  );

  const value = useMemo<ChatWorkspaceContextValue>(
    () => ({
      runs: state.runs,
      activeRunId: state.activeRunId,
      activeRun: getRunById(state, state.activeRunId),
      restoring,
      setActiveRunId,
      openRun,
      openSession,
      closeRun,
      patchRun,
      renameRun,
      returnDefault,
      markUnread,
      applyControllerSnapshot,
      getRun,
    }),
    [
      state,
      restoring,
      setActiveRunId,
      openRun,
      openSession,
      closeRun,
      patchRun,
      renameRun,
      returnDefault,
      markUnread,
      applyControllerSnapshot,
      getRun,
    ],
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
