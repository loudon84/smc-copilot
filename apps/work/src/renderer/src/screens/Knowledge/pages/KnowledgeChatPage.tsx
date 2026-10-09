import { useCallback, type ReactElement } from "react";
import Chat from "../../Chat/Chat";
import { KnowledgeConnector } from "../../Chat/knowledge/KnowledgeConnector";
import { useI18n } from "../../../components/useI18n";
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import { useKnowledgeChatScope } from "../features/chat/useKnowledgeChatScope";

export type KnowledgeChatPageProps = {
  params?: KnowledgeRouteParams;
  profile?: string;
  active?: boolean;
  onNavigate?: (target: {
    page: string;
    params?: KnowledgeRouteParams;
  }) => void;
  onReplace?: (target: { page: string; params?: KnowledgeRouteParams }) => void;
};

const RECOVERY_MESSAGES: Record<string, string> = {
  KNOWLEDGE_BINDING_NOT_FOUND: "knowledge.chat.bindingMissing",
  KNOWLEDGE_SESSION_SCOPE_CONFLICT: "knowledge.chat.scopeConflict",
  KNOWLEDGE_SET_NOT_ACTIVE: "knowledge.chat.setInactive",
  KNOWLEDGE_SET_NOT_FOUND: "knowledge.chat.setMissing",
  KNOWLEDGE_HISTORY_LOAD_FAILED: "knowledge.chat.historyFailed",
};

