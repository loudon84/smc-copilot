import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Loader2, Paperclip, Send, Square, X } from "lucide-react";
import type { HermesChatAttachmentMeta } from "../../../../../shared/hermes-default-chat/hermes-default-chat-contract";

function WebOperatorHermesPanelAttachmentTray({
  attachments,
  onRemove,
}: {
  attachments: HermesChatAttachmentMeta[];
  onRemove: (id: string) => void;
}): React.JSX.Element | null {
  if (attachments.length === 0) return null;
  return (
    <div className="web-operator-hermes-panel__attachment-tray">
      {attachments.map((att) => (
        <span key={att.id} className="web-operator-hermes-panel__attachment-chip">
          <span className="web-operator-hermes-panel__attachment-name" title={att.name}>
            {att.name}
          </span>
          <span className="web-operator-hermes-panel__attachment-meta">
            {Math.round(att.size_bytes / 1024)} KB
          </span>
          <button
            type="button"
            className="web-operator-hermes-panel__attachment-remove"
            onClick={() => void onRemove(att.id)}
            aria-label="移除附件"
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}

export function WebOperatorHermesPanelComposer({
  busy,
  disabled,
  attachments,
  onSend,
  onCancel,
  onUploadAttachment,
  onUploadDroppedAttachments,
  onRemoveAttachment,
  placeholder = "输入消息…（Enter 发送，Shift+Enter 换行）",
}: {
  busy: boolean;
  disabled?: boolean;
  attachments: HermesChatAttachmentMeta[];
  onSend: (text: string) => void;
  onCancel: () => void;
  onUploadAttachment: () => void;
  onUploadDroppedAttachments: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  placeholder?: string;
}): React.JSX.Element {
  const [value, setValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim().length > 0 || attachments.length > 0;

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

  const submit = useCallback(() => {
    const t = value.trim();
    if ((!t && attachments.length === 0) || busy || disabled) return;
    onSend(t);
    setValue("");
    if (taRef.current) taRef.current.style.height = "auto";
  }, [attachments.length, busy, disabled, onSend, value]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !busy) setDragOver(true);
  }, [busy, disabled]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (disabled || busy || e.dataTransfer.files.length === 0) return;
      onUploadDroppedAttachments(e.dataTransfer.files);
    },
    [busy, disabled, onUploadDroppedAttachments],
  );

  return (
    <div
      className={`web-operator-hermes-panel__composer${dragOver ? " is-drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <WebOperatorHermesPanelAttachmentTray
        attachments={attachments}
        onRemove={onRemoveAttachment}
      />
      <textarea
        ref={taRef}
        className="web-operator-hermes-panel__textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={busy || disabled}
        rows={2}
      />
      <div className="web-operator-hermes-panel__composer-actions">
        <button
          type="button"
          className="web-operator-hermes-panel__btn web-operator-hermes-panel__btn--upload"
          onClick={onUploadAttachment}
          disabled={busy || disabled}
          title="上传附件"
        >
          <Paperclip size={14} style={{ display: "inline", verticalAlign: "middle" }} /> 附件
        </button>
        {busy ? (
          <button type="button" className="web-operator-hermes-panel__btn" onClick={onCancel}>
            <Square size={14} style={{ display: "inline", verticalAlign: "middle" }} /> 停止
          </button>
        ) : null}
        <button
          type="button"
          className="web-operator-hermes-panel__btn web-operator-hermes-panel__btn--primary"
          onClick={submit}
          disabled={busy || disabled || !canSend}
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" style={{ display: "inline" }} />
          ) : (
            <Send size={14} style={{ display: "inline", verticalAlign: "middle" }} />
          )}{" "}
          发送
        </button>
      </div>
    </div>
  );
}
