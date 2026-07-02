import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useI18n } from "../../../../components/useI18n";
import { formatChatError } from "../../utils/formatChatError";
import { WorkChatContextBar } from "./components/work/WorkChatContextBar";
import { WorkComposerControls } from "./components/work/WorkComposerControls";
import { WorkExpertOutputPanel } from "./components/work/WorkExpertOutputPanel";
import { ChatScrollArea } from "./ChatScrollArea";
import { ComposerBar } from "./ComposerBar";
import { HermesActiveExpertBar } from "./components/HermesActiveExpertBar";
import { StatusToast } from "./StatusToast";
import { useHermesDefaultWebChat } from "./hooks/useHermesDefaultWebChat";
import { useWorkChatContext } from "./hooks/useWorkChatContext";
import { useRuntimeSkillSend } from "./hooks/useRuntimeSkillSend";
import { useExpertTaskStream } from "./hooks/useExpertTaskStream";
type Props = {
  forcedSessionId?: string | null;
  hideActiveExpertBar?: boolean;
};

export function HermesDefaultWebChatSurface({
  forcedSessionId,
  hideActiveExpertBar,
}: Props = {}): React.JSX.Element {
  const { t } = useI18n();
  const chat = useHermesDefaultWebChat(
    forcedSessionId !== undefined ? { forcedSessionId } : undefined,
  );
  const workContext = useWorkChatContext();
  const expertTaskStream = useExpertTaskStream();
  const { models, attachments, composer, stream, newConversation, viewSessions, modelId, activeSessionId } =
    chat;
  const runtimeSkillSend = useRuntimeSkillSend(workContext, {
    appendLocalMessage: stream.appendLocalMessage,
    setExternalRunState: stream.setExternalRunState,
    setLastError: stream.setLastError,
  }, expertTaskStream);
  const [search, setSearch] = useState("");
  const selectedModelId =
    models.pendingModel?.id ?? models.models.find((m) => m.is_current)?.id ?? null;

  const showWorkControls = !hideActiveExpertBar;

  const toast =
    stream.historyLoadError ??
    (stream.lastError
      ? formatChatError(stream.lastError)
      : stream.runState === "creating" || stream.runState === "streaming"
        ? t("workspaces.hermes.chat.generating", { defaultValue: "Generating…" })
        : "");

  const searchQuery = search.trim();
  const searchActive = searchQuery.length > 3;

  const visibleMessages = useMemo(() => {
    if (!searchActive) return stream.messages;
    const q = searchQuery.toLowerCase();
    return stream.messages.filter((m) => m.content.toLowerCase().includes(q));
  }, [searchActive, searchQuery, stream.messages]);

  const handleDropFiles = useCallback(
    (files: FileList) => {
      if (files.length === 0) return;
      void attachments.uploadFiles(files);
    },
    [attachments],
  );

  const handleSend = useCallback(() => {
    const text = composer.text.trim();
    if (!composer.canSend(attachments.attachments.length > 0)) return;
    const attachmentMetas = attachments.attachments;
    const attachmentIds = attachmentMetas.map((a) => a.id);

    if (workContext.useExpertGateway) {
      void runtimeSkillSend.sendToRuntimeSkill({
        text,
        attachmentIds,
        sessionId: activeSessionId,
        onComposerClear: () => {
          composer.clear();
          attachments.clear();
        },
      });
      return;
    }

    void stream.send(text, attachmentIds, modelId, attachmentMetas).then(() => {
      composer.clear();
      attachments.clear();
    });
  }, [
    activeSessionId,
    attachments,
    composer,
    runtimeSkillSend,
    modelId,
    stream,
    workContext.useExpertGateway,
  ]);

  const disabled = false;
  const busy = stream.runState === "streaming" || stream.runState === "creating";

  const handlePreviewArtifact = useCallback(
    (artifact: Parameters<typeof expertTaskStream.previewArtifact>[0]) => {
      void expertTaskStream.previewArtifact(artifact);
    },
    [expertTaskStream],
  );

  const handleDownloadArtifact = useCallback(
    (artifact: Parameters<typeof expertTaskStream.downloadArtifact>[0]) => {
      void expertTaskStream.downloadArtifact(artifact);
    },
    [expertTaskStream],
  );

  const showOutputPanel =
    expertTaskStream.selectedArtifact != null || expertTaskStream.artifacts.length > 0;

  useEffect(() => {
    const latest = expertTaskStream.timelines.at(-1);
    if (!latest) return;
    if (latest.status === "completed") {
      stream.setExternalRunState("completed");
    } else if (latest.status === "failed") {
      stream.setExternalRunState("error");
    }
  }, [expertTaskStream.timelines, stream]);

  return (
    <div className="hermes-panel-root is-chat hermes-webchat-root">      {!hideActiveExpertBar ? <HermesActiveExpertBar /> : null}
      <StatusToast message={toast} variant={stream.lastError ? "error" : "info"} />
      <div className="hermes-skills-tab__toolbar">
        <label className="hermes-skills-search">
          <Search size={14} aria-hidden />
          <input
            className="hermes-input hermes-skills-search__input"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("workspaces.hermes.chat.search.placeholder", {
              defaultValue: "Search messages",
            })}
            aria-label={t("workspaces.hermes.chat.search.placeholder", {
              defaultValue: "Search messages",
            })}
          />
        </label>
        {searchQuery.length > 0 && !searchActive ? (
          <p className="hermes-muted">
            {t("workspaces.hermes.chat.search.minLengthHint", {
              defaultValue: "Enter at least 4 characters to search.",
            })}
          </p>
        ) : null}
      </div>
      {showWorkControls ? <WorkChatContextBar context={workContext} /> : null}
      <div className={`hermes-webchat-main${showOutputPanel ? " has-expert-output" : ""}`}>
        <ChatScrollArea
        messages={visibleMessages}
        streamingContent={stream.streamingContent}
        activeTool={stream.activeTool}
        runState={stream.runState}
        lastError={stream.lastError}
        lastUsage={stream.lastUsage}
        expertTaskTimelines={expertTaskStream.timelines}
        onPreviewArtifact={handlePreviewArtifact}
        onDownloadArtifact={handleDownloadArtifact}
        emptyTitle={          searchActive
            ? t("workspaces.hermes.chat.search.noResultsTitle", { defaultValue: "No results" })
            : undefined
        }
        emptyHint={
          searchActive
            ? t("workspaces.hermes.chat.search.noResultsHint", {
                defaultValue: "Try a different keyword.",
              })
            : undefined
        }
      />
        {showOutputPanel ? (
          <WorkExpertOutputPanel
            artifacts={expertTaskStream.artifacts}
            selectedArtifact={expertTaskStream.selectedArtifact}
            previewContent={expertTaskStream.previewContent}
            previewLoading={expertTaskStream.previewLoading}
            onClose={() => expertTaskStream.setSelectedArtifact(null)}
            onSelectArtifact={(artifact) => void expertTaskStream.previewArtifact(artifact)}
          />
        ) : null}
      </div>
      <ComposerBar
        displayModel={models.displayModel}
        selectedModelId={selectedModelId}
        modelGroups={models.modelGroups}
        gatewayReady
        modelStatus={models.status}
        modelsLoading={models.loading}
        onModelsOpen={() => void models.reload()}
        onModelSelect={(m) => models.selectModel(m)}
        attachments={attachments.attachments}
        onUploadAttachment={() => void attachments.upload()}
        onRemoveAttachment={(id) => void attachments.remove(id)}
        text={composer.text}
        onTextChange={composer.setText}
        imeComposing={composer.imeComposing}
        onImeComposing={composer.setImeComposing}
        canSendMessage={composer.canSend(attachments.attachments.length > 0)}
        disabled={disabled || busy}
        runState={stream.runState}
        onSend={handleSend}
        onCancel={() => void stream.cancel()}
        onNewConversation={newConversation}
        onClear={() => {
          stream.clearMessages();
          composer.clear();
          attachments.clear();
        }}
        onDropFiles={handleDropFiles}
        onViewSessions={viewSessions}
        workControlsSlot={showWorkControls ? <WorkComposerControls context={workContext} /> : null}
      />
    </div>  );
}
