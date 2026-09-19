import { useCallback, useEffect, useId, useState, type ReactElement } from "react";
import Chat from "../../Chat/Chat";
import { KnowledgeConnector } from "../../Chat/knowledge/KnowledgeConnector";
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import { useKnowledgeChatScope } from "../features/chat/useKnowledgeChatScope";

export type KnowledgeChatPageProps = {
  params?: KnowledgeRouteParams;
  profile?: string;
  onNavigate?: (target: {
    page: string;
    params?: KnowledgeRouteParams;
  }) => void;
  onReplace?: (target: {
    page: string;
    params?: KnowledgeRouteParams;
  }) => void;
};

/**
 * Knowledge Chat host — Shared Chat + KnowledgeSet Connector only.
 * No facade session/citation path and no mock send gate.
 */
export function KnowledgeChatPage({
  params = {},
  profile = "default",
  onReplace,
}: KnowledgeChatPageProps): ReactElement {
  const scope = useKnowledgeChatScope({
    params,
    profile,
    onReplace,
  });
  const runIdBase = useId();
  const [runNonce, setRunNonce] = useState(0);
  const knowledgeSetId = scope.knowledgeContext?.knowledgeSetId ?? null;
  const routeSessionId = params.sessionId?.trim() || null;

  useEffect(() => {
    // Remount only on profile change (G5 abort). Do not remount when a
    // first-send assigns sessionId — that raced RESUME_BLOCKED and wiped Chat.
    setRunNonce((n) => n + 1);
  }, [profile]);

  const handleSessionIdChange = useCallback(
    async (_rid: string, sid: string | null) => {
      if (!sid || !knowledgeSetId) return;
      // Already bound on route — avoid replace thrash (and remount races).
      if (sid === routeSessionId) {
        void scope.reloadSessions();
        return;
      }
      // Wait until kb-set row is readable so resume does not flash RESUME_BLOCKED.
      for (let i = 0; i < 10; i++) {
        const binding =
          await window.hermesAPI.getSessionKnowledgeContext?.(sid);
        if (binding?.sessionKind === "kb-set") break;
        await new Promise((r) => setTimeout(r, 40));
      }
      onReplace?.({
        page: "chat",
        params: {
          sessionId: sid,
          knowledgeSetId,
        },
      });
      void scope.reloadSessions();
    },
    [
      knowledgeSetId,
      onReplace,
      routeSessionId,
      scope.reloadSessions,
    ],
  );

  const handleNewKnowledgeChat = useCallback(() => {
    scope.newKnowledgeChat();
    // Fresh Chat mount: empty transcript, no sticky session (G7 / §29.1).
    setRunNonce((n) => n + 1);
  }, [scope.newKnowledgeChat]);

  const handleOpenSession = useCallback(
    (id: string) => {
      const next = id.trim();
      if (!next) return;
      if (next !== routeSessionId) {
        scope.openSession(next);
        setRunNonce((n) => n + 1);
      }
    },
    [routeSessionId, scope.openSession],
  );

  const handleDeleteSession = useCallback(
    async (id: string, title: string) => {
      const sid = id.trim();
      if (!sid) return;
      const label = title.trim() || sid.slice(-6);
      const ok = window.confirm(
        `Delete knowledge chat "${label}"?\nThis cannot be undone.`,
      );
      if (!ok) return;
      try {
        await scope.deleteKbSetSession(sid);
        if (sid === routeSessionId) {
          setRunNonce((n) => n + 1);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        window.alert(`Failed to delete session: ${message}`);
      }
    },
    [routeSessionId, scope.deleteKbSetSession],
  );

  const runId = `kb-chat-${runIdBase}-${runNonce}`;

  if (scope.phase === "RESUME_BLOCKED") {
    return (
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          flexDirection: "column",
          padding: 24,
          gap: 12,
        }}
      >
        <p>{scope.sendBlockedReason || "KNOWLEDGE_BINDING_NOT_FOUND"}</p>
        <button type="button" onClick={handleNewKnowledgeChat}>
          New knowledge chat
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        minHeight: 0,
        height: "100%",
        flexDirection: "row",
        overflow: "hidden",
      }}
    >
      <aside
        style={{
          width: 220,
          borderRight: "1px solid var(--border, #333)",
          padding: 8,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          className="btn-ghost"
          style={{ width: "100%", marginBottom: 8, flexShrink: 0 }}
          onClick={handleNewKnowledgeChat}
        >
          New knowledge chat
        </button>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {scope.kbSetSessions.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                opacity: s.id === scope.sessionId ? 1 : 0.75,
              }}
              data-active={s.id === scope.sessionId ? "true" : "false"}
            >
              <button
                type="button"
                className="btn-ghost"
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: "left",
                  fontSize: 12,
                  padding: "6px 8px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={s.title || s.id}
                onClick={() => handleOpenSession(s.id)}
              >
                {s.title || s.id.slice(-6)}
              </button>
              <button
                type="button"
                className="btn-ghost"
                aria-label={`Delete ${s.title || s.id.slice(-6)}`}
                title="Delete"
                style={{
                  flexShrink: 0,
                  padding: "4px 6px",
                  fontSize: 12,
                  opacity: 0.7,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDeleteSession(s.id, s.title || "");
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Chat
          key={runId}
          runId={runId}
          profile={profile}
          active
          initialSessionId={scope.sessionId}
          knowledgeRequired
          knowledgeContext={scope.knowledgeContext}
          knowledgeSendBlocked={scope.phase === "BLOCKED"}
          knowledgeSendBlockedReason={
            scope.phase === "BLOCKED"
              ? scope.sendBlockedReason ?? undefined
              : undefined
          }
          knowledgeControl={
            <KnowledgeConnector
              selectedSetId={scope.selectedSetId}
              locked={scope.locked}
              onSelect={scope.selectSet}
            />
          }
          onSessionIdChange={handleSessionIdChange}
          onNewChat={handleNewKnowledgeChat}
        />
      </div>
    </div>
  );
}

export default KnowledgeChatPage;
