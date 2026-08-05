import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
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
  loadChatWorkspaceState,
  saveChatWorkspaceState,
} from "./chatWorkspacePersistence";

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
  setActiveRunId: (runId: string | null) => void;
  openRun: (input: OpenChatRunInput, activate?: boolean) => void;
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

export function ChatWorkspaceProvider({
  children,
  initialActiveRunId = null,
  persist = true,
}: {
  children: React.ReactNode;
  initialActiveRunId?: string | null;
  persist?: boolean;
}): React.JSX.Element {
  const [state, dispatch] = useReducer(
    chatWorkspaceReducer,
    undefined,
    () => {
      if (persist) {
        const loaded = loadChatWorkspaceState();
        if (loaded && loaded.runs.length > 0) {
          seedCreatedOrder(loaded);
          return loaded;
        }
      }
      return createInitialChatWorkspaceState({
        activeRunId: initialActiveRunId,
      });
    },
  );

  const prevRunsRef = useRef(state.runs);

  useEffect(() => {
    if (!persist) return;
    saveChatWorkspaceState(state);
  }, [state, persist]);

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

  const openRun = useCallback((input: OpenChatRunInput, activate = true) => {
    dispatch({ type: "openRun", input, activate });
  }, []);

  const closeRun = useCallback((runId: string) => {
    dispatch({ type: "closeRun", runId });
  }, []);

  const setActiveRunId = useCallback((runId: string | null) => {
    dispatch({ type: "setActive", runId });
    if (runId) {
      dispatch({ type: "markUnread", runId, unread: false });
    }
  }, []);

  const patchRun = useCallback(
    (runId: string, patch: DeepPartial<ChatRunRecord>) => {
      dispatch({ type: "patchRun", runId, patch });
    },
    [],
  );

  const renameRun = useCallback((runId: string, title: string) => {
    dispatch({ type: "renameRun", runId, title });
  }, []);

  const returnDefault = useCallback((runId: string) => {
    dispatch({ type: "returnDefault", runId });
  }, []);

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
    },
    [],
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
      setActiveRunId,
      openRun,
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
      setActiveRunId,
      openRun,
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
