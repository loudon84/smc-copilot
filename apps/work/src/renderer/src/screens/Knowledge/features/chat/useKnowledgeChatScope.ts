import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatKnowledgeContextV1 } from "../../../../../../shared/knowledge/chat-knowledge-context";
import type { KnowledgeRouteParams } from "../../knowledge-route-descriptor";

export type KnowledgeScopePhase =
  | "UNBOUND"
  | "READY"
  | "BOUND"
  | "BLOCKED"
  | "RESUME_BLOCKED";

export type UseKnowledgeChatScopeArgs = {
  params: KnowledgeRouteParams;
  profile: string;
  onReplace?: (target: {
    page: string;
    params?: KnowledgeRouteParams;
  }) => void;
};

export type UseKnowledgeChatScopeResult = {
  phase: KnowledgeScopePhase;
  knowledgeContext: ChatKnowledgeContextV1 | null;
  selectedSetId: string | null;
  sessionId: string | null;
  locked: boolean;
  sendBlocked: boolean;
  sendBlockedReason: string | null;
  selectSet: (setId: string) => void;
  newKnowledgeChat: () => void;
  /** Refresh kb-set sidebar list (after first-create / new chat). */
  reloadSessions: () => Promise<void>;
  kbSetSessions: Array<{
    id: string;
    title: string;
    knowledgeSetId?: string | null;
  }>;
  openSession: (sessionId: string) => void;
  /** Delete a kb-set Hermes session (metadata + cache). */
  deleteKbSetSession: (sessionId: string) => Promise<void>;
};

/**
 * Knowledge chat scope: route seed, kb-set restore, lock, BLOCKED read-only.
 */
