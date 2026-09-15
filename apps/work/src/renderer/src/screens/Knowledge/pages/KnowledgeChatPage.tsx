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
  const [citations, setCitations] = useState<KnowledgeFacadeEntitySnapshot[]>(
    [],
  );
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const composerEnabled = probe.mutationsEnabled;

  useEffect(() => {
    // Session switches must drop the prior local thread (Bugbot HIGH).
    setMessages([]);
    setCitations([]);
    setDraft("");

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

        const listed = await probe.facade.listEntities({ kind: "session" });
        if (cancelled) return;
        setSessions(listed);

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
      patch: { title: "Knowledge session" },
    });
    setSessions((prev) => [...prev, created]);
    onReplace?.({ page: "chat", params: { sessionId: created.id } });
  };

  const handleSend = async (): Promise<void> => {
    if (!composerEnabled || !probe.facade || !draft.trim()) return;
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const created = await probe.facade.mutateEntity({
        kind: "session",
        patch: { title: draft.trim().slice(0, 48) },
      });
      activeSessionId = created.id;
      setSessions((prev) => [...prev, created]);
      onReplace?.({ page: "chat", params: { sessionId: created.id } });
    }

    const userMessage: LocalMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      text: draft.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setLoadState("content");

    await probe.facade.mutateEntity({
      kind: "session",
      entityId: activeSessionId,
      patch: { lastMessage: userMessage.text },
    });

    const assistant: LocalMessage = {
      id: `local-assistant-${Date.now()}`,
      role: "assistant",
      text: userMessage.text,
    };
    setMessages((prev) => [...prev, assistant]);

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
      {loadState === "loading" ? <p>{t("knowledge.loading")}</p> : null}
      {loadState === "unavailable" ? (
        <section className="gateway-empty-state" aria-live="polite">
          <strong>{t("knowledge.unavailableTitle")}</strong>
          <p>{t("knowledge.chat.composerBlocked")}</p>
        </section>
      ) : null}
      {loadState === "error" ? (
        <section>
          <strong>{t("knowledge.host.errorTitle")}</strong>
          <p>{errorMessage}</p>
        </section>
      ) : null}

      {loadState !== "loading" && loadState !== "unavailable" && loadState !== "error" ? (
        <div style={{ display: "flex", gap: 16 }}>
          <aside data-testid="knowledge-chat-sessions" style={{ minWidth: 180 }}>
            <h2>{t("knowledge.chat.sessionsTitle")}</h2>
            <button
              type="button"
              data-testid="knowledge-chat-new-session"
              disabled={!composerEnabled}
              onClick={() => {
                void handleCreateSession();
              }}
            >
              {t("knowledge.host.create")}
            </button>
            {sessions.length === 0 ? (
              <p>{t("knowledge.chat.emptySessions")}</p>
            ) : (
              <ul>
                {sessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
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

          <section style={{ flex: 1 }}>
            <h2>{t("knowledge.chat.messagesTitle")}</h2>
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

            <div style={{ marginTop: 12 }}>
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

          <aside data-testid="knowledge-chat-citations" style={{ minWidth: 160 }}>
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
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export default KnowledgeChatPage;
