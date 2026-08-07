import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { HermesPanelPageContext, HermesPanelTaskInput } from "../../../components/hermes";
import {
  clearCurrentTaskSnapshot,
  readCurrentTaskSnapshot,
  recordToTaskInput,
  taskInputFromSnapshot,
  writeCurrentTaskSnapshot,
} from "../lib/web-operator-current-task-cache";
import { WebOperatorPageContextReact } from "./web-operator-page-context-instance";
import type {
  WebOperatorHermesAnalysisRequest,
  WebOperatorPageContextValue,
  WebOperatorTaskStartDialogHandlers,
  WebOperatorTaskStartDialogState,
} from "./web-operator-page-context-types";

export type {
  WebOperatorHermesAnalysisRequest,
  WebOperatorPageContextValue,
  WebOperatorTaskStartDialogHandlers,
  WebOperatorTaskStartDialogState,
} from "./web-operator-page-context-types";

export { WebOperatorPageContextReact } from "./web-operator-page-context-instance";

function applyTaskPageContext(
  task: HermesPanelTaskInput,
  setPageContextState: (ctx: HermesPanelPageContext | null) => void,
  setPageUrl: (url: string | null) => void,
): void {
  setPageContextState(task.pageContext);
  setPageUrl(task.pageUrl.trim());
}

export function WebOperatorPageContextProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [pageContext, setPageContextState] = useState<HermesPanelPageContext | null>(null);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [currentTask, setCurrentTaskState] = useState<HermesPanelTaskInput | null>(null);
  const [analysisRequest, setAnalysisRequest] =
    useState<WebOperatorHermesAnalysisRequest | null>(null);
  const [taskStartDialog, setTaskStartDialog] =
    useState<WebOperatorTaskStartDialogState | null>(null);
  const [taskStartDialogHandlers, setTaskStartDialogHandlers] =
    useState<WebOperatorTaskStartDialogHandlers | null>(null);
  const taskSessionUpsertedIdRef = useRef<string | null>(null);
  const hydrateStartedRef = useRef(false);
  /** 用户取消 Dialog 后，同一 JSSDK requestId 不再自动弹框 */
  const dismissedHostBridgeRequestIdsRef = useRef(new Set<string>());

  const setCurrentTask = useCallback((task: HermesPanelTaskInput | null) => {
    setCurrentTaskState(task);
    if (task) {
      writeCurrentTaskSnapshot(task);
      applyTaskPageContext(task, setPageContextState, setPageUrl);
    } else {
      clearCurrentTaskSnapshot();
    }
  }, []);

  useEffect(() => {
    if (hydrateStartedRef.current) return;
    hydrateStartedRef.current = true;

    void (async () => {
      try {
        const last = await window.webOperatorTaskSession.getLastActive();
        if (last.record) {
          const task = recordToTaskInput(last.record);
          setCurrentTaskState(task);
          writeCurrentTaskSnapshot(task);
          applyTaskPageContext(task, setPageContextState, setPageUrl);
          return;
        }

        const snap = readCurrentTaskSnapshot();
        if (snap) {
          const task = taskInputFromSnapshot(snap);
          setCurrentTaskState(task);
          applyTaskPageContext(task, setPageContextState, setPageUrl);
        }
      } catch (e) {
        console.warn("[WebOperatorPageContext] hydrate currentTask failed:", e);
      }
    })();
  }, []);

  const setPageContext = useCallback((ctx: HermesPanelPageContext | null) => {
    setPageContextState(ctx);
  }, []);

  const requestHermesAnalysis = useCallback(
    (input: {
      pageUrl: string;
      pageContext: HermesPanelPageContext;
      source?: string;
      requestId?: string;
      profile?: string;
      requiredSkillName?: string;
      formType?: string;
      action?: "create" | "edit" | "view" | "analytic";
      callbackUrl?: string;
      preferStartDialog?: boolean;
      hostBridgeRequestId?: string;
      force?: boolean;
    }) => {
      const hostId = input.hostBridgeRequestId?.trim();
      if (
        !input.force &&
        hostId &&
        dismissedHostBridgeRequestIdsRef.current.has(hostId)
      ) {
        return;
      }

      const source = (input.source ?? "manual").trim();
      const requestId =
        input.requestId?.trim() ??
        input.hostBridgeRequestId?.trim() ??
        `wo-analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const normalizedUrl = input.pageUrl.trim();
      if (
        !input.force &&
        currentTask?.source === source &&
        currentTask?.requestId === requestId
      ) {
        setPageContextState(input.pageContext);
        setPageUrl(normalizedUrl);
        return;
      }

      setPageContextState(input.pageContext);
      setPageUrl(normalizedUrl);
      setAnalysisRequest({
        source,
        requestId,
        pageUrl: normalizedUrl,
        pageContext: input.pageContext,
        createdAt: new Date().toISOString(),
        profile: input.profile,
        requiredSkillName: input.requiredSkillName,
        formType: input.formType,
        action: input.action,
        callbackUrl: input.callbackUrl,
        preferStartDialog: input.preferStartDialog,
        hostBridgeRequestId: input.hostBridgeRequestId,
      });
    },
    [currentTask?.source, currentTask?.requestId],
  );

  const clearHermesAnalysisRequest = useCallback(() => {
    setAnalysisRequest(null);
  }, []);

  const dismissHermesAnalysis = useCallback((hostBridgeRequestId?: string) => {
    const id = hostBridgeRequestId?.trim();
    if (id) dismissedHostBridgeRequestIdsRef.current.add(id);
    setAnalysisRequest(null);
  }, []);

  const value = useMemo(
    () => ({
      pageContext,
      pageUrl,
      currentTask,
      setCurrentTask,
      taskSessionUpsertedIdRef,
      analysisRequest,
      taskStartDialog,
      taskStartDialogHandlers,
      setPageContext,
      setTaskStartDialog,
      setTaskStartDialogHandlers,
      requestHermesAnalysis,
      clearHermesAnalysisRequest,
      dismissHermesAnalysis,
    }),
    [
      pageContext,
      pageUrl,
      currentTask,
      setCurrentTask,
      analysisRequest,
      taskStartDialog,
      taskStartDialogHandlers,
      setPageContext,
      requestHermesAnalysis,
      clearHermesAnalysisRequest,
      dismissHermesAnalysis,
    ],
  );

  return (
    <WebOperatorPageContextReact.Provider value={value}>
      {children}
    </WebOperatorPageContextReact.Provider>
  );
}

export function useWebOperatorPageContext(): WebOperatorPageContextValue {
  const ctx = useContext(WebOperatorPageContextReact);
  if (!ctx) {
    throw new Error("useWebOperatorPageContext must be used within WebOperatorPageContextProvider");
  }
  return ctx;
}
