import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatKnowledgeContextV1 } from "../../../../../../shared/knowledge/chat-knowledge-context";
import { dbItemsToChatMessages } from "../../../Chat/sessionHistory";
import type { ChatActivity } from "../../../Chat/Chat";
import { isSessionCacheChangedEvent } from "../../../../../../shared/session-cache-events";
import { mintRun, type ChatRun } from "../../../Layout/chatRuns";
import type { KnowledgeRouteParams } from "../../knowledge-route-descriptor";

export type KnowledgeScopePhase =
  | "UNBOUND"
  | "READY"
  | "RESOLVING"
  | "BOUND"
  | "BLOCKED"
  | "RESUME_BLOCKED";

export type UseKnowledgeChatScopeArgs = {
  params: KnowledgeRouteParams;
  profile: string;
  onReplace?: (target: { page: string; params?: KnowledgeRouteParams }) => void;
};

type KnowledgeChatRun = ChatRun & {
  activity?: ChatActivity;
  knowledgeSetId: string | null;
  phase: KnowledgeScopePhase;
  sendBlockedReason: string | null;
  initialized: boolean;
  deleting?: boolean;
};

const SESSION_PAGE_SIZE = 50;

function createRun(
  profile: string,
  params: KnowledgeRouteParams,
): KnowledgeChatRun {
  const sessionId = params.sessionId?.trim() || null;
  const knowledgeSetId = params.knowledgeSetId?.trim() || null;
  return {
    ...mintRun(profile),
    sessionId,
    knowledgeSetId,
    phase: sessionId ? "RESOLVING" : knowledgeSetId ? "READY" : "UNBOUND",
    sendBlockedReason: null,
    initialized: !sessionId,
  };
}

function runParams(run: KnowledgeChatRun): KnowledgeRouteParams {
  return {
    ...(run.sessionId ? { sessionId: run.sessionId } : {}),
    ...(run.knowledgeSetId ? { knowledgeSetId: run.knowledgeSetId } : {}),
  };
}

