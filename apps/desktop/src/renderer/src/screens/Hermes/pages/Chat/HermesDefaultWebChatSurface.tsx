import { useCallback, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useI18n } from "../../../../components/useI18n";
import { formatChatError } from "../../utils/formatChatError";
import { WorkChatContextBar } from "./components/work/WorkChatContextBar";
import { WorkComposerControls } from "./components/work/WorkComposerControls";
import { PromptHintComposer } from "./components/PromptHintComposer";
import { TaskStatusBar } from "./components/TaskStatusBar";
import { ChatScrollArea } from "./ChatScrollArea";
import { ComposerBar } from "./ComposerBar";
import { HermesActiveExpertBar } from "./components/HermesActiveExpertBar";
import { StatusToast } from "./StatusToast";
import { useChatTaskWindow } from "./hooks/useChatTaskWindow";
import { useWorkChatContext } from "./hooks/useWorkChatContext";
import {
  buildExpertPromptHint,
  shouldBuildExpertPromptHint,
} from "./utils/buildExpertPromptHint";

type Props = {
  forcedSessionId?: string | null;
  hideActiveExpertBar?: boolean;
};

export function HermesDefaultWebChatSurface({
  forcedSessionId,
  hideActiveExpertBar,
}: Props = {}): React.JSX.Element {
  const { t } = useI18n();
  const workContext = useWorkChatContext();
  const chat = useChatTaskWindow({
    forcedSessionId,
    workContext,
  });
  const { models, attachments, composer, stream, newConversation, viewSessions, modelId, task } =
    chat;
  const [search, setSearch] = useState("");
  const [customPromptHint, setCustomPromptHint] = useState<string | null>(null);
  const selectedModelId =
    models.pendingModel?.id ?? models.models.find((m) => m.is_current)?.id ?? null;

  const showWorkControls = !hideActiveExpertBar;

  const promptHintInput = useMemo(() => {
    if (!workContext.selectedExpert || !workContext.selectedSkill) return null;
    return {
      expertName: workContext.selectedExpert.name,
      expertId: workContext.selectedExpert.slug,
      skillName: workContext.selectedSkill.name,
      mcpServerName: "nodeskclaw_expert_gateway",
      permissionMode: workContext.permissionMode,
    };
  }, [workContext.permissionMode, workContext.selectedExpert, workContext.selectedSkill]);

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

    let finalMessage = text;
    if (
      promptHintInput &&
      shouldBuildExpertPromptHint({
        expertName: promptHintInput.expertName,
        skillName: promptHintInput.skillName,
      })
    ) {
      finalMessage =
        customPromptHint ??
        buildExpertPromptHint({
          ...promptHintInput,
          userMessage: text,
        });
    }

    void stream.send(finalMessage, attachmentIds, modelId, attachmentMetas).then(() => {
      composer.clear();
      attachments.clear();
      setCustomPromptHint(null);
    });
  }, [attachments, composer, customPromptHint, modelId, promptHintInput, stream]);

  const disabled = false;
  const busy = stream.runState === "streaming" || stream.runState === "creating";

  return (
    <div className="hermes-panel-root is-chat hermes-webchat-root">
      {!hideActiveExpertBar ? <HermesActiveExpertBar /> : null}
      <TaskStatusBar
        title={task.title}
        status={task.status}
        expertName={task.expertName}
        skillName={task.skillName}
        profileId={task.profileId}
        durationMs={task.durationMs}
      />
     {/*
      <StatusToast message={toast} variant={stream.lastError ? "error" : "info"} />y
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
     */}
      {showWorkControls ? (
        <PromptHintComposer
          userMessage={composer.text}
          hintInput={promptHintInput}
          onHintChange={setCustomPromptHint}
        />
      ) : null}
      <div className="hermes-webchat-main">
        <ChatScrollArea
          messages={visibleMessages}
          streamingContent={stream.streamingContent}
          activeTool={stream.activeTool}
          toolProgressTimeline={chat.toolProgressTimeline}
          toolTimelineCollapsed={chat.timelineCollapsed}
          runState={stream.runState}
          lastError={stream.lastError}
          lastUsage={stream.lastUsage}
          taskStatus={task.status}
          taskTitle={task.title}
          taskDurationMs={task.durationMs}
          documentOutputs={chat.documentOutputs}
          emptyTitle={
            searchActive
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
          setCustomPromptHint(null);
        }}
        onDropFiles={handleDropFiles}
        onViewSessions={viewSessions}
        workControlsSlot={showWorkControls ? <WorkComposerControls context={workContext} /> : null}
      />
    </div>
  );
}
