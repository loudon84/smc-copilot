import { useEffect, useState, type ReactElement } from "react";
import { useI18n } from "../../../components/useI18n";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeFacadeEntitySnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../shared/knowledge/knowledge-job-ipc";
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import {
  KnowledgeEmptyState,
  KnowledgeEntityModal,
  KnowledgeLoading,
} from "../knowledge-page-chrome";

export type KnowledgeChatPageProps = {
  params?: KnowledgeRouteParams;
  onNavigate?: (target: {
    page: string;
    params?: KnowledgeRouteParams;
  }) => void;
  onReplace?: (target: {
    page: string;
    params?: KnowledgeRouteParams;
  }) => void;
  capability?: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot | null;
  facade?: HermesKnowledgeFacadeAPI | null;
};

type ChatLoadState =
  | "loading"
  | "unavailable"
  | "no-session"
  | "empty-thread"
  | "content"
  | "error";

type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

/**
 * Knowledge Chat composition — sessions/messages/composer/citations via Facade.
 * Never imports or calls Work Chat / Skill Run session APIs.
 */
export function KnowledgeChatPage({
  params = {},
  onNavigate,
  onReplace,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
}: KnowledgeChatPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
  } satisfies UseKnowledgeFacadeOptions);
  const sessionId = params.sessionId;
  const [loadState, setLoadState] = useState<ChatLoadState>("loading");
  const [sessions, setSessions] = useState<KnowledgeFacadeEntitySnapshot[]>([]);
  const [sets, setSets] = useState<KnowledgeFacadeEntitySnapshot[]>([]);
  const [citations, setCitations] = useState<KnowledgeFacadeEntitySnapshot[]>(
    [],
  );
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState("");
  const [statusLine, setStatusLine] = useState("");

  const composerEnabled = probe.mutationsEnabled;

  useEffect(() => {
    setMessages([]);
    setCitations([]);
    setDraft("");
    setStatusLine("");

    if (probe.presentation === "loading") {
      setLoadState("loading");
      return;
    }
    if (probe.presentation === "unavailable" && !composerEnabled) {
      setLoadState("unavailable");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        if (!probe.facade || probe.mode?.dataMode !== "mock") {
          setSessions([]);
          setLoadState(
            probe.presentation === "unavailable" ? "unavailable" : "no-session",
          );
          return;
        }

        const [listed, setList] = await Promise.all([
          probe.facade.listEntities({ kind: "session" }),
          probe.facade.listEntities({ kind: "set" }),
        ]);
        if (cancelled) return;
        setSessions(listed);
        setSets(setList);
        if (!selectedSetId && setList[0]) {
          setSelectedSetId(setList[0].id);
        }

        if (!sessionId) {
          setLoadState("no-session");
          return;
        }

        const session = await probe.facade.getEntity({
          kind: "session",
          entityId: sessionId,
        });
        if (cancelled) return;
        if (!session) {
          setLoadState("no-session");
          return;
        }

        const citationList = await probe.facade.listEntities({
          kind: "citation",
          parentId: sessionId,
        });
        if (cancelled) return;
        setCitations(citationList);
        setLoadState("empty-thread");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error ? error.message : t("knowledge.host.errorTitle"),
        );
        setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable copy lookup
  }, [
    probe.presentation,
    probe.facade,
    probe.mode?.dataMode,
    sessionId,
    composerEnabled,
  ]);

  const handleSelectSession = (id: string): void => {
    onNavigate?.({ page: "chat", params: { sessionId: id } });
  };

  const handleCreateSession = async (): Promise<void> => {
    if (!composerEnabled || !probe.facade) return;
    const created = await probe.facade.mutateEntity({
      kind: "session",
      patch: {
        title: "Knowledge session",
        knowledgeSetId: selectedSetId,
      },
    });
    setSessions((prev) => [...prev, created]);
    setDialogOpen(false);
    onReplace?.({ page: "chat", params: { sessionId: created.id } });
  };

  const handleSend = async (): Promise<void> => {
    if (!composerEnabled || !probe.facade || !draft.trim()) return;
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      setDialogOpen(true);
      return;
    }

    const userMessage: LocalMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      text: draft.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setLoadState("content");
    setStatusLine(t("knowledge.chat.retrieving"));

    await probe.facade.mutateEntity({
      kind: "session",
      entityId: activeSessionId,
      patch: { lastMessage: userMessage.text },
    });

    setStatusLine(t("knowledge.chat.generating"));
    const assistant: LocalMessage = {
      id: `local-assistant-${Date.now()}`,
      role: "assistant",
      text: userMessage.text,
    };
    setMessages((prev) => [...prev, assistant]);
    setStatusLine("");

    const citation = await probe.facade.mutateEntity({
      kind: "citation",
      patch: {
        title: `Citation for ${activeSessionId}`,
        parentId: activeSessionId,
      },
    });
    setCitations((prev) => [...prev, citation]);
  };

  return (
    <div data-testid="knowledge-chat-page" data-state={loadState}>
      {loadState === "loading" ? (
        <KnowledgeLoading label={t("knowledge.loading")} />
      ) : null}
      {loadState === "unavailable" ? (
        <KnowledgeEmptyState
          title={t("knowledge.unavailableTitle")}
          description={t("knowledge.chat.composerBlocked")}
        />
      ) : null}
      {loadState === "error" ? (
        <KnowledgeEmptyState
          title={t("knowledge.host.errorTitle")}
          description={errorMessage}
        />
      ) : null}

      {loadState !== "loading" && loadState !== "unavailable" && loadState !== "error" ? (
        <div className="knowledge-chat-layout">
          <aside
            className="settings-section knowledge-chat-rail"
            data-testid="knowledge-chat-sessions"
          >
            <h2>{t("knowledge.chat.sessionsTitle")}</h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="knowledge-chat-new-session"
              disabled={!composerEnabled}
              onClick={() => setDialogOpen(true)}
            >
              {t("knowledge.chat.newSession")}
            </button>
            {sessions.length === 0 ? (
              <p>{t("knowledge.chat.emptySessions")}</p>
            ) : (
              <ul>
                {sessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      data-testid={`knowledge-chat-session-${session.id}`}
                      data-active={session.id === sessionId ? "true" : "false"}
                      onClick={() => handleSelectSession(session.id)}
                    >
                      {session.title ?? session.id}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="settings-section knowledge-chat-thread-wrap">
            <h2>{t("knowledge.chat.messagesTitle")}</h2>
            {statusLine ? <p role="status">{statusLine}</p> : null}
            {messages.length === 0 ? (
              <p data-testid="knowledge-chat-empty-thread">
                {t("knowledge.chat.emptyThread")}
              </p>
            ) : (
              <ul data-testid="knowledge-chat-thread">
                {messages.map((message) => (
                  <li key={message.id} data-role={message.role}>
                    {message.text}
                  </li>
                ))}
              </ul>
            )}

            <div className="knowledge-toolbar">
              <textarea
                data-testid="knowledge-chat-composer"
                value={draft}
                disabled={!composerEnabled}
                placeholder={t("knowledge.chat.composerPlaceholder")}
                title={
                  composerEnabled
                    ? undefined
                    : t("knowledge.chat.composerDisabledProvider")
                }
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                style={{ width: "100%" }}
              />
              <button
                type="button"
                className="btn btn-sm"
                data-testid="knowledge-chat-send"
                disabled={!composerEnabled || !draft.trim()}
                title={
                  composerEnabled
                    ? undefined
                    : t("knowledge.chat.composerDisabledProvider")
                }
                onClick={() => {
                  void handleSend();
                }}
              >
                {t("knowledge.chat.sendLabel")}
              </button>
              {!composerEnabled ? (
                <p>{t("knowledge.chat.composerDisabledProvider")}</p>
              ) : null}
            </div>
          </section>

          <aside
            className="settings-section knowledge-chat-citations"
            data-testid="knowledge-chat-citations"
          >
            <h2>{t("knowledge.chat.citationsTitle")}</h2>
            {citations.length === 0 ? (
              <p>{t("knowledge.chat.emptyCitations")}</p>
            ) : (
              <ul>
                {citations.map((citation) => (
                  <li key={citation.id}>{citation.title ?? citation.id}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!onNavigate}
              onClick={() => onNavigate?.({ page: "sets", params: {} })}
            >
              {t("knowledge.chat.manageSets")}
            </button>
          </aside>
        </div>
      ) : null}

      <KnowledgeEntityModal
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={t("knowledge.chat.newSessionTitle")}
      >
        <label className="settings-field">
          {t("knowledge.chat.knowledgeSet")}
          <select
            data-testid="knowledge-chat-set-select"
            value={selectedSetId}
            onChange={(event) => setSelectedSetId(event.target.value)}
            disabled={!composerEnabled}
          >
            {sets.length === 0 ? (
              <option value="">{t("knowledge.chat.noSets")}</option>
            ) : (
              sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.title ?? set.id}
                </option>
              ))
            )}
          </select>
        </label>
        <div className="knowledge-toolbar">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setDialogOpen(false)}
          >
            {t("knowledge.host.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            data-testid="knowledge-chat-new-session-confirm"
            disabled={!composerEnabled}
            onClick={() => {
              void handleCreateSession();
            }}
          >
            {t("knowledge.host.create")}
          </button>
        </div>
      </KnowledgeEntityModal>
    </div>
  );
}

export default KnowledgeChatPage;