/** Knowledge Chat keeps its open Shared Chat instances alive across navigation. */
export function KnowledgeChatPage({
  params = {},
  profile = "default",
  active = true,
  onReplace,
}: KnowledgeChatPageProps): ReactElement {
  const { t } = useI18n();
  const scope = useKnowledgeChatScope({ params, profile, onReplace });
  const recoveryMessage = (reason: string | null): string =>
    t(RECOVERY_MESSAGES[reason ?? ""] ?? "knowledge.chat.serviceUnavailable");
  const rows = [
    ...scope.runs.map((run) => ({
      id: run.sessionId || run.runId,
      runId: run.runId,
      title:
        scope.kbSetSessions.find((s) => s.id === run.sessionId)?.title ||
        run.title ||
        (run.sessionId
          ? run.sessionId.slice(-6)
          : t("knowledge.chat.draftSession")),
      busy: run.loading || !!run.deleting,
      activity: run.activity ?? "idle",
    })),
    ...scope.kbSetSessions
      .filter((s) => !scope.runs.some((r) => r.sessionId === s.id))
      .map((s) => ({
        id: s.id,
        title: s.title || s.id.slice(-6),
        runId: null,
        busy: false,
        activity: "idle",
      })),
  ];

  const handleDeleteSession = useCallback(
    async (id: string, title: string) => {
      if (!window.confirm(t("knowledge.chat.deleteConfirm", { title }))) return;
      try {
        await scope.deleteKbSetSession(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        window.alert(t("knowledge.chat.deleteFailed", { message }));
      }
    },
    [scope.deleteKbSetSession, t],
  );

  return (
    <div
      className="knowledge-chat-page"
      style={{
        display: "flex",
        flex: 1,
        minHeight: 0,
        height: "100%",
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
          onClick={scope.newKnowledgeChat}
        >
          {t("knowledge.chat.newKnowledgeChat")}
        </button>
        <div
          className="knowledge-chat-history"
          role="region"
          aria-label={t("knowledge.chat.sessionsTitle")}
          tabIndex={0}
          style={{
            flex: 1,
            minHeight: 0,
            overflowX: "hidden",
          }}
        >
          {rows.map((s) => (
            <div
              key={s.id}
              data-active={s.runId === scope.activeRunId ? "true" : "false"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                opacity: s.runId === scope.activeRunId ? 1 : 0.75,
              }}
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
                title={s.title}
                aria-label={s.title}
                aria-description={
                  s.activity === "idle"
                    ? undefined
                    : t(`knowledge.chat.status.${s.activity}`)
                }
                onClick={() =>
                  s.runId ? scope.activateRun(s.runId) : scope.openSession(s.id)
                }
              >
                {s.title}
                {s.activity !== "idle" && (
                  <span className="knowledge-chat-session-status">
                    {t(`knowledge.chat.status.${s.activity}`)}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="btn-ghost"
                aria-label={t("knowledge.chat.deleteSession", {
                  title: s.title,
                })}
                title={
                  s.busy
                    ? t("knowledge.chat.stopBeforeDelete")
                    : t("knowledge.chat.deleteSession", { title: s.title })
                }
                disabled={s.busy}
                style={{
                  flexShrink: 0,
                  padding: "4px 6px",
                  fontSize: 12,
                  opacity: 0.7,
                }}
                onClick={() => {
                  void handleDeleteSession(s.id, s.title);
                }}
              >
                ×
              </button>
            </div>
          ))}
          {scope.sessionsLoading && (
            <p className="knowledge-chat-notice" role="status">
              {t("knowledge.chat.loadingHistory")}
            </p>
          )}
          {scope.sessionsError ? (
            <div className="knowledge-chat-notice" role="alert">
              <p>{t("knowledge.chat.listFailed")}</p>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  void scope.reloadSessions();
                }}
              >
                {t("knowledge.chat.retry")}
              </button>
            </div>
          ) : (
            !scope.sessionsLoading &&
            scope.kbSetSessions.length === 0 &&
            !scope.runs.some((run) => run.sessionId) && (
              <p className="knowledge-chat-notice">
                {t("knowledge.chat.emptySessions")}
              </p>
            )
          )}
          {scope.sessionsHasMore && !scope.sessionsError && (
            <button
              type="button"
              className="btn-ghost"
              disabled={scope.sessionsLoading}
              onClick={scope.loadMoreSessions}
            >
              {t("knowledge.chat.loadMore")}
            </button>
          )}
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
        {scope.phase === "RESOLVING" && (
          <p className="knowledge-chat-notice" role="status">
            {t("knowledge.chat.restoringSession")}
          </p>
        )}
        {["RESUME_BLOCKED", "BLOCKED"].includes(scope.phase) && (
          <div className="knowledge-chat-notice" role="alert">
            <p>{recoveryMessage(scope.sendBlockedReason)}</p>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => scope.activateRun(scope.activeRunId)}
            >
              {t("knowledge.chat.retryConversation")}
            </button>
          </div>
        )}
        {scope.runs
          .filter((run) => run.initialized)
          .map((run) => {
            const visible = active && run.runId === scope.activeRunId;
            return (
              <div
                className="knowledge-chat-run"
                key={run.runId}
                data-knowledge-run={run.runId}
                style={{
                  display: run.runId === scope.activeRunId ? "flex" : "none",
                  flex: 1,
                  minHeight: 0,
                  flexDirection: "column",
                }}
              >
                <Chat
                  runId={run.runId}
                  profile={run.profile}
                  active={visible}
                  initialSessionId={run.sessionId}
                  initialMessages={run.seed}
                  initialHistoryLoaded
                  knowledgeRequired
                  knowledgeContext={
                    run.knowledgeSetId
                      ? { version: "1.0", knowledgeSetId: run.knowledgeSetId }
                      : null
                  }
                  knowledgeSendBlocked={
                    // UNBOUND uses Shared Chat's Knowledge Set required gate.
                    !!run.deleting ||
                    ["RESOLVING", "BLOCKED", "RESUME_BLOCKED"].includes(
                      run.phase,
                    )
                  }
                  knowledgeSendBlockedReason={
                    run.phase === "RESOLVING"
                      ? t("knowledge.chat.restoringSession")
                      : run.sendBlockedReason
                        ? recoveryMessage(run.sendBlockedReason)
                        : undefined
                  }
                  knowledgeControl={
                    <KnowledgeConnector
                      selectedSetId={run.knowledgeSetId}
                      locked={!!run.sessionId || run.loading || !!run.deleting}
                      disabled={!visible}
                      onSelect={scope.selectSet}
                    />
                  }
                  onSessionIdChange={scope.onSessionIdChange}
                  onLoadingChange={scope.onLoadingChange}
                  onActivityChange={scope.onActivityChange}
                  onTitleChange={scope.onTitleChange}
                  onNewChat={scope.newKnowledgeChat}
                />
              </div>
            );
          })}
      </div>
    </div>
  );
}

export default KnowledgeChatPage;