/** Each open conversation owns its identity, draft and running Chat instance. */
export function useKnowledgeChatScope({
  params,
  profile,
  onReplace,
}: UseKnowledgeChatScopeArgs) {
  const routeSessionId = params.sessionId?.trim() || null;
  const routeSetId = params.knowledgeSetId?.trim() || null;
  const routeKey = JSON.stringify([profile, routeSessionId, routeSetId]);
  const [workspace, setWorkspace] = useState(() => {
    const run = createRun(profile, params);
    return { profile, routeKey, runs: [run], activeRunId: run.runId };
  });
  type Workspace = typeof workspace;
  const workspaceRef = useRef(workspace);
  const replaceRef = useRef(onReplace);
  replaceRef.current = onReplace;
  const mountedRef = useRef(true);
  const listRequestRef = useRef(0);
  const listWindowRef = useRef({
    profile,
    limit: SESSION_PAGE_SIZE,
    loading: false,
  });
  const [sessionList, setSessionList] = useState({
    profile,
    loading: true,
    error: false,
    hasMore: false,
    items: [] as Array<{
      id: string;
      title: string;
      knowledgeSetId?: string | null;
    }>,
  });

  // Adjust before children render; a new route cannot borrow the previous id.
  let current = workspace;
  if (workspace.profile !== profile) {
    const run = createRun(profile, params);
    current = { profile, routeKey, runs: [run], activeRunId: run.runId };
    setWorkspace(current);
  } else if (workspace.routeKey !== routeKey) {
    const selected = workspace.runs.find(
      (r) => r.runId === workspace.activeRunId,
    )!;
    const existing = routeSessionId
      ? workspace.runs.find((r) => r.sessionId === routeSessionId)
      : !selected.sessionId
        ? selected
        : undefined;
    const run = existing ?? createRun(profile, params);
    current = {
      ...workspace,
      routeKey,
      activeRunId: run.runId,
      runs: existing
        ? workspace.runs.map(
            (r): KnowledgeChatRun =>
              r !== existing || r.sessionId
                ? r
                : {
                    ...r,
                    knowledgeSetId: routeSetId,
                    phase: routeSetId ? "READY" : "UNBOUND",
                  },
          )
        : [...workspace.runs, run],
    };
    setWorkspace(current);
  }
  workspaceRef.current = current;
  const selected = current.runs.find((r) => r.runId === current.activeRunId)!;

  const update = useCallback(
    (change: (state: Workspace) => Workspace): void => {
      if (!mountedRef.current) return;
      const previous = workspaceRef.current;
      const next = change(previous);
      if (next === previous) return;
      workspaceRef.current = next;
      setWorkspace(next);
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      listRequestRef.current += 1;
    };
  }, []);

  const reloadSessions = useCallback(
    async (limit?: number): Promise<void> => {
      if (!mountedRef.current || workspaceRef.current.profile !== profile)
        return;
      if (listWindowRef.current.profile !== profile)
        listWindowRef.current = {
          profile,
          limit: SESSION_PAGE_SIZE,
          loading: false,
        };
      const requestedLimit = limit ?? listWindowRef.current.limit;
      listWindowRef.current = { profile, limit: requestedLimit, loading: true };
      const request = ++listRequestRef.current;
      const isCurrent = (): boolean =>
        mountedRef.current &&
        request === listRequestRef.current &&
        workspaceRef.current.profile === profile;
      setSessionList((previous) => ({
        ...(previous.profile === profile
          ? previous
          : { profile, items: [], hasMore: false }),
        loading: true,
        error: false,
      }));
      try {
        if (!window.hermesAPI?.listKbSetSessions)
          throw new Error("KNOWLEDGE_UNAVAILABLE");
        // Match the ordinary sidebar's expanding window; one extra row detects more.
        const rows = await window.hermesAPI.listKbSetSessions(
          profile || "default",
          requestedLimit + 1,
        );
        if (isCurrent())
          setSessionList({
            profile,
            items: rows.slice(0, requestedLimit),
            loading: false,
            error: false,
            hasMore: rows.length > requestedLimit,
          });
      } catch {
        if (isCurrent())
          setSessionList((previous) => ({
            ...previous,
            loading: false,
            error: true,
          }));
      } finally {
        if (isCurrent()) listWindowRef.current.loading = false;
      }
    },
    [profile],
  );

  const loadMoreSessions = useCallback((): void => {
    if (
      listWindowRef.current.loading ||
      !sessionList.hasMore ||
      sessionList.profile !== profile
    )
      return;
    void reloadSessions(listWindowRef.current.limit + SESSION_PAGE_SIZE);
  }, [profile, reloadSessions, sessionList.hasMore, sessionList.profile]);

  useEffect(() => {
    void reloadSessions();
    let cancelled = false;
    const unsubscribe = window.hermesAPI?.onSessionCacheChanged?.((event) => {
      if (!cancelled && isSessionCacheChangedEvent(event))
        void reloadSessions();
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [reloadSessions]);

  const { runId, sessionId, phase, initialized } = selected;
  useEffect(() => {
    if (!sessionId || phase !== "RESOLVING") return;
    let cancelled = false;
    const apply = (patch: Partial<KnowledgeChatRun>): void => {
      if (cancelled) return;
      update((state) => ({
        ...state,
        runs: state.runs.map((r) =>
          r.runId === runId && r.sessionId === sessionId
            ? { ...r, ...patch }
            : r,
        ),
      }));
    };
    void (async () => {
      try {
        let binding =
          await window.hermesAPI.getSessionKnowledgeContext?.(sessionId);
        for (
          let i = 0;
          (!binding || binding.sessionKind !== "kb-set") && i < 8 && !cancelled;
          i++
        ) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          if (cancelled) return;
          binding =
            await window.hermesAPI.getSessionKnowledgeContext?.(sessionId);
        }
        if (cancelled) return;
        if (!binding || binding.sessionKind !== "kb-set") {
          apply({
            phase: "RESUME_BLOCKED",
            sendBlockedReason: "KNOWLEDGE_BINDING_NOT_FOUND",
          });
          return;
        }
        if (
          binding.sessionId !== sessionId ||
          binding.profileId !== (profile.trim() || "default")
        ) {
          apply({
            phase: "RESUME_BLOCKED",
            knowledgeSetId: null,
            sendBlockedReason: "KNOWLEDGE_SESSION_SCOPE_CONFLICT",
          });
          return;
        }
        let nextPhase: KnowledgeScopePhase = "BOUND";
        let reason: string | null = null;
        const getSet = window.hermesAPI?.knowledgeJobs?.sets?.get;
        if (!getSet) {
          nextPhase = "BLOCKED";
          reason = "KNOWLEDGE_UNAVAILABLE";
        } else {
          try {
            const snap = await getSet({
              knowledgeSetId: binding.knowledgeSetId,
            });
            if (snap.status !== "active") {
              nextPhase = "BLOCKED";
              reason = "KNOWLEDGE_SET_NOT_ACTIVE";
            }
          } catch (error) {
            nextPhase = "BLOCKED";
            reason =
              error instanceof Error && /NOT_FOUND|404/.test(error.message)
                ? "KNOWLEDGE_SET_NOT_FOUND"
                : "KNOWLEDGE_UNAVAILABLE";
          }
        }
        if (cancelled) return;
        let seed: ChatRun["seed"];
        try {
          if (!initialized)
            seed = dbItemsToChatMessages(
              await window.hermesAPI.getSessionMessages(sessionId),
            );
        } catch {
          apply({
            phase: "RESUME_BLOCKED",
            knowledgeSetId: binding.knowledgeSetId,
            sendBlockedReason: "KNOWLEDGE_HISTORY_LOAD_FAILED",
          });
          return;
        }
        apply({
          phase: nextPhase,
          knowledgeSetId: binding.knowledgeSetId,
          sendBlockedReason: reason,
          initialized: true,
          ...(seed ? { seed } : {}),
        });
      } catch {
        apply({
          phase: "RESUME_BLOCKED",
          sendBlockedReason: "KNOWLEDGE_UNAVAILABLE",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, sessionId, phase, initialized, profile, update]);

  const activateRun = useCallback(
    (id: string): void => {
      const run = workspaceRef.current.runs.find((r) => r.runId === id);
      if (!run) return;
      update((state) => ({
        ...state,
        activeRunId: id,
        runs: state.runs.map((r) =>
          r.runId === id && r.sessionId && !r.deleting
            ? { ...r, phase: "RESOLVING", sendBlockedReason: null }
            : r,
        ),
      }));
      replaceRef.current?.({ page: "chat", params: runParams(run) });
    },
    [update],
  );

  const openSession = useCallback(
    (id: string): void => {
      const sid = id.trim();
      if (!sid) return;
      const state = workspaceRef.current;
      let run = state.runs.find((r) => r.sessionId === sid);
      if (!run) {
        run = createRun(state.profile, { sessionId: sid });
        const next = run;
        update((s) => ({
          ...s,
          runs: [...s.runs, next],
          activeRunId: next.runId,
        }));
      }
      activateRun(run.runId);
    },
    [activateRun, update],
  );

  const newKnowledgeChat = useCallback((): void => {
    const run = createRun(workspaceRef.current.profile, {});
    update((state) => ({
      ...state,
      runs: [...state.runs, run],
      activeRunId: run.runId,
    }));
    replaceRef.current?.({ page: "chat", params: {} });
  }, [update]);

  const selectSet = useCallback(
    (setId: string): void => {
      const state = workspaceRef.current;
      const run = state.runs.find((r) => r.runId === state.activeRunId)!;
      const id = setId.trim();
      if (!id || run.sessionId || run.loading || run.deleting) return;
      update((s) => ({
        ...s,
        runs: s.runs.map((r) =>
          r.runId === run.runId
            ? {
                ...r,
                knowledgeSetId: id,
                phase: "READY",
                sendBlockedReason: null,
              }
            : r,
        ),
      }));
      replaceRef.current?.({ page: "chat", params: { knowledgeSetId: id } });
    },
    [update],
  );

  const onSessionIdChange = useCallback(
    (id: string, sid: string | null): void => {
      if (!mountedRef.current) return;
      const state = workspaceRef.current;
      const run = state.runs.find((r) => r.runId === id);
      const nextId = sid?.trim() || null;
      if (
        !run ||
        run.deleting ||
        run.sessionId === nextId ||
        (run.sessionId && nextId)
      )
        return;
      const bound: KnowledgeChatRun = {
        ...run,
        sessionId: nextId,
        phase: nextId ? "RESOLVING" : run.knowledgeSetId ? "READY" : "UNBOUND",
        sendBlockedReason: null,
        ...(!nextId ? { seed: undefined } : {}),
      };
      update((s) => ({
        ...s,
        runs: s.runs.map((r) => (r.runId === id ? bound : r)),
      }));
      if (state.activeRunId === id)
        replaceRef.current?.({ page: "chat", params: runParams(bound) });
      void reloadSessions();
    },
    [reloadSessions, update],
  );

  const onLoadingChange = useCallback(
    (id: string, loading: boolean): void => {
      update((state) =>
        state.runs.some((r) => r.runId === id && r.loading !== loading)
          ? {
              ...state,
              runs: state.runs.map((r) =>
                r.runId === id ? { ...r, loading } : r,
              ),
            }
          : state,
      );
    },
    [update],
  );

  const onTitleChange = useCallback(
    (id: string, title: string): void => {
      update((state) =>
        state.runs.some((r) => r.runId === id && r.title !== title)
          ? {
              ...state,
              runs: state.runs.map((r) =>
                r.runId === id ? { ...r, title } : r,
              ),
            }
          : state,
      );
    },
    [update],
  );

  const onActivityChange = useCallback(
    (id: string, activity: ChatActivity): void => {
      update((state) =>
        state.runs.some((r) => r.runId === id && r.activity !== activity)
          ? {
              ...state,
              runs: state.runs.map((r) =>
                r.runId === id ? { ...r, activity } : r,
              ),
            }
          : state,
      );
    },
    [update],
  );

  const deleteKbSetSession = useCallback(
    async (id: string): Promise<void> => {
      const sid = id.trim();
      if (!sid) return;
      const state = workspaceRef.current;
      const run = state.runs.find(
        (r) => r.sessionId === sid || r.runId === sid,
      );
      if (run?.loading || run?.deleting)
        throw new Error("KNOWLEDGE_SESSION_RUNNING");
      if (run)
        update((s) => ({
          ...s,
          runs: s.runs.map((r) => (r === run ? { ...r, deleting: true } : r)),
        }));
      try {
        if (!run || run.sessionId) {
          if (!window.hermesAPI?.deleteSession)
            throw new Error("KNOWLEDGE_UNAVAILABLE");
          await window.hermesAPI.deleteSession(run?.sessionId ?? sid);
        }
        if (
          !mountedRef.current ||
          workspaceRef.current.profile !== state.profile
        )
          return;
        setSessionList((previous) => ({
          ...previous,
          items: previous.items.filter((row) => row.id !== sid),
        }));
        const latest = workspaceRef.current;
        const remaining = latest.runs.filter((r) => r.runId !== run?.runId);
        const wasCurrent = latest.activeRunId === run?.runId;
        if (remaining.length === 0)
          remaining.push(createRun(state.profile, {}));
        const next = wasCurrent
          ? remaining[remaining.length - 1]
          : remaining.find((r) => r.runId === latest.activeRunId)!;
        update((s) => ({ ...s, runs: remaining, activeRunId: next.runId }));
        if (wasCurrent)
          replaceRef.current?.({ page: "chat", params: runParams(next) });
        await reloadSessions();
      } catch (error) {
        update((s) => ({
          ...s,
          runs: s.runs.map((r) =>
            r.runId === run?.runId ? { ...r, deleting: false } : r,
          ),
        }));
        throw error;
      }
    },
    [reloadSessions, update],
  );

  const knowledgeContext = useMemo(
    (): ChatKnowledgeContextV1 | null =>
      selected.knowledgeSetId
        ? { version: "1.0", knowledgeSetId: selected.knowledgeSetId }
        : null,
    [selected.knowledgeSetId],
  );
  return {
    runs: current.runs,
    activeRunId: current.activeRunId,
    phase: selected.phase,
    knowledgeContext,
    selectedSetId: selected.knowledgeSetId,
    sessionId: selected.sessionId,
    locked: !!selected.sessionId || selected.loading || !!selected.deleting,
    sendBlocked:
      !!selected.deleting ||
      !["READY", "BOUND"].includes(selected.phase) ||
      !knowledgeContext,
    sendBlockedReason: selected.sendBlockedReason,
    kbSetSessions: sessionList.profile === profile ? sessionList.items : [],
    sessionsLoading: sessionList.profile !== profile || sessionList.loading,
    sessionsError: sessionList.profile === profile && sessionList.error,
    sessionsHasMore: sessionList.profile === profile && sessionList.hasMore,
    loadMoreSessions,
    onActivityChange,
    selectSet,
    newKnowledgeChat,
    reloadSessions,
    openSession,
    activateRun,
    deleteKbSetSession,
    onSessionIdChange,
    onLoadingChange,
    onTitleChange,
  };
}

export type UseKnowledgeChatScopeResult = ReturnType<
  typeof useKnowledgeChatScope
>;
