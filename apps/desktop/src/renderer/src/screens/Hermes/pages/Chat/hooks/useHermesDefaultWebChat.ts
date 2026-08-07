import { useCallback, useEffect, useMemo } from "react";
import { useHermesDefault } from "../../../context/HermesDefaultContext";
import { useHermesDefaultChatAttachments } from "./useHermesDefaultChatAttachments";
import { useHermesDefaultChatModels } from "./useHermesDefaultChatModels";
import { useHermesDefaultComposerState } from "./useHermesDefaultComposerState";
import { useHermesDefaultChatStream } from "./useHermesDefaultChatStream";

type Options = {
  /** When set, chat binds to this session instead of context activeSessionId */
  forcedSessionId?: string | null;
};

export function useHermesDefaultWebChat(options?: Options) {
  const { activeSessionId, setActiveSessionId, setActiveNavItem, sessions } = useHermesDefault();
  const boundSessionId: string | null =
    options && "forcedSessionId" in options
      ? (options.forcedSessionId ?? null)
      : activeSessionId;

  const sessionId = useMemo(
    () => boundSessionId ?? `draft_default`,
    [boundSessionId],
  );

  const models = useHermesDefaultChatModels(true, boundSessionId);
  const attachments = useHermesDefaultChatAttachments(sessionId);
  const composer = useHermesDefaultComposerState();

  const modelId = useMemo(() => {
    if (models.pendingModel?.id) return models.pendingModel.id;
    const current = models.models.find((m) => m.is_current);
    if (current?.id) return current.id;
    return null;
  }, [models.pendingModel?.id, models.models]);

  const onSessionId = useCallback(
    (id: string) => {
      setActiveSessionId(id);
      void sessions.refresh();
    },
    [setActiveSessionId, sessions.refresh],
  );

  const stream = useHermesDefaultChatStream({
    activeSessionId: boundSessionId,
    onSessionId,
  });

  const { loadSessionHistory, clearMessages, cancel } = stream;

  useEffect(() => {
    if (boundSessionId) {
      void loadSessionHistory(boundSessionId);
    } else {
      clearMessages();
    }
  }, [boundSessionId, loadSessionHistory, clearMessages]);

  const newConversation = useCallback(() => {
    void cancel();
    attachments.clear();
    composer.clear();
    setActiveSessionId(null);
    clearMessages();
  }, [attachments, cancel, clearMessages, composer, setActiveSessionId]);

  const viewSessions = useCallback(() => {
    setActiveNavItem("sessions");
  }, [setActiveNavItem]);

  return {
    activeSessionId: boundSessionId,
    sessionId,
    modelId,
    models,
    attachments,
    composer,
    stream,
    newConversation,
    viewSessions,
  };
}

