import { Mic, Send, Square } from "lucide-react";
import { useI18n } from "../../../../components/useI18n";
import type { ChatAttachmentMeta } from "../../../../../../shared/workspace-chat/workspace-chat-contract";
import type { ChatRunState } from "../../types";
import { AttachmentTray } from "./AttachmentTray";
import { AttachmentMenu } from "./AttachmentMenu";
import { ModelSelector } from "./ModelSelector";
import { ProfileSelector } from "./ProfileSelector";
import { WorkspaceSelector } from "./WorkspaceSelector";
import { MoreActionsMenu } from "./MoreActionsMenu";
import type { WorkspaceOption } from "./hooks/useWorkspaceOptions";
import type { AIOSProfile } from "../../types";
import type { ModelGroup } from "./hooks/useChatModels";
import type { ChatModel } from "../../../../../../shared/workspace-chat/workspace-chat-contract";

export function ComposerBar({
  profiles,
  activeProfileId,
  onProfileSelect,
  displayModel,
  modelGroups,
  gatewayReady,
  modelStatus,
  modelsLoading,
  onModelsOpen,
  onModelSelect,
  onSaveDefaultModel,
  attachments,
  onUploadAttachment,
  onRemoveAttachment,
  text,
  onTextChange,
  imeComposing,
  onImeComposing,
  canSendMessage,
  disabled,
  runState,
  onSend,
  onCancel,
  onNewConversation,
  onClear,
  onViewSessions,
  showPresetRequired,
  showProfileStarting,
  showStartProfile,
  showGatewayWaiting,
  showRestartUnhealthy,
  onStartProfile,
  onRestartProfile,
  workspaceOptions,
  workspaceId,
  onWorkspaceSelect,
  onDropFiles,
}: {
  profiles: AIOSProfile[];
  activeProfileId: string | null;
  onProfileSelect: (id: string) => void;
  workspaceOptions: WorkspaceOption[];
  workspaceId: string | null;
  onWorkspaceSelect: (id: string) => void;
  onDropFiles?: (files: FileList) => void;
  displayModel: string;
  modelGroups: ModelGroup[];
  gatewayReady: boolean;
  modelStatus: string | null;
  modelsLoading: boolean;
  onModelsOpen: () => void;
  onModelSelect: (model: ChatModel) => void;
  onSaveDefaultModel: () => void;
  attachments: ChatAttachmentMeta[];
  onUploadAttachment: () => void;
  onRemoveAttachment: (id: string) => void;
  text: string;
  onTextChange: (value: string) => void;
  imeComposing: boolean;
  onImeComposing: (value: boolean) => void;
  canSendMessage: boolean;
  disabled: boolean;
  runState: ChatRunState;
  onSend: () => void;
  onCancel: () => void;
  onNewConversation: () => void;
  onClear: () => void;
  onViewSessions?: () => void;
  showPresetRequired?: boolean;
  showProfileStarting?: boolean;
  showStartProfile?: boolean;
  showGatewayWaiting?: boolean;
  showRestartUnhealthy?: boolean;
  onStartProfile?: () => void;
  onRestartProfile?: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const busy = runState === "streaming" || runState === "creating";

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey && !imeComposing) {
      e.preventDefault();
      if (!disabled && canSendMessage && !busy) onSend();
    }
  }

  function handleDragOver(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      onDropFiles?.(e.dataTransfer.files);
    }
  }

  return (
    <div
      className="workspaces-webchat-composer"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {showPresetRequired ? (
        <p className="workspaces-webchat-hint is-warning">
          {t("workspaces.chat.presetRequired", {
            defaultValue: "Install or deploy this profile before chatting.",
          })}
        </p>
      ) : null}
      {showProfileStarting ? (
        <p className="workspaces-webchat-hint">
          {t("workspaces.chat.profileStarting", { defaultValue: "Profile is starting…" })}
        </p>
      ) : null}
      {showStartProfile ? (
        <p className="workspaces-webchat-hint">
          {t("workspaces.chat.startProfile", { defaultValue: "Profile is stopped." })}{" "}
          <button type="button" className="workspaces-link-button" onClick={onStartProfile}>
            {t("workspaces.runtime.start", { defaultValue: "Start" })}
          </button>
        </p>
      ) : null}
      {showGatewayWaiting ? (
        <p className="workspaces-webchat-hint">
          {t("workspaces.chat.gatewayWaiting", {
            defaultValue: "Waiting for gateway to become ready…",
          })}
        </p>
      ) : null}
      {showRestartUnhealthy ? (
        <p className="workspaces-webchat-hint is-warning">
          {t("workspaces.chat.unhealthy", { defaultValue: "Gateway unhealthy." })}{" "}
          <button type="button" className="workspaces-link-button" onClick={onRestartProfile}>
            {t("workspaces.runtime.restart", { defaultValue: "Restart" })}
          </button>
        </p>
      ) : null}

      <AttachmentTray attachments={attachments} onRemove={onRemoveAttachment} />

      <textarea
        className="workspaces-webchat-input"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onCompositionStart={() => onImeComposing(true)}
        onCompositionEnd={() => onImeComposing(false)}
        onKeyDown={handleKeyDown}
        placeholder={t("workspaces.chat.placeholder", { defaultValue: "Message…" })}
        disabled={disabled || busy}
        rows={3}
      />

      <div className="workspaces-webchat-toolbar">
        <ProfileSelector
          profiles={profiles}
          activeProfileId={activeProfileId}
          onSelect={onProfileSelect}
        />
        <WorkspaceSelector
          options={workspaceOptions}
          workspaceId={workspaceId}
          onSelect={onWorkspaceSelect}
          disabled={disabled}
        />
        <ModelSelector
          displayModel={displayModel}
          modelGroups={modelGroups}
          gatewayReady={gatewayReady}
          status={modelStatus}
          loading={modelsLoading}
          onOpen={onModelsOpen}
          onSelect={onModelSelect}
          onSaveDefault={onSaveDefaultModel}
        />
        <AttachmentMenu disabled={disabled} onUpload={() => void onUploadAttachment()} />
        <button
          type="button"
          className="workspaces-action-button is-icon"
          disabled
          title={t("workspaces.chat.voiceComingSoon", { defaultValue: "Voice (coming soon)" })}
          aria-label={t("workspaces.chat.voiceComingSoon", { defaultValue: "Voice (coming soon)" })}
        >
          <Mic size={16} />
        </button>
        <MoreActionsMenu
          onNewConversation={onNewConversation}
          onClear={onClear}
          onViewSessions={onViewSessions}
        />
        <div className="workspaces-webchat-toolbar-spacer" />
        {busy ? (
          <button type="button" className="workspaces-webchat-stop" onClick={onCancel}>
            <Square size={14} />
            {t("workspaces.chat.stop", { defaultValue: "Stop" })}
          </button>
        ) : (
          <button
            type="button"
            className="workspaces-webchat-send"
            onClick={onSend}
            disabled={disabled || !canSendMessage}
          >
            <Send size={14} />
            {t("workspaces.chat.send", { defaultValue: "Send" })}
          </button>
        )}
      </div>
    </div>
  );
}