export function useKnowledgeChatScope({
  params,
  profile,
  onReplace,
}: UseKnowledgeChatScopeArgs): UseKnowledgeChatScopeResult {
  const routeSessionId = params.sessionId?.trim() || null;
  const routeSetId = params.knowledgeSetId?.trim() || null;
  const [selectedSetId, setSelectedSetId] = useState<string | null>(
    routeSetId,
  );
  const [sessionId, setSessionId] = useState<string | null>(routeSessionId);
  const [phase, setPhase] = useState<KnowledgeScopePhase>(
    // Do not claim BOUND until kb-set binding + set status are verified.
    routeSessionId || routeSetId ? "READY" : "UNBOUND",
  );
  const [sendBlockedReason, setSendBlockedReason] = useState<string | null>(
    null,
  );
  const [kbSetSessions, setKbSetSessions] = useState<
    Array<{ id: string; title: string; knowledgeSetId?: string | null }>
  >([]);

  const reloadSessions = useCallback(async (): Promise<void> => {
    const list = window.hermesAPI?.listKbSetSessions;
    if (typeof list !== "function") {
      setKbSetSessions([]);
      return;
    }
    try {
      const rows = await list(profile || "default", 50);
      setKbSetSessions(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          knowledgeSetId: r.knowledgeSetId,
        })),
      );
    } catch {
      setKbSetSessions([]);
    }
  }, [profile]);

  useEffect(() => {
    void reloadSessions();
  }, [reloadSessions, profile]);

  // Profile switch: unload. First effect pass only records profile (Strict Mode
  // safe); do not clear route-seeded selection on mount.
  const prevProfileRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevProfileRef.current;
    prevProfileRef.current = profile;
    if (prev === null || prev === profile) return;
    setSelectedSetId(null);
    setSessionId(null);
    setPhase("UNBOUND");
    setSendBlockedReason(null);
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!routeSessionId) {
        if (routeSetId) {
          setSelectedSetId(routeSetId);
          setSessionId(null);
          setPhase("READY");
          setSendBlockedReason(null);
        }
        return;
      }

      // First-send race: route may gain sessionId before kb-set row is visible.
      // Retry briefly; if route still has knowledgeSetId, stay READY instead of
      // wiping the page with RESUME_BLOCKED.
      let binding =
        await window.hermesAPI.getSessionKnowledgeContext?.(routeSessionId);
      if (!binding || binding.sessionKind !== "kb-set") {
        for (let i = 0; i < 8 && !cancelled; i++) {
          await new Promise((r) => setTimeout(r, 50));
          binding =
            await window.hermesAPI.getSessionKnowledgeContext?.(routeSessionId);
          if (binding?.sessionKind === "kb-set") break;
        }
      }
      if (cancelled) return;

      if (!binding || binding.sessionKind !== "kb-set") {
        if (routeSetId) {
          setSessionId(routeSessionId);
          setSelectedSetId(routeSetId);
          setPhase("READY");
          setSendBlockedReason(null);
          return;
        }
        setPhase("RESUME_BLOCKED");
        setSendBlockedReason("KNOWLEDGE_BINDING_NOT_FOUND");
        setSessionId(routeSessionId);
        setSelectedSetId(null);
        return;
      }

      if (binding.profileId !== (profile.trim() || "default")) {
        setPhase("RESUME_BLOCKED");
        setSendBlockedReason("KNOWLEDGE_SESSION_SCOPE_CONFLICT");
        setSessionId(null);
        setSelectedSetId(null);
        return;
      }

      setSessionId(binding.sessionId);
      setSelectedSetId(binding.knowledgeSetId);

      const api = window.hermesAPI?.knowledgeJobs?.sets;
      if (!api?.get) {
        setPhase("BLOCKED");
        setSendBlockedReason("KNOWLEDGE_UNAVAILABLE");
        return;
      }
      try {
        const snap = await api.get({
          knowledgeSetId: binding.knowledgeSetId,
        });
        if (cancelled) return;
        if (snap.status !== "active") {
          setPhase("BLOCKED");
          setSendBlockedReason("KNOWLEDGE_SET_NOT_ACTIVE");
          return;
        }
        setPhase("BOUND");
        setSendBlockedReason(null);
      } catch {
        if (cancelled) return;
        setPhase("BLOCKED");
        setSendBlockedReason("KNOWLEDGE_SET_NOT_FOUND");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeSessionId, routeSetId, profile]);

  const selectSet = useCallback(
    (setId: string) => {
      if (phase === "BOUND" || phase === "BLOCKED") return;
      const id = setId.trim();
      if (!id) return;
      setSelectedSetId(id);
      setPhase("READY");
      setSendBlockedReason(null);
      onReplace?.({
        page: "chat",
        params: { knowledgeSetId: id },
      });
    },
    [phase, onReplace],
  );

  const newKnowledgeChat = useCallback(() => {
    setSessionId(null);
    setSelectedSetId(null);
    setPhase("UNBOUND");
    setSendBlockedReason(null);
    onReplace?.({ page: "chat", params: {} });
    void reloadSessions();
  }, [onReplace, reloadSessions]);

  const openSession = useCallback(
    (id: string) => {
      onReplace?.({ page: "chat", params: { sessionId: id } });
    },
    [onReplace],
  );

  const deleteKbSetSession = useCallback(
    async (id: string): Promise<void> => {
      const sid = id.trim();
      if (!sid) return;
      const api = window.hermesAPI?.deleteSession;
      if (typeof api !== "function") {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }
      await api(sid);
      const wasCurrent = sessionId === sid || routeSessionId === sid;
      if (wasCurrent) {
        setSessionId(null);
        setSelectedSetId(null);
        setPhase("UNBOUND");
        setSendBlockedReason(null);
        onReplace?.({ page: "chat", params: {} });
      }
      await reloadSessions();
    },
    [onReplace, reloadSessions, routeSessionId, sessionId],
  );

  const knowledgeContext = useMemo((): ChatKnowledgeContextV1 | null => {
    const id = selectedSetId?.trim();
    if (!id) return null;
    return { version: "1.0", knowledgeSetId: id };
  }, [selectedSetId]);

  const locked = phase === "BOUND" || phase === "BLOCKED";
  const sendBlocked =
    phase === "BLOCKED" ||
    phase === "RESUME_BLOCKED" ||
    phase === "UNBOUND" ||
    !knowledgeContext;

  return {
    phase,
    knowledgeContext,
    selectedSetId,
    sessionId,
    locked,
    sendBlocked,
    sendBlockedReason,
    selectSet,
    newKnowledgeChat,
    reloadSessions,
    kbSetSessions,
    openSession,
    deleteKbSetSession,
  };
}
