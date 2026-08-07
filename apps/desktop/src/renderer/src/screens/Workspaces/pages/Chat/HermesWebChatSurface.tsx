import { useCallback } from "react";
import { useI18n } from "../../../../components/useI18n";
import { useWorkspaces } from "../../context/WorkspacesContext";
import { useHermesWebChat } from "./hooks/useHermesWebChat";
import { ChatScrollArea } from "./ChatScrollArea";
import { ComposerBar } from "./ComposerBar";
import { StatusToast } from "./StatusToast";

export function HermesWebChatSurface(): React.JSX.Element {
  const { t } = useI18n();
  const { setActiveNavItem } = useWorkspaces();
  const chat = useHermesWebChat();
  const {
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
    workspaceOptions,
    models,
    attachments,
    composer,
    stream,
    newConversation,
  } = chat;

  const disabled =
    !activeProfileId || !canChat || !profileInstalled || resolving || Boolean(resolveError);

  const profileRunning = runtime.status === "running";
  const profileHealthy = runtime.healthy;
  const profileStarting =
    runtime.status === "starting" || resolved?.status === "starting";
  const profileStopped = runtime.status === "stopped";
  const showRestartUnhealthy = Boolean(
    activeProfileId && profileInstalled && profileRunning && !profileHealthy,
  );
  const showGatewayWaiting = Boolean(
    activeProfileId &&
      profileInstalled &&
      profileRunning &&
      !gatewayReady &&
      !showRestartUnhealthy,
  );

  const statusMessage =
    stream.historyLoadError ??
    (runtime.lastError
      ? runtime.lastError
      : resolving
        ? t("workspaces.chat.resolvingProfile", { defaultValue: "Resolving profile…" })
        : resolveError
          ? resolveError
          : resolved?.status === "not_deployed"
            ? t("workspaces.chat.notDeployed", {
                defaultValue: "Profile is not deployed on this machine.",
              })
            : "");

  const handleDropFiles = useCallback(
    (files: FileList) => {
      if (disabled || files.length === 0) return;
      void attachments.uploadFiles(files);
    },
    [attachments, disabled],
  );

  const handleViewSessions = useCallback(() => {
    setActiveNavItem("sessions");
  }, [setActiveNavItem]);

  const handleSend = useCallback(() => {
    const text = composer.text.trim();
    if (!composer.canSend(attachments.attachments.length > 0)) return;
    void stream.send(
      text,
      attachments.attachments.map((a) => a.id),
    );
    composer.clear();
  }, [attachments.attachments, composer, stream]);

  const handleWorkspaceSelect = useCallback(
    (id: string) => {
      if (id !== workspaceId) {
        void stream.cancel();
        attachments.clear();
        setWorkspaceId(id);
      }
    },
    [attachments, setWorkspaceId, stream, workspaceId],
  );

  const handleStartProfile = useCallback(() => {
    void runtime.start();
  }, [runtime]);

  const handleRestartProfile = useCallback(() => {
    void runtime.restart();
  }, [runtime]);

  return (
    <div className="workspaces-panel-root is-chat workspaces-webchat-root">
      <StatusToast message={statusMessage} />
      <ChatScrollArea
        messages={stream.messages}
        streamingContent={stream.streamingContent}
        activeTool={stream.activeTool}
        runState={stream.runState}
        lastError={stream.lastError}
        lastErrorDetails={stream.lastErrorDetails}
        lastUsage={stream.lastUsage}
        onApprove={stream.dismissApproval}
        onReject={() => void stream.cancel()}
        onRetry={() => void stream.retryLast()}
      />
      <ComposerBar
        profiles={profiles}
        activeProfileId={activeProfileId}
        onProfileSelect={setActiveProfileId}
        workspaceOptions={workspaceOptions.options}
        workspaceId={workspaceId}
        onWorkspaceSelect={handleWorkspaceSelect}
        displayModel={models.displayModel}
        modelGroups={models.modelGroups}
        gatewayReady={gatewayReady}
        modelStatus={models.status}
        modelsLoading={models.loading}
        onModelsOpen={() => void models.reload()}
        onModelSelect={(m) => void models.selectModel(m)}
        onSaveDefaultModel={() => void models.saveAsDefault()}
        attachments={attachments.attachments}
        onUploadAttachment={() => void attachments.upload()}
        onRemoveAttachment={(id) => void attachments.remove(id)}
        text={composer.text}
        onTextChange={composer.setText}
        imeComposing={composer.imeComposing}
        onImeComposing={composer.setImeComposing}
        canSendMessage={composer.canSend(attachments.attachments.length > 0)}
        disabled={disabled}
        runState={stream.runState}
        onSend={handleSend}
        onCancel={() => void stream.cancel()}
        onNewConversation={newConversation}
        onClear={() => {
          stream.clearMessages();
          composer.clear();
          attachments.clear();
        }}
        showPresetRequired={Boolean(activeProfileId && !profileInstalled)}
        showProfileStarting={Boolean(activeProfileId && profileInstalled && profileStarting)}
        showStartProfile={Boolean(
          activeProfileId && profileInstalled && profileStopped && !profileStarting,
        )}
        showGatewayWaiting={showGatewayWaiting}
        showRestartUnhealthy={showRestartUnhealthy}
        onStartProfile={handleStartProfile}
        onRestartProfile={handleRestartProfile}
        onDropFiles={handleDropFiles}
        onViewSessions={handleViewSessions}
      />
    </div>
  );
}
