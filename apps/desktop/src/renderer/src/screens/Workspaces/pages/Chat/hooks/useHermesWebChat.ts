import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaces } from "../../../context/WorkspacesContext";
import { isPersistedSessionId } from "../../../api/sessionUtils";
import { useProfileResolver } from "./useProfileResolver";
import { useChatModels } from "./useChatModels";
import { useChatAttachments } from "./useChatAttachments";
import { useComposerState } from "./useComposerState";
import { useChatStream } from "./useChatStream";
import { useWorkspaceOptions } from "./useWorkspaceOptions";

export function useHermesWebChat() {
  const {
    activeProfileId,
    activeSessionId,
    activeProfile,
    profiles,
    setActiveProfileId,
    setActiveSessionId,
    refreshSessions,
    runtime,
  } = useWorkspaces();

  const profileRef = activeProfileId ?? activeProfile?.name ?? null;
  const profileInstalledInServe = activeProfile?.installed !== false;
  const { resolved, resolving, error: resolveError, refresh: refreshResolve } = useProfileResolver(
    profileRef,
    {
      enabled: profileInstalledInServe,
    },
  );

  useEffect(() => {
    if (!profileRef || !profileInstalledInServe) return;
    void refreshResolve();
  }, [
    profileRef,
    profileInstalledInServe,
    runtime.status,
    runtime.healthy,
    runtime.lastError,
    refreshResolve,
  ]);

  const profileId = resolved?.profile_id ?? null;
  const gatewayReady = Boolean(resolved?.healthy && resolved?.status === "running");
  const canChat = Boolean(profileId && gatewayReady && resolved?.status !== "not_deployed");

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (profileId) {
      setWorkspaceId(profileId);
    } else {
      setWorkspaceId(null);
    }
  }, [profileId]);

  useEffect(() => {
    const starting =
      runtime.status === "starting" || resolved?.status === "starting";
    if (!starting || !profileRef) return;
    const id = window.setInterval(() => void refreshResolve(), 1500);
    return () => window.clearInterval(id);
  }, [runtime.status, resolved?.status, profileRef, refreshResolve]);

  useEffect(() => {
    if (!profileId || gatewayReady) return;
    if (resolved?.status !== "running") return;
    const timers = [1000, 2000, 3000].map((ms) =>
      window.setTimeout(() => void refreshResolve(), ms),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [profileId, gatewayReady, resolved?.status, refreshResolve]);

  const sessionId = useMemo(
    () => activeSessionId ?? `draft_${profileId ?? "none"}`,
    [activeSessionId, profileId],
  );

  const workspaceOptions = useWorkspaceOptions(profileId);
  const models = useChatModels(profileId, gatewayReady);
  const attachments = useChatAttachments(profileId, workspaceId, sessionId);
  const composer = useComposerState();

  const stream = useChatStream({
    profileId,
    workspaceId,
    sessionId,
    canSend: canChat,
    modelId: models.pendingModel?.id ?? models.config?.model_id ?? null,
    onSessionId: (id) => {
      setActiveSessionId(id);
      refreshSessions();
    },
  });

  const { loadSessionHistory, clearMessages } = stream;

  useEffect(() => {
    if (activeSessionId) {
      void loadSessionHistory(activeSessionId);
    } else {
      clearMessages();
    }
  }, [activeSessionId, profileId, loadSessionHistory, clearMessages]);

  const newConversation = useCallback(() => {
    void stream.cancel();
    attachments.clear();
    composer.clear();
    setActiveSessionId(null);
    stream.clearMessages();
  }, [attachments, composer, setActiveSessionId, stream]);

  const profileInstalled =
    activeProfile?.installed !== false && resolved?.status !== "not_deployed";

  return {
    profiles,
    activeProfileId,
    setActiveProfileId,
    resolved,
    resolving,
    resolveError,
    workspaceId,
    setWorkspaceId,
    runtime,
    gatewayReady,
    canChat,
    profileInstalled,
    sessionId,
    isDraft: !isPersistedSessionId(activeSessionId),
    workspaceOptions,
    models,
    attachments,
    composer,
    stream,
    newConversation,
  };
}
