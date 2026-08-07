import { Mic, Send, Square } from "lucide-react";
import { useI18n } from "../../../../components/useI18n";
import type {
  HermesChatAttachmentMeta,
  HermesChatModel,
} from "../../../../../../shared/hermes-default-chat/hermes-default-chat-contract";
import type { HermesChatRunState } from "../../types";
import { AttachmentTray } from "./AttachmentTray";
import { AttachmentMenu } from "./AttachmentMenu";
import { ModelSelector } from "./ModelSelector";
import { MoreActionsMenu } from "./MoreActionsMenu";
import type { ModelGroup } from "./hooks/useHermesDefaultChatModels";

export function ComposerBar({
  displayModel,
  selectedModelId,
  modelGroups,
  gatewayReady,
  modelStatus,
  modelsLoading,
  onModelsOpen,
  onModelSelect,
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
  onDropFiles,
  workControlsSlot,
}: {
  onDropFiles?: (files: FileList) => void;
  workControlsSlot?: React.ReactNode;
  displayModel: string;
  selectedModelId: string | null;
  modelGroups: ModelGroup[];
  gatewayReady: boolean;
  modelStatus: string | null;
  modelsLoading: boolean;
  onModelsOpen: () => void;
  onModelSelect: (model: HermesChatModel) => void;
  attachments: HermesChatAttachmentMeta[];
  onUploadAttachment: () => void;
  onRemoveAttachment: (id: string) => void;
  text: string;
  onTextChange: (value: string) => void;
  imeComposing: boolean;
  onImeComposing: (value: boolean) => void;
  canSendMessage: boolean;
  disabled: boolean;
  runState: HermesChatRunState;
  onSend: () => void;
  onCancel: () => void;
  onNewConversation: () => void;
  onClear: () => void;
  onViewSessions?: () => void;
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
    <div className="hermes-webchat-composer" onDragOver={handleDragOver} onDrop={handleDrop}>
      <AttachmentTray attachments={attachments} onRemove={onRemoveAttachment} />

      <textarea
        className="hermes-webchat-input"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onCompositionStart={() => onImeComposing(true)}
        onCompositionEnd={() => onImeComposing(false)}
        onKeyDown={handleKeyDown}
        placeholder={t("workspaces.hermes.chat.placeholder", { defaultValue: "Message…" })}
        disabled={disabled || busy}
        rows={3}
      />

      {workControlsSlot ? (
        <div className="hermes-webchat-work-controls">{workControlsSlot}</div>
      ) : null}

      <div className="hermes-webchat-toolbar">
        <ModelSelector
          displayModel={displayModel}
          selectedModelId={selectedModelId}
          modelGroups={modelGroups}
          gatewayReady={gatewayReady}
          status={modelStatus}
          loading={modelsLoading}
          onOpen={onModelsOpen}
          onSelect={onModelSelect}
        />
        <AttachmentMenu
          disabled={disabled}
          onUpload={() => {
            onUploadAttachment();
          }}
        />
        <button
          type="button"
          className="workspaces-action-button is-icon"
          disabled
          title={t("workspaces.hermes.chat.voiceComingSoon", { defaultValue: "Voice (coming soon)" })}
          aria-label={t("workspaces.hermes.chat.voiceComingSoon", {
            defaultValue: "Voice (coming soon)",
          })}
        >
          <Mic size={16} />
        </button>
        <MoreActionsMenu onNewConversation={onNewConversation} onClear={onClear} onViewSessions={onViewSessions} />
        <div className="hermes-webchat-toolbar-spacer" />
        {busy ? (
          <button type="button" className="hermes-webchat-stop" onClick={onCancel}>
            <Square size={14} />
            {t("workspaces.hermes.chat.stop", { defaultValue: "Stop" })}
          </button>
        ) : (
          <button
            type="button"
            className="hermes-webchat-send"
            onClick={onSend}
            disabled={disabled || !canSendMessage}
          >
            <Send size={14} />
            {t("workspaces.hermes.chat.send", { defaultValue: "Send" })}
          </button>
        )}
      </div>
    </div>
  );
}

